#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
docker compose --profile package build package
docker compose --profile package run --rm package

