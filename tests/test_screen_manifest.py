from __future__ import annotations

from jupyterlab_codex_status.manifest import ManifestDetector, _predicate_matches, select_region
from jupyterlab_codex_status.screen import MAX_OSC_BYTES, TerminalScreen


def test_split_standard_and_custom_osc() -> None:
    titles: list[str | None] = []
    screen = TerminalScreen(on_title=titles.append)
    screen.feed("\x1b]2;Codex ⠋ ")
    assert screen.osc_title == ""
    screen.feed("\x1b\\")
    assert screen.osc_title == "Codex ⠋ "
    screen.feed("\x1b]1337;JupyterLabCodexStatus;SetTitle=dHJhaW5pbmcgam9i\x07")
    screen.feed("\x1b]1337;JupyterLabCodexStatus;ClearTitle\x1b\\")
    assert titles == ["training job", None]


def test_malformed_and_oversize_osc_do_not_escape() -> None:
    screen = TerminalScreen()
    screen.feed("\x1b]2;" + "x" * (MAX_OSC_BYTES + 1))
    screen.feed("plain output")
    assert "plain output" in screen.recent_text()


def test_manifest_priority_regions_and_skip_update() -> None:
    detector = ManifestDetector()
    screen = TerminalScreen()
    screen.feed("\x1b]2;Codex ⠋ \x07")
    assert detector.match(screen).state == "working"
    screen.feed("\x1b]2;Action Required\x07")
    assert detector.match(screen).state == "blocked"

    transcript = TerminalScreen()
    transcript.feed("› q to quit; esc to edit prev")
    result = detector.match(transcript)
    assert result.state == "unknown"
    assert result.skip_state_update


def test_resize_and_bounded_history() -> None:
    screen = TerminalScreen(columns=10, lines=2, history=200)
    for index in range(400):
        screen.feed(f"line {index}\r\n")
    screen.resize(20, 3)
    assert screen.columns == 20
    assert screen.lines == 3
    assert len(screen.recent_text().splitlines()) <= 203
    assert "Char(" not in screen.recent_text()
    assert "line 399" in screen.recent_text()


def test_manifest_predicate_gates_and_regions() -> None:
    value = "header\nREADY 42\nfooter"
    assert _predicate_matches({"contains": ["ready"]}, value)
    assert _predicate_matches({"regex": [r"READY\s+\d+"]}, value)
    assert _predicate_matches({"line_regex": [r"^READY 42$"]}, value)
    assert _predicate_matches(
        {
            "all": [{"contains": ["header"]}, {"contains": ["footer"]}],
            "any": [{"contains": ["missing"]}, {"contains": ["ready"]}],
            "not": [{"contains": ["blocked"]}],
        },
        value,
    )

    screen = TerminalScreen(columns=40, lines=6)
    screen.feed("one\r\ntwo\r\n› prompt\r\nafter\r\n")
    screen.feed("\x1b]2;Codex title\x07")
    assert select_region("osc_title", screen) == "Codex title"
    assert "after" in select_region("after_last_prompt_marker", screen)
    assert select_region("top_non_empty_lines(1)", screen) == "one"
    assert select_region("bottom_non_empty_lines(1)", screen) == "after"
