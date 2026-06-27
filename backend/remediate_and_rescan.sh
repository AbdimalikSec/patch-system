#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# remediate_and_rescan.sh
#
# Run this AFTER applying a remediation command on an endpoint.
# It will:
#   1. Authenticate to Wazuh API
#   2. Restart the agent (triggers SCA rescan)
#   3. Wait 90 seconds for scan to complete
#   4. Run the SCA collector to pull new results into MongoDB
#   5. Show the updated compliance score
#
# Usage:
#   ./remediate_and_rescan.sh <agent_id> <hostname>
#
# Examples:
#   ./remediate_and_rescan.sh 001 DC1
#   ./remediate_and_rescan.sh 004 HQ-STAFF-01
#   ./remediate_and_rescan.sh 005 kali
#
# Agent ID map:
#   001 = DC1
#   004 = HQ-STAFF-01
#   005 = kali
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

WAZUH_API="https://192.168.0.20:55000"
WAZUH_USER="riskpatch-api"
WAZUH_PASS="passwordsS3*"
BACKEND_DIR="/opt/risk-patch-system/patch-system/backend"
WAIT_SECONDS=90

# ── Args ───────────────────────────────────────────────────────────────────────
AGENT_ID="${1:-}"
HOSTNAME="${2:-}"

if [[ -z "$AGENT_ID" || -z "$HOSTNAME" ]]; then
  echo "Usage: $0 <agent_id> <hostname>"
  echo "  e.g: $0 001 DC1"
  echo "  e.g: $0 004 HQ-STAFF-01"
  echo "  e.g: $0 005 kali"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  RiskPatch — Remediation Rescan"
echo "  Agent: $AGENT_ID  |  Host: $HOSTNAME"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 1: Get Wazuh API token ────────────────────────────────────────────────
echo "[1/4] Authenticating to Wazuh API..."
TOKEN=$(curl -s -k -u "${WAZUH_USER}:${WAZUH_PASS}" -X POST \
  "${WAZUH_API}/security/user/authenticate" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

if [[ -z "$TOKEN" ]]; then
  echo "[!] Failed to get Wazuh API token. Check credentials."
  exit 1
fi
echo "[+] Authenticated."

# ── Step 2: Restart agent (triggers SCA rescan) ────────────────────────────────
echo ""
echo "[2/4] Restarting agent $AGENT_ID ($HOSTNAME) to trigger SCA rescan..."
RESULT=$(curl -s -k -X PUT \
  "${WAZUH_API}/agents/${AGENT_ID}/restart" \
  -H "Authorization: Bearer $TOKEN")

AFFECTED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['total_affected_items'])" 2>/dev/null || echo "0")

if [[ "$AFFECTED" == "1" ]]; then
  echo "[+] Agent restart command sent successfully."
else
  echo "[!] Warning: Agent restart may have failed."
  echo "    Response: $RESULT"
  echo "    Continuing anyway..."
fi

# ── Step 3: Wait for rescan to complete ────────────────────────────────────────
echo ""
echo "[3/4] Waiting ${WAIT_SECONDS}s for SCA rescan to complete..."
for i in $(seq 1 $WAIT_SECONDS); do
  printf "\r    [%3ds / %3ds]" "$i" "$WAIT_SECONDS"
  sleep 1
done
echo ""
echo "[+] Wait complete."

# ── Step 4: Pull new results into MongoDB ──────────────────────────────────────
echo ""
echo "[4/4] Running SCA collector to pull new results..."
cd "$BACKEND_DIR"
NODE_TLS_REJECT_UNAUTHORIZED=0 node collectors_wazuh_indexer_sca.js

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Done. Refresh the frontend to see updated"
echo "  compliance score for $HOSTNAME."
echo "═══════════════════════════════════════════════════"
echo ""
