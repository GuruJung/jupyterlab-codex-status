"""The ``jltitle`` terminal-title helper."""

from __future__ import annotations

import argparse
import base64
import sys

from .titles import normalize_title

OSC_PREFIX = "\x1b]1337;JupyterLabCodexStatus;"
OSC_SUFFIX = "\x1b\\"


def title_sequence(title: str) -> str:
    normalized = normalize_title(title)
    if not normalized:
        return clear_sequence()
    payload = base64.urlsafe_b64encode(normalized.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{OSC_PREFIX}SetTitle={payload}{OSC_SUFFIX}"


def clear_sequence() -> str:
    return f"{OSC_PREFIX}ClearTitle{OSC_SUFFIX}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Set the current JupyterLab terminal title")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("title", nargs="?", help="title to display (empty clears it)")
    group.add_argument("--clear", action="store_true", help="clear the custom title")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not sys.stdout.isatty():
        print("jltitle: stdout is not a TTY", file=sys.stderr)
        return 2
    try:
        sequence = clear_sequence() if args.clear else title_sequence(args.title)
    except ValueError as error:
        print(f"jltitle: {error}", file=sys.stderr)
        return 2
    sys.stdout.write(sequence)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

