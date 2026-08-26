#!/usr/bin/env bash
set -euo pipefail

npm run build:prod
python -m pip install --no-deps -e .
temporary="$(mktemp -d)"
cleanup() {
  status=$?
  if [[ $status -ne 0 && -f "$temporary/jupyter.log" ]]; then
    printf '%s\n' '--- Jupyter server log (failure) ---' >&2
    tail -n 120 "$temporary/jupyter.log" >&2
  fi
  if [[ $status -ne 0 ]]; then
    for context in /work/test-results/*/error-context.md; do
      if [[ -f "$context" ]]; then
        printf '%s\n' "--- $context ---" >&2
        sed -n '1,220p' "$context" >&2
      fi
    done
  fi
  kill "${server_pid:-0}" 2>/dev/null || true
  rm -rf "$temporary"
  exit "$status"
}
trap cleanup EXIT
cp /bin/bash "$temporary/codex"
jupyter lab --no-browser --IdentityProvider.token='' --ServerApp.password='' \
  --ServerApp.disable_check_xsrf=True \
  --ServerApp.terminado_settings="{\"shell_command\":[\"$temporary/codex\",\"/work/ui-tests/fixtures/codex-state.sh\"]}" \
  --ServerApp.allow_root=True --ServerApp.port=8899 --ServerApp.port_retries=0 \
  --ServerApp.root_dir="$temporary" >"$temporary/jupyter.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8899/lab/api/settings >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8899/lab/api/settings >/dev/null
npm run test:e2e
