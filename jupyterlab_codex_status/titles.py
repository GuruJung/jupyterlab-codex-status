"""In-memory title validation and storage."""

from __future__ import annotations

import re

CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
SPACE_RE = re.compile(r"\s+", re.UNICODE)
MAX_TITLE_LENGTH = 80


def normalize_title(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("title must be a string")
    if CONTROL_RE.search(value):
        raise ValueError("title must not contain control characters")
    normalized = SPACE_RE.sub(" ", value.strip())
    if len(normalized) > MAX_TITLE_LENGTH:
        raise ValueError(f"title must be at most {MAX_TITLE_LENGTH} Unicode code points")
    return normalized


class TitleStore:
    """Titles intentionally live only for the server process lifetime."""

    def __init__(self) -> None:
        self._titles: dict[str, str] = {}

    def get(self, name: str) -> str | None:
        return self._titles.get(name)

    def set(self, name: str, title: object) -> str | None:
        normalized = normalize_title(title)
        if not normalized:
            self.clear(name)
            return None
        self._titles[name] = normalized
        return normalized

    def clear(self, name: str) -> None:
        self._titles.pop(name, None)

    def remove_terminal(self, name: str) -> None:
        self.clear(name)

