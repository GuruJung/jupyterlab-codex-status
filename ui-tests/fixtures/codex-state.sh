#!/usr/bin/env bash
set -euo pipefail

# The executable used to launch this script is copied to a file named `codex`,
# so the server observes a real foreground process whose basename is `codex`.
sleep 1
jltitle "fixture title"
sleep 1
printf '\033]2;Codex ⠋ \007'
sleep 2
printf '\033]2;Action Required\007'
sleep 60
