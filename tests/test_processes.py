from __future__ import annotations

from types import SimpleNamespace

from jupyterlab_codex_status import processes
from jupyterlab_codex_status.processes import ProcessSnapshot, is_codex_process


def test_native_and_official_node_wrapper_are_detected() -> None:
    assert is_codex_process("codex", "/usr/bin/codex", ["codex"])
    assert is_codex_process(
        "node", "/usr/bin/node", ["node", "/opt/node_modules/@openai/codex/bin/codex.js"]
    )


def test_shell_and_arbitrary_codex_text_are_not_detected() -> None:
    assert not is_codex_process("bash", "/bin/bash", ["bash", "-c", "echo codex"])
    assert not is_codex_process("node", "/usr/bin/node", ["node", "/tmp/codex-helper.js"])
    assert not is_codex_process(
        "node", "/usr/bin/node", ["node", "/tmp/app.js", "@openai/codex"]
    )
    assert not is_codex_process(
        "node", "/usr/bin/node", ["node", "/tmp/codex/bin/codex.js"]
    )


def test_snapshot_ignores_process_races_and_matches_foreground_group(monkeypatch) -> None:
    entries = [
        SimpleNamespace(info={"pid": 10, "name": "codex", "exe": "/bin/codex", "cmdline": []}),
        SimpleNamespace(info={"pid": 11, "name": "bash", "exe": "/bin/bash", "cmdline": []}),
        SimpleNamespace(info={"pid": 12, "name": "codex", "exe": "/bin/codex", "cmdline": []}),
    ]
    monkeypatch.setattr(processes.psutil, "process_iter", lambda _fields: entries)

    def process_group(pid: int) -> int:
        if pid == 12:
            raise ProcessLookupError(pid)
        return 77

    monkeypatch.setattr(processes.os, "getpgid", process_group)
    snapshot = ProcessSnapshot.capture()
    assert snapshot.codex_groups == frozenset({77})

    pty = SimpleNamespace(ptyproc=SimpleNamespace(fd=9))
    monkeypatch.setattr(processes.os, "tcgetpgrp", lambda _fd: 77)
    assert snapshot.agent_for_pty(pty) == "codex"
    monkeypatch.setattr(processes.os, "tcgetpgrp", lambda _fd: 88)
    assert snapshot.agent_for_pty(pty) is None
    monkeypatch.setattr(
        processes.os,
        "tcgetpgrp",
        lambda _fd: (_ for _ in ()).throw(OSError("closed")),
    )
    assert snapshot.agent_for_pty(pty) is None
