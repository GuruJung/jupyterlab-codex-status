"""Foreground-only Codex process recognition."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import psutil


def is_codex_process(name: str, executable: str, command: list[str]) -> bool:
    basenames = {name.casefold(), Path(executable).name.casefold() if executable else ""}
    if "codex" in basenames or "codex.exe" in basenames:
        return True
    if not ({"node", "node.exe"} & basenames):
        return False
    if len(command) < 2:
        return False
    script = command[1].replace("\\", "/").casefold()
    return script.endswith("/@openai/codex/bin/codex.js")


@dataclass(frozen=True)
class ProcessSnapshot:
    codex_groups: frozenset[int]

    @classmethod
    def capture(cls) -> ProcessSnapshot:
        groups: set[int] = set()
        for process in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
            try:
                info = process.info
                if is_codex_process(
                    info.get("name") or "",
                    info.get("exe") or "",
                    info.get("cmdline") or [],
                ):
                    groups.add(os.getpgid(info["pid"]))
            except (OSError, psutil.Error):
                continue
        return cls(frozenset(groups))

    def agent_for_pty(self, pty: object) -> str | None:
        try:
            group = os.tcgetpgrp(pty.ptyproc.fd)
        except (AttributeError, OSError):
            return None
        return "codex" if group in self.codex_groups else None
