require("dotenv").config();

const WAZUH = process.env.WAZUH_API_URL;     // https://10.10.20.20:55000
const USER  = process.env.WAZUH_API_USER;    // riskpatch-api
const PASS  = process.env.WAZUH_API_PASS;    // passwordsS3*
const API   = process.env.RISKPATCH_API_URL || "http://127.0.0.1:5000";

if (!WAZUH || !USER || !PASS) {
  console.error("Missing Wazuh env vars in backend/.env (WAZUH_API_URL, WAZUH_API_USER, WAZUH_API_PASS)");
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

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

// Policy summary (totals)
async function getSCASummary(token, agentId) {
  const headers = { Authorization: `Bearer ${token}` };
  // This returns policy totals (pass/fail/score/total_checks)
  return fetchJson(`${WAZUH}/sca/${agentId}`, headers);
}

// Checks list (per check, includes pass/fail and metadata)
async function getSCAChecks(token, agentId) {
  const headers = { Authorization: `Bearer ${token}` };

  // Try to pull many checks. If your policy is large, Wazuh may paginate.
  // We'll do pagination loop until done (safe).
  const limit = 500;
  let offset = 0;
  let all = [];

  while (true) {
    const url = `${WAZUH}/sca/${agentId}/checks?limit=${limit}&offset=${offset}`;
    const data = await fetchJson(url, headers);
    const items = data?.data?.affected_items || [];
    all.push(...items);

    if (items.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // safety stop
  }

  return all;
}

function normalizeChecks(checkItems) {
  // Each item returned is a "check result" object.
  // Common fields: id, title, description, rationale, remediation, result/status, policy_id, references.
  const normalized = [];

  for (const c of checkItems) {
    const resultRaw = (c.result || c.status || c.state || "").toString().toLowerCase();
    const result =
      resultRaw.includes("fail") ? "failed" :
      resultRaw.includes("pass") ? "passed" :
      resultRaw.includes("invalid") ? "invalid" :
      (resultRaw || "unknown");

    normalized.push({
      id: c.id || c.check_id || c.rule_id || c.title || "unknown",
      title: c.title || c.name || c.description || "Unnamed check",
      rationale: c.rationale || c.description || "",
      remediation: c.remediation || c.fix || "",
      result,
      policy_id: c.policy_id || c.policy || null,
      references: c.references || null,
    });
  }

  return normalized;
}

function summarizeFromChecks(normalizedChecks, fallbackSummary) {
  const total = normalizedChecks.length || (fallbackSummary?.total_checks ?? null);

  const failed = normalizedChecks.filter(x => x.result === "failed");
  const passed = normalizedChecks.filter(x => x.result === "passed");
  const invalid = normalizedChecks.filter(x => x.result === "invalid");

  const failedCount = failed.length || (fallbackSummary?.fail ?? 0);
  const passCount = passed.length || (fallbackSummary?.pass ?? 0);

  // Prefer Wazuh "score" if provided; else compute
  let score = fallbackSummary?.score ?? null;
  if (score === null && total && total > 0) {
    score = Math.round(((total - failedCount) / total) * 100);
  }

  return {
    total: total ?? null,
    failedCount,
    pass: passCount,
    invalid: invalid.length,
    score,
    failedTitles: failed.map(x => `${x.id} — ${x.title}`).slice(0, 300),
  };
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

    for (const a of agents) {
      const hostname = a.name;
      const agentId = a.id;

      console.log(`[*] Pulling SCA summary for ${hostname} (id=${agentId})...`);
      let scaSummaryJson = null;
      try {
        scaSummaryJson = await getSCASummary(token, agentId);
      } catch (e) {
        console.log(`[!] Summary failed for ${hostname}: ${e.message}`);
      }

      // Pull per-check list
      console.log(`[*] Pulling SCA checks for ${hostname} (id=${agentId})...`);
      let checks = [];
      try {
        checks = await getSCAChecks(token, agentId);
      } catch (e) {
        console.log(`[!] Checks failed for ${hostname}: ${e.message}`);
      }

      const affected = scaSummaryJson?.data?.affected_items?.[0] || null;
      const normalized = normalizeChecks(checks);
      const summary = summarizeFromChecks(normalized, affected);

      const failedChecks = normalized.filter(x => x.result === "failed");

      const payload = {
        assetHostname: hostname,
        source: "wazuh",
        collectedAt: new Date().toISOString(),
        score: summary.score,
        failedCount: summary.failedCount,
        failed: [
          `CIS failed checks: ${summary.failedCount}/${summary.total ?? "?"}`,
          ...summary.failedTitles.slice(0, 50),
        ],
        raw: {
          source: "wazuh-sca",
          collectedAt: new Date().toISOString(),
          agent: a,
          sca: scaSummaryJson,
          summary,
          failedChecks: failedChecks.slice(0, 2000), // safety cap
        },
      };

      await postCompliance(payload);
      console.log(`[+] ${hostname}: stored (score=${summary.score}, failed=${summary.failedCount}, checks=${normalized.length})`);
    }

    console.log("[+] Done.");
  } catch (e) {
    console.error("[!] Error:", e.message);
    process.exit(1);
  }
})();

