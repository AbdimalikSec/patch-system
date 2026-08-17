import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const CATEGORY_LABELS = {
  policy: "Policy",
  "training-record": "Training Record",
  "risk-assessment": "Risk Assessment",
  "disaster-recovery": "Disaster Recovery Plan",
  "audit-report": "Audit Report",
  other: "Other",
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function expiryStatus(expiresAt) {
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: "hsl(350,75%,50%)" };
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, color: "hsl(30,90%,45%)" };
  return null;
}

function UploadModal({ frameworks, onClose, onUploaded, presetFramework, presetControlId, presetControlName, presetCategory, supersedesId, supersedesFileName }) {
  const [framework, setFramework] = useState(presetFramework || frameworks[0]?.id || "iso27001");
  const [controls, setControls] = useState([]);
  const [loadingControls, setLoadingControls] = useState(true);
  const [controlId, setControlId] = useState(presetControlId || "");
  const [category, setCategory] = useState(presetCategory || "policy");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  // Every control offered here comes directly from the real, curated
  // framework file on the server -- scanned or not, nothing is ever
  // free-typed. Switching framework re-loads its real control list.
  useEffect(() => {
    let cancelled = false;
    async function loadControls() {
      setLoadingControls(true);
      try {
        const res = await axios.get(`${API}/api/compliance-evidence/controls`, { params: { framework } });
        if (!cancelled) {
          const list = res.data?.data || [];
          setControls(list);
          if (!presetControlId && list.length > 0 && !list.some((c) => c.controlId === controlId)) {
            setControlId(list[0].controlId);
          }
        }
      } catch (e) {
        if (!cancelled) setControls([]);
      } finally {
        if (!cancelled) setLoadingControls(false);
      }
    }
    loadControls();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framework]);

  const selectedControl = controls.find((c) => c.controlId === controlId);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setErr("Select a file first");
      return;
    }
    if (!controlId) {
      setErr("A control is required");
      return;
    }

    setUploading(true);
    setErr("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("framework", framework);
      formData.append("controlId", controlId);
      formData.append("controlName", selectedControl?.controlName || presetControlName || "");
      formData.append("category", category);
      formData.append("notes", notes);
      if (expiresAt) formData.append("expiresAt", expiresAt);
      if (supersedesId) formData.append("supersedes", supersedesId);

      await axios.post(`${API}/api/compliance-evidence`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded();
    } catch (e) {
      setErr(e?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 500, maxWidth: "90vw", padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
          {supersedesId ? "Upload New Version" : "Upload Compliance Evidence"}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
          {supersedesId
            ? `This will replace "${supersedesFileName}" — the old file stays on record as superseded, not deleted.`
            : "Attach a document to a real control from the framework below — every option here is a genuine, defined control, never free text."}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Framework</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                disabled={!!supersedesId}
              >
                {frameworks.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Control</div>
            {loadingControls ? (
              <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Loading real control list...</div>
            ) : (
              <select
                className="input"
                style={{ width: "100%" }}
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
                disabled={!!supersedesId}
              >
                {controls.map((c) => (
                  <option key={c.controlId} value={c.controlId}>
                    {c.controlId} — {c.controlName}{!c.scannable ? " (no scan coverage)" : ""}
                  </option>
                ))}
              </select>
            )}
            {selectedControl && !selectedControl.scannable && (
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                This control has no automated scan coverage — human-attested evidence is the only proof possible for it.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Category</div>
              <select className="input" style={{ width: "100%" }} value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Expires (optional)</div>
              <input type="date" className="input" style={{ width: "100%", boxSizing: "border-box" }}
                value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Notes (optional)</div>
            <input className="input" style={{ width: "100%", boxSizing: "border-box" }} placeholder="Context, review date, expiry, etc."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>File (PDF, Word, PNG, or JPEG — max 10MB)</div>
            <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files[0])} />
          </div>

          {err && (
            <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12,
              background: "hsla(350,75%,50%,0.08)", border: "1px solid hsla(350,75%,50%,0.25)", color: "hsl(350,75%,45%)" }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose}
              style={{ padding: "8px 16px", borderRadius: 6, background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit" disabled={uploading || loadingControls}
              style={{ padding: "8px 18px", borderRadius: 6, background: "var(--accent)", border: "none", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (uploading || loadingControls) ? 0.7 : 1 }}>
              {uploading ? "Uploading..." : supersedesId ? "Upload New Version" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ComplianceEvidence() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "compliance-officer";

  const [view, setView] = useState("documents");
  const [frameworks, setFrameworks] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [uploadTarget, setUploadTarget] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const [frameworksRes, evidenceRes, coverageRes] = await Promise.all([
        axios.get(`${API}/api/compliance-evidence/frameworks`),
        axios.get(`${API}/api/compliance-evidence`),
        axios.get(`${API}/api/compliance-evidence/coverage`),
      ]);
      setFrameworks(frameworksRes.data?.data || []);
      setEvidence(evidenceRes.data?.data || []);
      setCoverage(coverageRes.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load compliance evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDownload(record) {
    try {
      const res = await axios.get(`${API}/api/compliance-evidence/${record._id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = record.originalFileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download file");
    }
  }

  async function handleDelete(record) {
    if (!window.confirm(`Delete "${record.originalFileName}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/api/compliance-evidence/${record._id}`);
      load();
    } catch (e) {
      alert(e?.response?.data?.error || "Delete failed");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/api/compliance-evidence/export`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-evidence-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  }

  const grouped = evidence.reduce((acc, e) => {
    const key = `${e.framework || "iso27001"}::${e.controlId}`;
    if (!acc[key]) acc[key] = { framework: e.framework || "iso27001", controlId: e.controlId, controlName: e.controlName, items: [] };
    acc[key].items.push(e);
    return acc;
  }, {});
  const groups = Object.values(grouped).sort((a, b) => a.controlId.localeCompare(b.controlId));
  const gapCount = coverage.filter((c) => !c.hasEvidence).length;

  return (
    <Layout
      title="Compliance Evidence"
      rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>Refresh</button>
          <button className="btn" onClick={handleExport} disabled={exporting} style={{ fontSize: 12, padding: "6px 14px" }}>
            {exporting ? "Packaging..." : "Export for Audit"}
          </button>
          {canManage && (
            <button
              onClick={() => setUploadTarget({})}
              style={{ fontSize: 12, padding: "7px 16px", borderRadius: 7, fontWeight: 700, background: "var(--accent)", border: "none", color: "#000", cursor: "pointer" }}
            >
              + Upload Evidence
            </button>
          )}
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, maxWidth: 760 }}>
        Compliance evidence that no scanner can verify — signed policies, training records,
        disaster-recovery plans — linked directly to a real, defined control from the framework you select.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setView("documents")}
          className={`btn-tab ${view === "documents" ? "active" : ""}`}
          style={{ fontSize: 13, padding: "7px 16px" }}
        >
          Documents
        </button>
        <button
          onClick={() => setView("coverage")}
          className={`btn-tab ${view === "coverage" ? "active" : ""}`}
          style={{ fontSize: 13, padding: "7px 16px" }}
        >
          Coverage {gapCount > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: "hsla(350,75%,50%,0.15)", color: "hsl(350,75%,45%)" }}>
              {gapCount} gap{gapCount !== 1 ? "s" : ""}
            </span>
          )}
        </button>
      </div>

      {err && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13,
          background: "hsla(350,75%,50%,0.08)", border: "1px solid hsla(350,75%,50%,0.25)", color: "hsl(350,75%,45%)" }}>
          {err}
        </div>
      )}

      {loading && <div className="muted" style={{ padding: 20 }}>Loading...</div>}

      {!loading && view === "coverage" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Every control currently mapped from live scan data, and whether it has at least one active evidence document attached.
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th style={{ width: 100 }}>Control</th><th>Name</th><th style={{ width: 140 }}>Status</th></tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.controlId}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{c.controlId}</td>
                    <td style={{ fontSize: 12 }}>{c.controlName || c.domain || "—"}</td>
                    <td>
                      {c.hasEvidence ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 5, background: "hsla(145,55%,38%,0.12)", color: "hsl(145,55%,32%)" }}>
                          Covered
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 5, background: "hsla(350,75%,50%,0.12)", color: "hsl(350,75%,45%)" }}>
                          No evidence
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && view === "documents" && groups.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No evidence uploaded yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {canManage ? 'Click "+ Upload Evidence" to attach the first document.' : "Nothing has been uploaded yet."}
          </div>
        </div>
      )}

      {!loading && view === "documents" &&
        groups.map((g) => (
          <div key={`${g.framework}::${g.controlId}`} className="card" style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
              {g.controlId} {g.controlName && `— ${g.controlName}`}
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)", textTransform: "uppercase" }}>
                {frameworks.find((f) => f.id === g.framework)?.label || g.framework}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              {g.items.length} document{g.items.length !== 1 ? "s" : ""}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th style={{ width: 130 }}>Category</th>
                    <th style={{ width: 100 }}>Expiry</th>
                    <th style={{ width: 90 }}>Size</th>
                    <th style={{ width: 110 }}>Uploaded By</th>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((item) => {
                    const ex = expiryStatus(item.expiresAt);
                    return (
                      <tr key={item._id}>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>
                          {item.originalFileName}
                          {item.notes && <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>{item.notes}</div>}
                        </td>
                        <td style={{ fontSize: 11 }}>{CATEGORY_LABELS[item.category] || item.category}</td>
                        <td>
                          {ex ? (
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: `${ex.color}1F`, color: ex.color }}>
                              {ex.label}
                            </span>
                          ) : item.expiresAt ? (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(item.expiresAt).toLocaleDateString()}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{formatBytes(item.fileSize)}</td>
                        <td style={{ fontSize: 11 }}>{item.uploadedBy}</td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(item.uploadedAt).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => handleDownload(item)}
                              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer" }}>
                              Download
                            </button>
                            {canManage && (
                              <button
                                onClick={() => setUploadTarget({
                                  supersedesId: item._id,
                                  supersedesFileName: item.originalFileName,
                                  presetFramework: item.framework || "iso27001",
                                  presetControlId: item.controlId,
                                  presetControlName: item.controlName,
                                  presetCategory: item.category,
                                })}
                                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "hsla(210,90%,55%,0.1)", border: "1px solid hsla(210,90%,55%,0.3)", color: "hsl(210,90%,45%)", cursor: "pointer" }}
                              >
                                New Version
                              </button>
                            )}
                            {canManage && (
                              <button onClick={() => handleDelete(item)}
                                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "transparent", border: "1px solid hsla(350,75%,50%,0.3)", color: "hsl(350,75%,45%)", cursor: "pointer" }}>
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {uploadTarget && (
        <UploadModal
          frameworks={frameworks}
          supersedesId={uploadTarget.supersedesId}
          supersedesFileName={uploadTarget.supersedesFileName}
          presetFramework={uploadTarget.presetFramework}
          presetControlId={uploadTarget.presetControlId}
          presetControlName={uploadTarget.presetControlName}
          presetCategory={uploadTarget.presetCategory}
          onClose={() => setUploadTarget(null)}
          onUploaded={() => {
            setUploadTarget(null);
            load();
          }}
        />
      )}
    </Layout>
  );
}
