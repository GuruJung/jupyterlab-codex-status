"""Bounded terminal screen and OSC parsing."""

from __future__ import annotations

import base64
import binascii
import re
from collections.abc import Callable

import pyte

MAX_OSC_BYTES = 8192
OSC_START = "\x1b]"
OSC_TERMINATORS = ("\x07", "\x1b\\")


class TerminalScreen:
    """Incrementally mirrors a PTY without participating in its I/O contract."""

    def __init__(
        self,
        columns: int = 80,
        lines: int = 24,
        history: int = 200,
        on_title: Callable[[str | None], None] | None = None,
    ) -> None:
        self.columns = max(1, columns)
        self.lines = max(1, lines)
        self.history_limit = history
        self.screen = pyte.HistoryScreen(self.columns, self.lines, history=history)
        self.stream = pyte.Stream(self.screen)
        self.osc_title = ""
        self._pending = ""
        self._on_title = on_title

    def resize(self, columns: int, lines: int) -> None:
        columns, lines = max(1, columns), max(1, lines)
        if (columns, lines) == (self.columns, self.lines):
            return
        self.columns, self.lines = columns, lines
        self.screen.resize(lines=lines, columns=columns)

    def feed(self, data: str) -> None:
        """Feed output while containing malformed parser input."""
        if not isinstance(data, str):
            return
        combined = self._pending + data
        self._pending = ""
        cursor = 0
        while True:
            start = combined.find(OSC_START, cursor)
            if start < 0:
                self._safe_feed(combined[cursor:])
                break
            self._safe_feed(combined[cursor:start])
            end, size = self._find_osc_end(combined, start + len(OSC_START))
            if end < 0:
                tail = combined[start:]
                if len(tail.encode("utf-8", errors="ignore")) <= MAX_OSC_BYTES:
                    self._pending = tail
                # Drop an unterminated oversized OSC wholesale. Feeding it to
                # pyte would leave that parser inside OSC mode and swallow
                # otherwise valid output from the following PTY read.
                break
            raw = combined[start : end + size]
            payload = combined[start + len(OSC_START) : end]
            if len(payload.encode("utf-8", errors="ignore")) <= MAX_OSC_BYTES:
                self._handle_osc(payload)
            self._safe_feed(raw)
            cursor = end + size

    def _safe_feed(self, data: str) -> None:
        if not data:
            return
        try:
            self.stream.feed(data)
        except Exception:
            # Observing output must never interrupt the terminal's real clients.
            return

    @staticmethod
    def _find_osc_end(value: str, start: int) -> tuple[int, int]:
        bel = value.find(OSC_TERMINATORS[0], start)
        st = value.find(OSC_TERMINATORS[1], start)
        candidates = [(bel, 1), (st, 2)]
        candidates = [candidate for candidate in candidates if candidate[0] >= 0]
        return min(candidates) if candidates else (-1, 0)

    def _handle_osc(self, payload: str) -> None:
        if re.match(r"^[012];", payload):
            self.osc_title = payload.split(";", 1)[1]
            return
        prefix = "1337;JupyterLabCodexStatus;"
        if not payload.startswith(prefix) or self._on_title is None:
            return
        command = payload[len(prefix) :]
        if command == "ClearTitle":
            self._on_title(None)
            return
        if not command.startswith("SetTitle="):
            return
        encoded = command.removeprefix("SetTitle=")
        try:
            padding = "=" * (-len(encoded) % 4)
            decoded = base64.b64decode(encoded + padding, altchars=b"-_", validate=True)
            self._on_title(decoded.decode("utf-8"))
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return

    def recent_text(self) -> str:
        history = getattr(self.screen.history, "top", ())
        lines = [
            "".join(line[column].data for column in range(self.columns)).rstrip()
            for line in history
        ]
        lines.extend(line.rstrip() for line in self.screen.display)
        return "\n".join(lines[-(self.history_limit + self.lines) :])
