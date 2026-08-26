"""Jupyter Server extension setup."""

from __future__ import annotations

from jupyter_server.utils import url_path_join

from .handlers import TerminalsHandler, TerminalTitleHandler
from .service import TerminalService


def load_extension(serverapp: object) -> None:
    web_app = serverapp.web_app
    manager = web_app.settings.get("terminal_manager")
    service = TerminalService(manager, serverapp.log)
    web_app.settings["jupyterlab_codex_status_service"] = service
    base_url = web_app.settings.get("base_url", "/")
    prefix = url_path_join(base_url, "jupyterlab-codex-status", "api", "v1")
    web_app.add_handlers(
        ".*$",
        [
            (url_path_join(prefix, "terminals"), TerminalsHandler),
            (url_path_join(prefix, "terminals", r"([^/]+)", "title"), TerminalTitleHandler),
        ],
    )
    if service.available:
        serverapp.log.info("JupyterLab Codex Status server extension loaded")
    else:
        serverapp.log.warning("JupyterLab Codex Status degraded: %s", service.unavailable_reason)

