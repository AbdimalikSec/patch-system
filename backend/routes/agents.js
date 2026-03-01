const router = require("express").Router();
const axios  = require("axios");
const https  = require("https");

const WAZUH = process.env.WAZUH_API_URL;
const USER  = process.env.WAZUH_API_USER;
const PASS  = process.env.WAZUH_API_PASS;

// Skip TLS verification — lab environment
const wazuh = axios.create({
  baseURL: WAZUH,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 8000,
});

async function getWazuhToken() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString("base64");
  const res   = await wazuh.post("/security/user/authenticate", null, {
    headers: { Authorization: `Basic ${basic}` },
  });
  return res.data?.data?.token;
}

// GET /api/agents/status/:hostname — live status from Wazuh
router.get("/status/:hostname", async (req, res) => {
  try {
    const token = await getWazuhToken();
    const resp  = await wazuh.get(
      `/agents?search=${encodeURIComponent(req.params.hostname)}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const agents = resp.data?.data?.affected_items || [];

    // Exact name match (case-insensitive)
    const match = agents.find(
      a => (a.name || "").toLowerCase() === req.params.hostname.toLowerCase()
    );

    if (!match) {
      return res.json({ ok: true, data: null });
    }

    res.json({
      ok: true,
      data: {
        status:        match.status,
        os:            match.os?.name || null,
        ip:            match.ip || null,
        lastKeepAlive: match.lastKeepAlive || match.dateAdd || null,
        version:       match.version || null,
        agentId:       match.id,
      },
    });
  } catch (e) {
    console.error("[agents] status error:", e.message);
    res.status(500).json({ ok: false, error: "Failed to fetch agent status from Wazuh" });
  }
});

// GET /api/agents — all agents with live status
router.get("/", async (req, res) => {
  try {
    const token = await getWazuhToken();
    const resp  = await wazuh.get("/agents?limit=500", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const agents = (resp.data?.data?.affected_items || []).map(a => ({
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
    console.error("[agents] list error:", e.message);
    res.status(500).json({ ok: false, error: "Failed to fetch agents from Wazuh" });
  }
});

module.exports = router;