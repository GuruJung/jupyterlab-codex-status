#!/usr/bin/env bash
set -euo pipefail

temporary="$(mktemp -d)"
trap 'kill "${server_pid:-0}" 2>/dev/null || true; rm -rf "$temporary"' EXIT

python -m build --wheel --outdir "$temporary/dist"
python -m venv "$temporary/venv"
"$temporary/venv/bin/pip" install "$temporary"/dist/*.whl
"$temporary/venv/bin/jupyter" labextension list 2>&1 | tee "$temporary/labextensions.txt"
"$temporary/venv/bin/jupyter" server extension list 2>&1 | tee "$temporary/server-extensions.txt"
grep -q 'jupyterlab-codex-status' "$temporary/labextensions.txt"
grep -q 'jupyterlab_codex_status' "$temporary/server-extensions.txt"
"$temporary/venv/bin/python" - <<'PY'
from jupyterlab_codex_status import __version__
from jupyterlab_codex_status.manifest import load_manifest
assert __version__ == "0.1.2"
assert load_manifest()["version"] == "2026.08.09.1"
PY

"$temporary/venv/bin/jupyter" server --no-browser \
  --IdentityProvider.token='codex-status-smoke-token' --ServerApp.password='' \
  --ServerApp.allow_root=True \
  --ServerApp.port=8898 --ServerApp.port_retries=0 --ServerApp.root_dir="$temporary" \
  >"$temporary/server.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 60); do
  if curl -fsS -H 'Authorization: token codex-status-smoke-token' \
      http://127.0.0.1:8898/jupyterlab-codex-status/api/v1/terminals \
      >"$temporary/api.json"; then
    break
  fi
  sleep 1
done
curl -fsS -H 'Authorization: token codex-status-smoke-token' \
  http://127.0.0.1:8898/jupyterlab-codex-status/api/v1/terminals \
  >"$temporary/api.json"
unauthenticated_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  http://127.0.0.1:8898/jupyterlab-codex-status/api/v1/terminals)"
[[ "$unauthenticated_status" != 200 ]]
"$temporary/venv/bin/python" -c \
  'import json,sys; payload=json.load(open(sys.argv[1])); assert isinstance(payload["terminals"], list)' \
  "$temporary/api.json"

curl -fsS -H 'Authorization: token codex-status-smoke-token' \
  -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:8898/api/terminals >"$temporary/terminal.json"
terminal_name="$("$temporary/venv/bin/python" -c \
  'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$temporary/terminal.json")"
title_url="http://127.0.0.1:8898/jupyterlab-codex-status/api/v1/terminals/$terminal_name/title"
renamed_status="$(curl -sS -o "$temporary/renamed.json" -w '%{http_code}' \
  -X PUT -H 'Authorization: token codex-status-smoke-token' \
  -H 'Content-Type: application/json' -d '{"title":" smoke   title "}' "$title_url")"
[[ "$renamed_status" == 200 ]]
"$temporary/venv/bin/python" -c \
  'import json,sys; assert json.load(open(sys.argv[1]))["title"] == "smoke title"' \
  "$temporary/renamed.json"
invalid_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PUT -H 'Authorization: token codex-status-smoke-token' \
  -H 'Content-Type: application/json' -d '{"title":"bad\nname"}' "$title_url")"
[[ "$invalid_status" == 400 ]]
missing_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X DELETE -H 'Authorization: token codex-status-smoke-token' \
  http://127.0.0.1:8898/jupyterlab-codex-status/api/v1/terminals/missing/title)"
[[ "$missing_status" == 404 ]]
cleared_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X DELETE -H 'Authorization: token codex-status-smoke-token' "$title_url")"
[[ "$cleared_status" == 204 ]]
curl -fsS -o /dev/null -X DELETE -H 'Authorization: token codex-status-smoke-token' \
  "http://127.0.0.1:8898/api/terminals/$terminal_name"
