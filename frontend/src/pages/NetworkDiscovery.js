import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function NetworkDiscovery() {
  const [devices, setDevices] = useState([]);
  const [totals, setTotals] = useState({ total: 0, known: 0, unknown: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("all"); // all | known | unknown

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/discovery`);
      setDevices(res.data?.data || []);
      setTotals({
        total: res.data?.total || 0,
        known: res.data?.known || 0,
        unknown: res.data?.unknown || 0,
      });
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load discovered devices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runScan() {
    try {
      setScanning(true);
      setErr("");
      setMsg("");
      const res = await axios.post(`${API}/api/discovery/scan`);
      setMsg(
        `Scan complete: ${res.data?.found ?? 0} device(s) found (${res.data?.created ?? 0} new, ${res.data?.updated ?? 0} updated).`
      );
      await load();
    } catch (e) {
      setErr(e?.response?.data?.error || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const filtered = devices.filter((d) => {
    if (filter === "known") return d.known;
    if (filter === "unknown") return !d.known;
    return true;
  });

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  };

  return (
    <Layout
      title="Device Discovery"
rightControls={
  <>
    <button
      className="btn"
      onClick={async () => {
        if (!window.confirm("Clear all discovered device history? This can't be undone.")) return;
        try {
          await axios.delete(`${API}/api/discovery/clear`);
          setMsg("Cleared all discovered device records.");
          load();
        } catch (e) {
          setErr(e?.response?.data?.error || "Failed to clear");
        }
      }}
      style={{ fontSize: 12, padding: "6px 14px", color: "hsl(350,100%,65%)", borderColor: "hsla(350,100%,65%,0.3)" }}
    >
      Clear Results
    </button>
    <button
      className="btn"
      onClick={runScan}
      disabled={scanning}
      style={{ fontSize: 12, padding: "6px 14px", opacity: scanning ? 0.5 : 1 }}
    >
      {scanning ? "⟳ Scanning..." : "▶ Run Network Scan"}
    </button>
  </>
}
    >
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
      {msg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            background: "hsla(130,60%,50%,0.1)",
            border: "1px solid hsla(130,60%,50%,0.3)",
            color: "hsl(130,60%,50%)",
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "Total Devices", value: totals.total, color: "hsl(210,100%,60%)" },
          { key: "known", label: "Known (Enrolled)", value: totals.known, color: "hsl(130,60%,50%)" },
          { key: "unknown", label: "Unknown", value: totals.unknown, color: "hsl(350,100%,65%)" },
        ].map(({ key, label, value, color }) => (
          <div
            key={key}
            className="card"
            style={{
              flex: 1,
              minWidth: 150,
              padding: "14px 18px",
              cursor: "pointer",
              border: filter === key ? `1px solid ${color}` : undefined,
            }}
            onClick={() => setFilter(key)}
          >
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: value > 0 ? color : "inherit" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

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
          <div style={{ fontWeight: 800, fontSize: 15 }}>Devices Seen on Network</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {filtered.length} shown
          </div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading...</div>}
        {!loading && devices.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No scan results yet. Click "Run Network Scan" to sweep the subnet.
          </div>
        )}
        {!loading && devices.length > 0 && filtered.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No devices match this filter.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["IP Address", "Hostname", "MAC Address", "Vendor", "Status", "First Seen", "Last Seen"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr
                  key={d.ip}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none" }}
                >
                  <td style={{ padding: "14px 24px", fontWeight: 700, fontSize: 13 }}>{d.ip}</td>
                  <td style={{ padding: "14px 24px", fontSize: 13 }}>
                    {d.matchedHostname || d.hostname || "-"}
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {d.mac || "-"}
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {d.vendor || "-"}
                  </td>
                  <td style={{ padding: "14px 24px" }}>
                    {d.known ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: "hsla(130,60%,50%,0.15)",
                          border: "1px solid hsl(130,60%,50%)",
                          color: "hsl(130,60%,50%)",
                          textTransform: "uppercase",
                        }}
                      >
                        Known
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: "hsla(350,100%,65%,0.15)",
                          border: "1px solid hsl(350,100%,65%)",
                          color: "hsl(350,100%,65%)",
                          textTransform: "uppercase",
                        }}
                      >
                        Unknown
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {new Date(d.firstSeen).toLocaleString()}
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {new Date(d.lastSeen).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
