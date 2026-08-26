# jupyterlab-codex-status

[한국어](README_ko.md)

`jupyterlab-codex-status` is a prebuilt JupyterLab 4 extension that shows the state of Codex CLI processes running in JupyterLab-owned terminals. It also lets you assign an in-memory terminal title from the browser or from the terminal with `jltitle`.

The extension recognizes three Codex states:

- `idle`: Codex is ready for input.
- `working`: Codex is actively processing a request.
- `blocked`: Codex needs a confirmation or another user action.

Non-Codex terminals retain JupyterLab's normal terminal icon. A custom title and status appear in terminal tabs and the Running panel. Status is refreshed without overlapping requests; after a connection failure, the last known value remains visible and is marked as potentially stale.

## Requirements

- Python 3.10 or later
- JupyterLab 4.4 through 4.x (`>=4.4,<5`)
- Linux or macOS
- `jupyter_server_terminals` 0.5.x and `terminado` 0.18.x, installed by JupyterLab

Windows/ConPTY and Codex running behind SSH, tmux, or a nested container are not detected.

## Installation

Install from PyPI when a release is available:

```bash
python -m pip install jupyterlab-codex-status
```

Or install an exported wheel:

```bash
python -m pip install dist-export/jupyterlab_codex_status-0.1.0-py3-none-any.whl
```

Restart the JupyterLab **server** after installing, upgrading, or uninstalling this extension, then refresh open browser tabs. A server restart can interrupt running terminals and kernels, so choose an appropriate maintenance window. This is a prebuilt extension: `jupyter lab build` is not required, and restarting individual kernels is not required.

Verify both halves of the extension:

```bash
jupyter labextension list
jupyter server extension list
```

## Naming terminals

Choose **Rename Terminal…** from the command palette or a terminal's context menu. Submitting an empty value clears the custom title. Changes are held only in server memory and are shared with other browser sessions on their next poll.

From the terminal, write the dedicated OSC sequence safely with:

```bash
jltitle "training job"
jltitle --clear
```

`jltitle` fails if standard output is not a TTY. It emits no token or other authentication material. The most recent browser rename or `jltitle` command wins. Ordinary shell OSC title changes cannot overwrite a custom title.

## Configuration

Open JupyterLab's Settings Editor and select **Codex Terminal Status**. `pollIntervalMs` defaults to 1000 ms and accepts values from 500 to 10000 ms. Failed requests back off through 1, 2, 4, 8, 16, and 30 seconds; a successful request immediately restores the configured interval.

## Docker development

All supported build and automated test workflows run in finite Docker Compose services. They do not publish ports or bind-mount the repository.

```bash
docker compose config
./compose-test.sh
./compose-test.sh smoke-test
./compose-build.sh
./compose-export.sh
```

`compose-test.sh` discovers services ending in `-test`, builds them, and runs each with `docker compose run --rm`. Package output stays in an overrideable `artifacts` named volume until `compose-export.sh` copies it to `dist-export/`. Set `ARTIFACTS_VOLUME_NAME` to share or isolate that volume explicitly.

## Privacy and security

- API handlers use Jupyter Server authentication, base URL handling, and XSRF protection.
- The extension observes PTY output read-only. It never sends input or participates in terminal resize selection.
- Terminal screen history is bounded to 200 lines. Titles, screen content, and previous state remain only in server memory.
- PTY content and titles are not written to logs, files, or external networks.
- One process-table snapshot serves each calculation, and concurrent browser requests share a 500 ms cache and a single in-flight calculation.
- A missing or incompatible terminal subsystem degrades the API to HTTP 503 rather than preventing Jupyter Server startup.

The status result is a convenience indicator, not a security boundary. Process inspection may be unavailable because of platform permissions or process-exit races; those terminals show an unknown/non-Codex state.

## Limitations and troubleshooting

Codex must be the foreground process group of a PTY directly owned by this JupyterLab server. A command that merely contains the word `codex` is not enough. If status is absent:

1. Confirm both extension lists show enabled entries.
2. Restart the JupyterLab server and refresh the browser.
3. Confirm Codex is running directly in a JupyterLab terminal, not through SSH, tmux, or another container.
4. Check the browser network panel for `/jupyterlab-codex-status/api/v1/terminals`; HTTP 503 indicates an incompatible or missing terminal subsystem.

Uninstall and restart to restore the default UI:

```bash
python -m pip uninstall jupyterlab-codex-status
```

There is no persisted data or migration to remove.

## License and attribution

This project is licensed under the Apache License 2.0. It redistributes the Herdr Codex detection manifest version `2026.08.09.1`, pinned to commit `7ae4b056a0ca478e584fa282c45b528134cc80c9` and Git blob `9169e10848e0b3310e53fbf4e4e66b2817886623`; see [NOTICE](NOTICE). This project is not affiliated with or endorsed by OpenAI, Jupyter, or Herdr.

