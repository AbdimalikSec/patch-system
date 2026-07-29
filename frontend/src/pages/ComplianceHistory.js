import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";
import { Link } from "react-router-dom";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function resultBadge(result) {
  const r = (result || "").toLowerCase();
  if (r === "failed") return "badge critical";
  if (r === "passed") return "badge low";
  if (r === "not applicable") return "badge medium";
  return "badge";
}

export default function ComplianceHistory() {
  const [assets, setAssets] = useState([]);
  const [selectedHost, setSelectedHost] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoadingAssets(true);
        const res = await axios.get(`${API}/api/assets/overview`);
        const hostnames = (res.data?.data || []).map((a) => a.hostname);
        setAssets(hostnames);
        if (hostnames.length > 0) setSelectedHost(hostnames[0]);
      } catch {
        setErr("Failed to load asset list");
      } finally {
        setLoadingAssets(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedHost) return;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await axios.get(
          `${API}/api/compliance-history/${encodeURIComponent(selectedHost)}`,
        );
        setHistory(res.data?.data || []);
      } catch (e) {
        setErr(e?.response?.data?.error || "Failed to load compliance history");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedHost]);

  const filtered = history.filter((h) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(h.checkId || "").toLowerCase().includes(q) ||
      String(h.title || "").toLowerCase().includes(q)
    );
  });

  const fixedCount = history.filter(
    (h) => h.toResult === "passed" && h.fromResult === "failed",
  ).length;
  const regressedCount = history.filter(
    (h) => h.toResult === "failed" && h.fromResult === "passed",
  ).length;

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <Layout title="Compliance History">
      <div
        className="card"
        style={{
          marginBottom: 20,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: 220 }}>
          <div style={labelStyle}>Machine</div>
          <select
            className="input"
            style={{ width: "100%" }}
            value={selectedHost}
            onChange={(e) => setSelectedHost(e.target.value)}
            disabled={loadingAssets}
          >
            {assets.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={labelStyle}>Search check ID or title</div>
          <input
            className="input"
            style={{ width: "100%", boxSizing: "border-box" }}
            placeholder="e.g. guest account, 2.3.1.1..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {selectedHost && (
          <Link
            to={`/asset/${encodeURIComponent(selectedHost)}`}
            className="btn"
            style={{ fontSize: 12, padding: "8px 16px", textDecoration: "none" }}
          >
            View {selectedHost} →
          </Link>
        )}
      </div>

      {!loading && !err && history.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div className="card" style={{ padding: "10px 16px", minWidth: 100 }}>
            <div style={labelStyle}>Total Transitions</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{history.length}</div>
          </div>
          <div className="card" style={{ padding: "10px 16px", minWidth: 100 }}>
            <div style={labelStyle}>Fixes</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(130,60%,50%)" }}>
              {fixedCount}
            </div>
          </div>
          <div className="card" style={{ padding: "10px 16px", minWidth: 100 }}>
            <div style={labelStyle}>Regressions</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: regressedCount > 0 ? "hsl(350,100%,65%)" : "inherit",
              }}
            >
              {regressedCount}
            </div>
          </div>
        </div>
      )}

      {err && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            background: "hsla(350,100%,65%,0.1)",
            border: "1px solid hsla(350,100%,65%,0.3)",
            color: "hsl(350,100%,65%)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            Transition Timeline — {selectedHost || "..."}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {(loading || loadingAssets) && (
          <div className="muted" style={{ padding: 24 }}>
            Loading...
          </div>
        )}

        {!loading && !loadingAssets && filtered.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            {history.length === 0
              ? "No transitions recorded yet for this machine. History is written the next time a check's result genuinely changes (a fix or a regression), not on every scan."
              : "No transitions match your search."}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Check</th>
                  <th>Title</th>
                  <th style={{ width: 200 }}>Transition</th>
                  <th style={{ width: 170 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h._id}>
                    <td
                      className="mono"
                      style={{ color: "var(--accent)", fontSize: 12 }}
                    >
                      {h.checkId}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{h.title}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {h.fromResult ? (
                          <span className={resultBadge(h.fromResult)}>
                            {h.fromResult}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>
                            (first seen)
                          </span>
                        )}
                        <span style={{ color: "var(--muted)" }}>→</span>
                        <span className={resultBadge(h.toResult)}>{h.toResult}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(h.changedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
