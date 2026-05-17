require("dotenv").config();

const WAZUH = process.env.WAZUH_API_URL;
const USER = process.env.WAZUH_API_USER;
const PASS = process.env.WAZUH_API_PASS;

const API = process.env.RISKPATCH_API_URL || "http://127.0.0.1:5000";

if (!WAZUH || !USER || !PASS) {
  console.error("Missing Wazuh env vars. Check /opt/risk-patch-system/patch-system/.env");
  process.exit(1);
}

async function wazuhLogin() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString("base64");

  const res = await fetch(`${WAZUH}/security/user/authenticate`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Wazuh auth failed: ${res.status} ${text}`);

  const data = JSON.parse(text);
  return data?.data?.token;
}

async function getAgents(token) {
  const res = await fetch(`${WAZUH}/agents?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Get agents failed: ${res.status} ${text}`);

  const data = JSON.parse(text);
  return data?.data?.affected_items || [];
}

async function postCompliance(payload) {
  const res = await fetch(`${API}/api/compliance/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`POST compliance failed: ${res.status} ${text}`);

  return JSON.parse(text);
}

(async () => {
  try {
    console.log("[*] Logging into Wazuh API:", WAZUH);
    const token = await wazuhLogin();
    if (!token) throw new Error("No token received from Wazuh.");

    console.log("[*] Fetching agents...");
    const agents = await getAgents(token);
    console.log(`[*] Agents found: ${agents.length}`);

    // Week-2 compliance baseline:
    // we store availability + agent metadata as compliance evidence
    for (const a of agents) {
      const hostname = a.name;              // should match your hostnames if you set agent name properly
      const isOnline = a.status === "active";

      const payload = {
        assetHostname: hostname,
        score: isOnline ? 100 : 70,
        failedCount: isOnline ? 0 : 1,
        failed: isOnline ? [] : ["agent_offline"],
        raw: {
          source: "wazuh-agents-baseline",
          collectedAt: new Date().toISOString(),
          agent: a,
        },
      };

      const out = await postCompliance(payload);
      console.log(`[+] ${hostname}: ${out.ok ? "stored" : "failed"}`);
    }

    console.log("[+] Done.");
  } catch (e) {
    console.error("[!] Error:", e.message);
    process.exit(1);
  }
})();

