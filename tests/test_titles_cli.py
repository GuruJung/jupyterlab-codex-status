from __future__ import annotations

import base64

import pytest

from jupyterlab_codex_status.cli import clear_sequence, title_sequence
from jupyterlab_codex_status.titles import TitleStore, normalize_title


def test_title_normalization_and_lifecycle() -> None:
    store = TitleStore()
    assert store.set("1", "  training\u2003 job  ") == "training job"
    assert store.get("1") == "training job"
    assert store.set("1", "  ") is None
    assert store.get("1") is None


@pytest.mark.parametrize("value", ["bad\nname", "bad\x7fname", "x" * 81, 42])
def test_title_validation(value: object) -> None:
    with pytest.raises(ValueError):
        normalize_title(value)


def test_jltitle_sequences_are_credential_free() -> None:
    sequence = title_sequence("훈련 작업")
    encoded = sequence.split("SetTitle=", 1)[1][:-2]
    decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
    assert decoded == "훈련 작업"
    assert clear_sequence() == "\x1b]1337;JupyterLabCodexStatus;ClearTitle\x1b\\"

