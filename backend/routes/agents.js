const router  = require("express").Router();
const https   = require("https");

const WAZUH = process.env.WAZUH_API_URL;   // https://10.10.20.20:55000
const USER  = process.env.WAZUH_API_USER;  // riskpatch-api
const PASS  = process.env.WAZUH_API_PASS;  // passwordsS3*

// Skip TLS verification for lab environment
const agent = new https.Agent({ rejectUnauthorized: false });

async function getWazuhToken() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString("base64");
  const res   = await fetch(`${WAZUH}/security/user/authenticate`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    agent,
  });
  const data = await res.json();
  return data?.data?.token;
}

// GET /api/agents/status/:hostname
// Returns live agent status from Wazuh API
router.get("/status/:hostname", async (req, res) => {
  try {
    const token = await getWazuhToken();
    const wRes  = await fetch(
      `${WAZUH}/agents?search=${encodeURIComponent(req.params.hostname)}&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, agent }
    );
    const data   = await wRes.json();
    const agents = data?.data?.affected_items || [];

    // Find exact match by name (case-insensitive)
    const match = agents.find(
      a => a.name?.toLowerCase() === req.params.hostname.toLowerCase()
    );

    if (!match) {
      return res.json({ ok: true, data: null });
    }

    res.json({
      ok: true,
      data: {
        status:      match.status,           // "active" | "disconnected" | "never_connected"
        os:          match.os?.name || null,
        ip:          match.ip || null,
        lastKeepAlive: match.lastKeepAlive || match.dateAdd || null,
        version:     match.version || null,
        agentId:     match.id,
      },
    });
  } catch (e) {
    console.error("Agent status error:", e.message);
    res.status(500).json({ ok: false, error: "Failed to fetch agent status" });
  }
});

// GET /api/agents — list all agents with live status
router.get("/", async (req, res) => {
  try {
    const token = await getWazuhToken();
    const wRes  = await fetch(`${WAZUH}/agents?limit=500`, {
      headers: { Authorization: `Bearer ${token}` }, agent
    });
    const data   = await wRes.json();
    const agents = (data?.data?.affected_items || []).map(a => ({
      agentId:       a.id,
      hostname:      a.name,
      status:        a.status,
      os:            a.os?.name || null,
      ip:            a.ip || null,
      lastKeepAlive: a.lastKeepAlive || a.dateAdd || null,
      version:       a.version || null,
    }));
    res.json({ ok: true, count: agents.length, data: agents });
  } catch (e) {
    console.error("Agents list error:", e.message);
    res.status(500).json({ ok: false, error: "Failed to fetch agents" });
  }
});

module.exports = router;