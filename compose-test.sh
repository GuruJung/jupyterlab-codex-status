#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

test_services=("$@")
if [[ ${#test_services[@]} -eq 0 ]]; then
  if ! configured_services="$(docker compose --profile test config --services)"; then
    printf 'Failed to discover Compose test services.\n' >&2
    exit 1
  fi
  while IFS= read -r service; do
    case "$service" in
      *-test) test_services+=("$service") ;;
    esac
  done <<< "$configured_services"
fi

if [[ ${#test_services[@]} -eq 0 ]]; then
  printf 'No runnable Compose test services were found; skipping.\n'
  exit 0
fi

docker compose --profile test build "${test_services[@]}"
for service in "${test_services[@]}"; do
  docker compose --profile test run --rm "$service"
done

