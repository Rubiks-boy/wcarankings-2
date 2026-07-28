#!/bin/sh
set -eu

if [ -z "${NTFY_TOPIC:-}" ]; then
  echo "NTFY_TOPIC is not configured; cannot send the WCA sync failure alert." >&2
  exit 1
fi

message="CubeRanks WCA ranking import failed on $(hostname) at $(date -Is). Check: journalctl -u wcarankings-sync.service"

/usr/bin/curl --fail --silent --show-error --retry 3 \
  -H "Title: CubeRanks WCA import failed" \
  -H "Priority: high" \
  -H "Tags: warning,database" \
  --data-binary "$message" \
  "https://ntfy.sh/$NTFY_TOPIC"
