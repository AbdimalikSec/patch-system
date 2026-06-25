#!/bin/bash
cd /opt/risk-patch-system/patch-system/backend

echo "=== Auto-rescan cycle started: $(date) ==="

./remediate_and_rescan.sh 001 DC1
./remediate_and_rescan.sh 004 HQ-staff-01
./remediate_and_rescan.sh 005 kali

echo "=== Auto-rescan cycle finished: $(date) ==="
