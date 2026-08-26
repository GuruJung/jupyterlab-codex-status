"""Evaluator for the pinned Herdr Codex state manifest."""

from __future__ import annotations

import importlib.resources
import re
from dataclasses import dataclass
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10
    import tomli as tomllib

from .screen import TerminalScreen


@dataclass(frozen=True)
class MatchResult:
    state: str
    skip_state_update: bool = False


def load_manifest() -> dict[str, Any]:
    path = importlib.resources.files("jupyterlab_codex_status.data").joinpath("codex.toml")
    with path.open("rb") as stream:
        return tomllib.load(stream)


def _predicate_matches(predicate: dict[str, Any], value: str) -> bool:
    checks: list[bool] = []
    if "contains" in predicate:
        checks.append(any(item.casefold() in value.casefold() for item in predicate["contains"]))
    if "regex" in predicate:
        checks.append(any(re.search(pattern, value) is not None for pattern in predicate["regex"]))
    if "line_regex" in predicate:
        lines = value.splitlines()
        checks.append(
            any(
                re.search(pattern, line) is not None
                for pattern in predicate["line_regex"]
                for line in lines
            )
        )
    if "all" in predicate:
        checks.append(all(_predicate_matches(item, value) for item in predicate["all"]))
    if "any" in predicate:
        checks.append(any(_predicate_matches(item, value) for item in predicate["any"]))
    if "not" in predicate:
        checks.append(not any(_predicate_matches(item, value) for item in predicate["not"]))
    return bool(checks) and all(checks)


def _non_empty_lines(value: str) -> list[str]:
    return [line for line in value.splitlines() if line.strip()]


def select_region(region: str, screen: TerminalScreen) -> str:
    recent = screen.recent_text()
    if region == "osc_title":
        return screen.osc_title
    if region == "whole_recent":
        return recent
    if region == "after_last_prompt_marker":
        positions = [recent.rfind(marker) for marker in ("\n›", "\n❯", "\n> ")]
        position = max(positions)
        return recent[position + 1 :] if position >= 0 else recent
    match = re.fullmatch(r"(top|bottom)_non_empty_lines\((\d+)\)", region)
    if match:
        lines = _non_empty_lines(recent)
        count = int(match.group(2))
        selected = lines[:count] if match.group(1) == "top" else lines[-count:]
        return "\n".join(selected)
    return recent


class ManifestDetector:
    def __init__(self, manifest: dict[str, Any] | None = None) -> None:
        self.manifest = manifest or load_manifest()
        self.rules = sorted(
            self.manifest.get("rules", []),
            key=lambda item: item["priority"],
            reverse=True,
        )

    def match(self, screen: TerminalScreen) -> MatchResult:
        for rule in self.rules:
            value = select_region(rule.get("region", "whole_recent"), screen)
            if _predicate_matches(rule, value):
                return MatchResult(rule["state"], bool(rule.get("skip_state_update", False)))
        return MatchResult("idle")
