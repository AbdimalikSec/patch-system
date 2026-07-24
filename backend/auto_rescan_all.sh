#!/bin/bash
cd /opt/risk-patch-system/patch-system/backend

echo "=== Auto-rescan cycle started: $(date) ==="

# Pull all enrolled agents from the database dynamically — every machine
# (including newly added ones) is included automatically, no per-machine edits.
AGENTS=$(mongosh riskpatchdb --quiet --eval '
  db.agents.find({ wazuhId: { $ne: "" }, enrolled: true }, { wazuhId: 1, hostname: 1, _id: 0 })
    .toArray()
    .map(a => a.wazuhId + " " + a.hostname)
    .join("\n")
')

if [ -z "$AGENTS" ]; then
  echo "[!] No enrolled agents found in database."
  echo "=== Auto-rescan cycle finished: $(date) ==="
  exit 0
fi

echo "$AGENTS" | while read -r WAZUHID HOSTNAME; do
  if [ -n "$WAZUHID" ] && [ -n "$HOSTNAME" ]; then
    echo ""
    echo ">>> Rescanning $HOSTNAME (agent $WAZUHID)"
    ./remediate_and_rescan.sh "$WAZUHID" "$HOSTNAME"
  fi
done

echo "=== Auto-rescan cycle finished: $(date) ==="
