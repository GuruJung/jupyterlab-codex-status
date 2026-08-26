"""Terminal observation and cached state calculation."""

from __future__ import annotations

import asyncio
import time
import types
from dataclasses import dataclass
from typing import Any

from .manifest import ManifestDetector
from .processes import ProcessSnapshot
from .screen import TerminalScreen
from .titles import TitleStore


@dataclass
class ObservedTerminal:
    screen: TerminalScreen
    last_state: str = "idle"


class _Observer:
    size: tuple[None, None] = (None, None)

    def __init__(self, service: TerminalService, name: str) -> None:
        self.service = service
        self.name = name

    def on_pty_read(self, data: str) -> None:
        self.service.on_output(self.name, data)

    def on_pty_died(self) -> None:
        self.service.remove(self.name)


class TerminalService:
    CACHE_TTL_SECONDS = 0.5

    def __init__(self, manager: Any, log: Any) -> None:
        self.manager = manager
        self.log = log
        self.titles = TitleStore()
        self.detector = ManifestDetector()
        self.observed: dict[str, ObservedTerminal] = {}
        self._observers: dict[str, _Observer] = {}
        self._cache: tuple[float, list[dict[str, Any]]] | None = None
        self._inflight: asyncio.Task[list[dict[str, Any]]] | None = None
        self._generation = 0
        self._original_start_reading: Any = None
        self.available = self._compatible(manager)
        self.unavailable_reason = ""
        if not self.available:
            self.unavailable_reason = "compatible jupyter_server_terminals manager not found"
            return
        try:
            self._install_observer_hook()
            for name, pty in list(self.manager.terminals.items()):
                self._attach(name, pty)
        except Exception as error:
            self._degrade(f"incompatible terminal PTY internals: {error}")

    @staticmethod
    def _compatible(manager: Any) -> bool:
        return bool(
            manager is not None
            and isinstance(getattr(manager, "terminals", None), dict)
            and callable(getattr(manager, "start_reading", None))
        )

    def _install_observer_hook(self) -> None:
        service = self
        original = self.manager.start_reading
        self._original_start_reading = original

        def wrapped(manager: Any, pty: Any) -> Any:
            result = original(pty)
            name = getattr(pty, "term_name", None)
            if name and service.available:
                try:
                    service._attach(name, pty)
                except Exception as error:
                    service._degrade(f"incompatible terminal PTY internals: {error}")
            return result

        self.manager.start_reading = types.MethodType(wrapped, self.manager)

    def _attach(self, name: str, pty: Any) -> None:
        if name in self._observers:
            return
        clients = getattr(pty, "clients", None)
        if clients is None or not callable(getattr(clients, "append", None)):
            raise AttributeError("PtyWithClients.clients is unavailable")
        if getattr(pty, "ptyproc", None) is None:
            raise AttributeError("PtyWithClients.ptyproc is unavailable")
        try:
            rows, columns = pty.ptyproc.getwinsize()
        except (AttributeError, OSError):
            rows, columns = 24, 80
        observed = ObservedTerminal(
            TerminalScreen(
                columns,
                rows,
                history=200,
                on_title=lambda title: self._osc_title(name, title),
            )
        )
        self.observed[name] = observed
        observer = _Observer(self, name)
        clients.append(observer)
        self._observers[name] = observer
        self.invalidate()

    def _degrade(self, reason: str) -> None:
        if not self.available:
            return
        self.available = False
        self.unavailable_reason = reason
        if self._original_start_reading is not None:
            self.manager.start_reading = self._original_start_reading
        for name, observer in list(self._observers.items()):
            pty = self.manager.terminals.get(name)
            clients = getattr(pty, "clients", None)
            if clients is not None:
                try:
                    clients.remove(observer)
                except (AttributeError, ValueError):
                    pass
        self._observers.clear()
        self.observed.clear()
        self.titles = TitleStore()
        self.invalidate()
        self.log.warning("jupyterlab-codex-status unavailable: %s", reason)

    def _osc_title(self, name: str, title: str | None) -> None:
        try:
            if title is None:
                self.titles.clear(name)
            else:
                self.titles.set(name, title)
        except ValueError:
            return
        self.invalidate()

    def on_output(self, name: str, data: str) -> None:
        observed = self.observed.get(name)
        pty = self.manager.terminals.get(name)
        if observed is None or pty is None:
            return
        try:
            rows, columns = pty.ptyproc.getwinsize()
            observed.screen.resize(columns, rows)
        except (AttributeError, OSError, ValueError):
            pass
        try:
            observed.screen.feed(data)
        except Exception:
            self.log.warning("Codex status observer ignored a parser error", exc_info=True)
        self.invalidate()

    def remove(self, name: str) -> None:
        observer = self._observers.pop(name, None)
        pty = self.manager.terminals.get(name)
        if observer is not None and pty is not None:
            try:
                pty.clients.remove(observer)
            except ValueError:
                pass
        self.observed.pop(name, None)
        self.titles.remove_terminal(name)
        self.invalidate()

    def terminal_exists(self, name: str) -> bool:
        return self.available and name in self.manager.terminals

    def set_title(self, name: str, value: object) -> str | None:
        title = self.titles.set(name, value)
        self.invalidate()
        return title

    def clear_title(self, name: str) -> None:
        self.titles.clear(name)
        self.invalidate()

    def invalidate(self) -> None:
        self._generation += 1
        self._cache = None

    async def list_terminals(self) -> list[dict[str, Any]]:
        if not self.available:
            raise RuntimeError(self.unavailable_reason)
        now = time.monotonic()
        if self._cache is not None and now - self._cache[0] < self.CACHE_TTL_SECONDS:
            return self._cache[1]
        task = self._inflight
        if task is None:
            generation = self._generation
            task = asyncio.create_task(self._calculate_and_cache(generation))
            self._inflight = task
            task.add_done_callback(self._clear_inflight)
        return await asyncio.shield(task)

    async def _calculate_and_cache(self, generation: int) -> list[dict[str, Any]]:
        result = await self._calculate()
        if generation == self._generation:
            self._cache = (time.monotonic(), result)
        return result

    def _clear_inflight(self, task: asyncio.Task[list[dict[str, Any]]]) -> None:
        if self._inflight is task:
            self._inflight = None

    async def _calculate(self) -> list[dict[str, Any]]:
        snapshot = await asyncio.to_thread(ProcessSnapshot.capture)
        results: list[dict[str, Any]] = []
        for name, pty in list(self.manager.terminals.items()):
            if name not in self.observed:
                try:
                    self._attach(name, pty)
                except Exception as error:
                    self._degrade(f"incompatible terminal PTY internals: {error}")
                    raise RuntimeError(self.unavailable_reason) from error
            observed = self.observed.get(name)
            agent = snapshot.agent_for_pty(pty)
            state: str | None = None
            if agent == "codex" and observed is not None:
                match = self.detector.match(observed.screen)
                if not match.skip_state_update:
                    observed.last_state = match.state
                state = observed.last_state
            results.append(
                {
                    "name": name,
                    "title": self.titles.get(name),
                    "agent": agent,
                    "state": state,
                }
            )
        return results
