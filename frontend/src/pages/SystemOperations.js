import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const JOBS = [
  { key: "compliance-rescan", title: "Compliance Rescan", desc: "Pulls fresh CIS SCA check results from the Wazuh Indexer into the compliance database." },
  { key: "cve-enrichment", title: "CVE Enrichment", desc: "Matches missing patches to CVEs via MSRC / Debian tracker and checks for public exploits." },
];

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }) {
  const map = {
    running: { bg: "hsla(45,100%,50%,0.15)", border: "hsl(45,100%,50%)", text: "hsl(45,100%,50%)", label: "⟳ Running" },
    success: { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)", label: "✓ Success" },
    failed: { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)", label: "✕ Failed" },
  };
  const c = map[status] || { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)", label: "Never run" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 12px",
        borderRadius: 4,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
      }}
    >
      {c.label}
    </span>
  );
}

function JobCard({ job }) {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");
  const [showOutput, setShowOutput] = useState(false);
  const pollRef = useRef(null);

  async function loadStatus() {
    try {
      const res = await axios.get(`${API}/api/system-ops/status/${job.key}`);
      setStatus(res.data?.job || null);
      return res.data?.job || null;
    } catch (e) {
      return null;
    }
  }

  useEffect(() => {
    loadStatus();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const j = await loadStatus();
      if (j && j.status !== "running") {
        clearInterval(pollRef.current);
      }
    }, 3000);
  }

  async function handleRun() {
    try {
      setStarting(true);
      setErr("");
      await axios.post(`${API}/api/system-ops/run/${job.key}`);
      await loadStatus();
      startPolling();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to start job");
    } finally {
      setStarting(false);
    }
  }

  const isRunning = status?.status === "running";

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{job.title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, maxWidth: 420 }}>
            {job.desc}
          </div>
        </div>
        <StatusBadge status={status?.status} />
      </div>

      {err && (
        <div style={{ fontSize: 12, color: "hsl(350,100%,65%)", marginBottom: 10 }}>{err}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
        <button
          className="btn"
          onClick={handleRun}
          disabled={isRunning || starting}
          style={{ padding: "8px 18px", fontSize: 13, opacity: isRunning || starting ? 0.5 : 1 }}
        >
          {isRunning ? "⟳ Running..." : starting ? "Starting..." : "▶ Run Now"}
        </button>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Last run: {status?.completedAt ? timeAgo(status.completedAt) : status?.startedAt ? "in progress" : "never"}
        </div>
        {status?.output && (
          <button
            className="btn"
            onClick={() => setShowOutput((s) => !s)}
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            {showOutput ? "Hide Output" : "View Output"}
          </button>
        )}
      </div>

      {showOutput && status?.output && (
        <pre
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 14,
            fontSize: 11,
            lineHeight: 1.5,
            overflow: "auto",
            maxHeight: 260,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginTop: 14,
          }}
        >
          {status.output}
        </pre>
      )}
    </div>
  );
}

export default function SystemOperations() {
  return (
    <Layout title="System Operations">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {JOBS.map((job) => (
          <JobCard key={job.key} job={job} />
        ))}
      </div>
    </Layout>
  );
}
