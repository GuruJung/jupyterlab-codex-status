#!/usr/bin/env bash
set -euo pipefail

# The executable used to launch this script is copied to a file named `codex`,
# so the server observes a real foreground process whose basename is `codex`.
sleep 1
jltitle "fixture title"
IFS= read -r _
printf '\033]2;Codex ⠋ \007'
IFS= read -r _
printf '\033]2;Codex\007'
printf '%s\r\n' \
  'Implement this plan?' \
  '' \
  '› 1. Yes, implement this plan          Switch to Default and start coding.' \
  '  2. Yes, clear context and implement  Fresh thread. Context: 28% used.' \
  '  3. No, stay in Plan mode             Continue planning with the model.' \
  '' \
  '  Press enter to confirm or esc to go back'
sleep 12
exit 0
