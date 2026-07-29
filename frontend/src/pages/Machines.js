import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const CRITICALITY_OPTIONS = [
  { label: "Critical (1.0)", value: 1.0 },
  { label: "High (0.8)", value: 0.8 },
  { label: "Medium (0.6)", value: 0.6 },
  { label: "Normal (0.5)", value: 0.5 },
  { label: "Low (0.2)", value: 0.2 },
];

export default function Machines() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  // Form fields
  const [hostname, setHostname] = useState("");
  const [os, setOs] = useState("windows");
  const [ip, setIp] = useState("");
  const [role, setRole] = useState("workstation");
  const [criticality, setCriticality] = useState(0.5);
  const [exposureLevel, setExposureLevel] = useState("internal");
  const [deployMethod, setDeployMethod] = useState("agent");
  const [username, setUsername] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("/home/patch/.ssh/patch_key");

  // Generated script
  const [script, setScript] = useState("");
  const [scriptHost, setScriptHost] = useState("");
  const [copied, setCopied] = useState(false);

  // Delete confirm
  const [deleteHost, setDeleteHost] = useState(null);

  async function loadMachines() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/machines`);
      setMachines(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load machines");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMachines();
  }, []);

  // When OS changes, set a sensible default deploy method
  useEffect(() => {
    if (os === "linux") setDeployMethod("ssh");
    else setDeployMethod("agent");
  }, [os]);

  async function handleCreate() {
    if (!hostname.trim()) {
      setErr("Hostname is required.");
      return;
    }
    try {
      setCreating(true);
      setErr("");
      setSuccess("");
      const body = {
        hostname: hostname.trim(),
        os,
        ip: ip.trim(),
        role,
        criticality,
        exposureLevel,
        deployMethod,
        username: username.trim(),
        sshKeyPath: deployMethod === "ssh" ? sshKeyPath.trim() : "",
      };
      await axios.post(`${API}/api/machines`, body);
      setSuccess(`Machine "${hostname.trim()}" added. Generating enrollment script...`);

      // Immediately fetch the enrollment script
      const scriptRes = await axios.get(
        `${API}/api/machines/${encodeURIComponent(hostname.trim())}/enroll-script`
      );
      setScript(scriptRes.data?.script || "");
      setScriptHost(hostname.trim());

      // Reset form
      setHostname("");
      setIp("");
      setUsername("");
      setRole("workstation");
      setCriticality(0.5);
      setExposureLevel("internal");
      loadMachines();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to add machine");
    } finally {
      setCreating(false);
    }
  }

  async function handleShowScript(host) {
    try {
      setErr("");
      const res = await axios.get(
        `${API}/api/machines/${encodeURIComponent(host)}/enroll-script`
      );
      setScript(res.data?.script || "");
      setScriptHost(host);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to generate script");
    }
  }

  async function handleDelete(host) {
    try {
      setErr("");
      setSuccess("");
      await axios.delete(`${API}/api/machines/${encodeURIComponent(host)}`);
      setSuccess(`Machine "${host}" removed.`);
      setDeleteHost(null);
      if (scriptHost === host) {
        setScript("");
        setScriptHost("");
      }
      loadMachines();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to remove machine");
    }
  }

  function copyScript() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const needsCreds = deployMethod === "ssh";
  return (
    <Layout title="Machines">
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
      {success && (
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
          {success}
        </div>
      )}

      {/* Generated enrollment script */}
      {script && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              Enrollment Script for {scriptHost}
            </div>
            <button
              className="btn"
              onClick={copyScript}
              style={{ fontSize: 12, padding: "6px 14px" }}
            >
              {copied ? "✓ Copied" : "Copy Script"}
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Copy this script and run it ONCE on {scriptHost} as Administrator
            (Windows) or with sudo (Linux). It installs the Wazuh agent, the
            patch collector, and the RiskPatch agent, then registers the
            scheduled tasks. The machine will appear automatically once it
            checks in.
          </div>
          <pre
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 16,
              fontSize: 11,
              lineHeight: 1.5,
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {script}
          </pre>
        </div>
      )}

      {/* Add machine card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 20 }}>
          Add New Machine
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={labelStyle}>Hostname</div>
            <input
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="e.g. PHYS-WIN11"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
          </div>
          <div>
            <div style={labelStyle}>Operating System</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={os}
              onChange={(e) => setOs(e.target.value)}
            >
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>IP Address</div>
            <input
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="e.g. 192.168.0.70"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={labelStyle}>Role</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="workstation">Workstation</option>
              <option value="server">Server</option>
              <option value="domain controller">Domain Controller</option>
              <option value="security workstation">Security Workstation</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>Criticality</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={criticality}
              onChange={(e) => setCriticality(parseFloat(e.target.value))}
            >
              {CRITICALITY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Exposure</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={exposureLevel}
              onChange={(e) => setExposureLevel(e.target.value)}
            >
              <option value="internal">Internal</option>
              <option value="dmz">DMZ</option>
              <option value="internet">Internet-facing</option>
              <option value="isolated">Isolated</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: needsCreds ? "1fr 1fr 1fr" : "1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={labelStyle}>Deploy Method</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={deployMethod}
              onChange={(e) => setDeployMethod(e.target.value)}
            >
              {os === "windows" ? (
                <>
                  <option value="agent">Agent</option>
                </>
              ) : (
                <option value="ssh">SSH</option>
              )}
            </select>
          </div>
          {needsCreds && (
            <>
              <div>
                <div style={labelStyle}>Username</div>
                <input
                  className="input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder={deployMethod === "ssh" ? "e.g. stager" : "e.g. Administrator"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
                 <div>
                <div style={labelStyle}>SSH Key Path</div>
                <input
                  className="input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={sshKeyPath}
                  onChange={(e) => setSshKeyPath(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
            {deployMethod === "agent"
            ? "Agent method: patching is handled by the RiskPatch agent polling outward — no credentials stored."
            : "SSH method: uses an SSH key to reach the Linux machine for patching."}
        </div>

        <button
          className="btn"
          onClick={handleCreate}
          disabled={creating || !hostname.trim()}
          style={{
            padding: "10px 20px",
            opacity: creating || !hostname.trim() ? 0.5 : 1,
          }}
        >
          {creating ? "Adding..." : "Add Machine & Generate Script"}
        </button>
      </div>

      {/* Machines table */}
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>Registered Machines</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {machines.length} machine{machines.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading && (
          <div className="muted" style={{ padding: 24 }}>
            Loading machines...
          </div>
        )}
        {!loading && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Hostname", "OS", "IP", "Role", "Criticality", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 24px",
                        textAlign: h === "Actions" ? "center" : "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {machines.map((m, i) => (
                <tr
                  key={m._id}
                  style={{
                    borderBottom:
                      i < machines.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <td style={{ padding: "16px 24px", fontWeight: 700, fontSize: 14 }}>
                    {m.hostname}
                  </td>
                  <td style={{ padding: "16px 24px", fontSize: 13 }}>
                    {(m.os || "-").toUpperCase()}
                  </td>
                  <td
                    style={{ padding: "16px 24px", fontSize: 13, color: "var(--muted)" }}
                  >
                    {m.ip || "-"}
                  </td>
                  <td style={{ padding: "16px 24px", fontSize: 13 }}>{m.role}</td>
                  <td style={{ padding: "16px 24px", fontSize: 13 }}>
                    {m.criticality}
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 4,
                        background: m.enrolled
                          ? "hsla(130,60%,50%,0.15)"
                          : "hsla(45,100%,50%,0.15)",
                        border: `1px solid ${
                          m.enrolled ? "hsl(130,60%,50%)" : "hsl(45,100%,50%)"
                        }`,
                        color: m.enrolled ? "hsl(130,60%,50%)" : "hsl(45,100%,50%)",
                        textTransform: "uppercase",
                      }}
                    >
                      {m.enrolled ? "Enrolled" : "Pending"}
                    </span>
                  </td>
                  <td style={{ padding: "16px 24px", textAlign: "center" }}>
                    {deleteHost === m.hostname ? (
                      <div
                        style={{ display: "flex", gap: 8, justifyContent: "center" }}
                      >
                        <button
                          className="btn"
                          onClick={() => handleDelete(m.hostname)}
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            background: "hsl(350,100%,65%)",
                            color: "#fff",
                            border: "none",
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn"
                          onClick={() => setDeleteHost(null)}
                          style={{ fontSize: 11, padding: "5px 12px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{ display: "flex", gap: 8, justifyContent: "center" }}
                      >
                        <button
                          className="btn"
                          onClick={() => handleShowScript(m.hostname)}
                          style={{ fontSize: 11, padding: "5px 12px" }}
                        >
                          Script
                        </button>
                        <button
                          className="btn"
                          onClick={() => setDeleteHost(m.hostname)}
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            color: "hsl(350,100%,65%)",
                            borderColor: "hsla(350,100%,65%,0.3)",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
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
