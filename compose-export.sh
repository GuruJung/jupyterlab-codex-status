#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [host-destination]\n' "${0##*/}" >&2
  exit 2
fi

destination="${1:-./dist-export}"
mkdir -p "$destination"
docker compose --profile package run --rm --no-deps --entrypoint sh package -c '
  set -- /artifacts/.[!.]* /artifacts/..?* /artifacts/*
  for path do
    if [ -e "$path" ] || [ -L "$path" ]; then exit 0; fi
  done
  exit 1
'
docker compose --profile package create --no-recreate package >/dev/null
docker compose cp "package:/artifacts/." "$destination"

