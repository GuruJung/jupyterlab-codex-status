"""JupyterLab Codex status server and prebuilt frontend extension."""

from __future__ import annotations

from ._version import __version__


def _jupyter_labextension_paths() -> list[dict[str, str]]:
    return [{"src": "labextension", "dest": "jupyterlab-codex-status"}]


def _jupyter_server_extension_points() -> list[dict[str, str]]:
    return [{"module": "jupyterlab_codex_status"}]


def _load_jupyter_server_extension(serverapp: object) -> None:
    from .server import load_extension

    load_extension(serverapp)


load_jupyter_server_extension = _load_jupyter_server_extension

__all__ = ["__version__"]

