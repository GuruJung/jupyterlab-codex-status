from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace

import pytest

from jupyterlab_codex_status.manifest import MatchResult
from jupyterlab_codex_status.processes import ProcessSnapshot
from jupyterlab_codex_status.service import TerminalService


class FakeProcess:
    fd = 10

    @staticmethod
    def getwinsize() -> tuple[int, int]:
        return 24, 80


class FakePty:
    def __init__(self, name: str = "1") -> None:
        self.term_name = name
        self.ptyproc = FakeProcess()
        self.clients: list[object] = []


class FakeManager:
    def __init__(self) -> None:
        self.terminals = {"1": FakePty()}

    def start_reading(self, pty: FakePty) -> None:
        return None


def test_observer_attaches_and_cleans_up() -> None:
    manager = FakeManager()
    service = TerminalService(manager, logging.getLogger("test"))
    assert len(manager.terminals["1"].clients) == 1
    observer = manager.terminals["1"].clients[0]
    observer.on_pty_read("\x1b]1337;JupyterLabCodexStatus;SetTitle=am9i\x07")
    assert service.titles.get("1") == "job"
    observer.on_pty_died()
    assert "1" not in service.observed
    assert service.titles.get("1") is None


def test_start_reading_hook_attaches_new_terminals() -> None:
    manager = FakeManager()
    service = TerminalService(manager, logging.getLogger("test"))
    new_pty = FakePty("2")
    manager.terminals["2"] = new_pty
    manager.start_reading(new_pty)
    assert "2" in service.observed
    assert len(new_pty.clients) == 1


def test_parser_errors_do_not_escape_observer(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = FakeManager()
    service = TerminalService(manager, logging.getLogger("test"))
    monkeypatch.setattr(
        service.observed["1"].screen,
        "feed",
        lambda _data: (_ for _ in ()).throw(RuntimeError("parser")),
    )
    service.on_output("1", "output")


@pytest.mark.asyncio
async def test_single_flight_and_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    service = TerminalService(FakeManager(), logging.getLogger("test"))
    calls = 0

    async def calculate() -> list[dict[str, object]]:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return []

    monkeypatch.setattr(service, "_calculate", calculate)
    assert await asyncio.gather(service.list_terminals(), service.list_terminals()) == [[], []]
    assert calls == 1
    assert await service.list_terminals() == []
    assert calls == 1


@pytest.mark.asyncio
async def test_cancelled_waiter_keeps_single_flight_registered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = TerminalService(FakeManager(), logging.getLogger("test"))
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def calculate() -> list[dict[str, object]]:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return []

    monkeypatch.setattr(service, "_calculate", calculate)
    first = asyncio.create_task(service.list_terminals())
    await started.wait()
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    second = asyncio.create_task(service.list_terminals())
    await asyncio.sleep(0)
    assert calls == 1
    release.set()
    assert await second == []
    assert calls == 1


def test_incompatible_pty_degrades_without_breaking_start_reading() -> None:
    manager = FakeManager()
    manager.terminals = {}
    service = TerminalService(manager, logging.getLogger("test"))
    incompatible = SimpleNamespace(term_name="2")
    manager.start_reading(incompatible)
    assert not service.available
    assert "PTY internals" in service.unavailable_reason
    assert manager.start_reading(incompatible) is None


def test_incompatible_manager_degrades() -> None:
    service = TerminalService(None, logging.getLogger("test"))
    assert not service.available
    assert "not found" in service.unavailable_reason


@pytest.mark.asyncio
async def test_skip_state_update_preserves_last_valid_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = TerminalService(FakeManager(), logging.getLogger("test"))

    class CodexSnapshot:
        @staticmethod
        def agent_for_pty(_pty: object) -> str:
            return "codex"

    monkeypatch.setattr(ProcessSnapshot, "capture", staticmethod(lambda: CodexSnapshot()))
    results = iter([MatchResult("working"), MatchResult("unknown", skip_state_update=True)])
    monkeypatch.setattr(service.detector, "match", lambda _screen: next(results))

    first = await service._calculate()
    second = await service._calculate()
    assert first[0]["state"] == "working"
    assert second[0]["state"] == "working"
