"""Authenticated REST handlers."""

from __future__ import annotations

from typing import Any

from jupyter_server.base.handlers import APIHandler
from tornado import web

from .service import TerminalService


class ServiceHandler(APIHandler):
    @property
    def terminal_service(self) -> TerminalService:
        return self.settings["jupyterlab_codex_status_service"]

    def ensure_available(self) -> None:
        if not self.terminal_service.available:
            raise web.HTTPError(503, reason=self.terminal_service.unavailable_reason)


class TerminalsHandler(ServiceHandler):
    @web.authenticated
    async def get(self) -> None:
        self.ensure_available()
        try:
            terminals = await self.terminal_service.list_terminals()
        except RuntimeError as error:
            raise web.HTTPError(503, reason=str(error)) from error
        self.finish({"terminals": terminals})


class TerminalTitleHandler(ServiceHandler):
    def ensure_terminal(self, name: str) -> None:
        self.ensure_available()
        if not self.terminal_service.terminal_exists(name):
            raise web.HTTPError(404, reason="terminal not found")

    @web.authenticated
    async def put(self, name: str) -> None:
        self.ensure_terminal(name)
        body: Any = self.get_json_body()
        if not isinstance(body, dict) or set(body) != {"title"}:
            raise web.HTTPError(400, reason='body must be {"title": string}')
        try:
            title = self.terminal_service.set_title(name, body["title"])
        except ValueError as error:
            raise web.HTTPError(400, reason=str(error)) from error
        self.finish({"name": name, "title": title})

    @web.authenticated
    async def delete(self, name: str) -> None:
        self.ensure_terminal(name)
        self.terminal_service.clear_title(name)
        self.set_status(204)
        self.finish()

