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

function UploadModal({ controls, onClose, onUploaded }) {
  const [mode, setMode] = useState("existing"); // "existing" or "custom"
  const [controlId, setControlId] = useState(controls[0]?.controlId || "");
  const [customControlId, setCustomControlId] = useState("");
  const [customControlName, setCustomControlName] = useState("");
  const [category, setCategory] = useState("policy");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setErr("Select a file first");
      return;
    }
    const finalControlId = mode === "custom" ? customControlId.trim() : controlId;
    if (!finalControlId) {
      setErr("A control ID is required");
      return;
    }

    setUploading(true);
    setErr("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("controlId", finalControlId);
      formData.append(
        "controlName",
        mode === "custom" ? customControlName : controls.find((c) => c.controlId === controlId)?.title || "",
      );
      formData.append("category", category);
      formData.append("notes", notes);

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
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 480, maxWidth: "90vw", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Upload Compliance Evidence</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
          Attach a document — a signed policy, training record, or plan — to a specific control.
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className={`btn-tab ${mode === "existing" ? "active" : ""}`}
              onClick={() => setMode("existing")}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              Pick a scanned control
            </button>
            <button
              type="button"
              className={`btn-tab ${mode === "custom" ? "active" : ""}`}
              onClick={() => setMode("custom")}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              Enter a control manually
            </button>
          </div>

          {mode === "existing" ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>
                Control (from live CIS/ISO mapping)
              </div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
              >
                {controls.map((c) => (
                  <option key={c.controlId} value={c.controlId}>
                    {c.controlId} — {c.title || c.domain}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                Only technical controls that already have at least one scanned check appear here. For
                organizational controls (e.g., People Controls) with no technical fingerprint, use "Enter
                manually" instead.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Control ID</div>
                <input
                  className="input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. 6.3"
                  value={customControlId}
                  onChange={(e) => setCustomControlId(e.target.value)}
                />
              </div>
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Control Name</div>
                <input
                  className="input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. Information Security Awareness, Education and Training"
                  value={customControlName}
                  onChange={(e) => setCustomControlName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Category</div>
            <select className="input" style={{ width: "100%" }} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Notes (optional)</div>
            <input
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="Context, review date, expiry, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>
              File (PDF, Word, PNG, or JPEG — max 10MB)
            </div>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          {err && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12,
              background: "hsla(350,75%,50%,0.08)", border: "1px solid hsla(350,75%,50%,0.25)", color: "hsl(350,75%,45%)",
            }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "8px 16px", borderRadius: 6, background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              style={{ padding: "8px 18px", borderRadius: 6, background: "var(--accent)", border: "none", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: uploading ? 0.7 : 1 }}
            >
              {uploading ? "Uploading..." : "Upload"}
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

  const [controls, setControls] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const [controlsRes, evidenceRes] = await Promise.all([
        axios.get(`${API}/api/compliance-evidence/controls`),
        axios.get(`${API}/api/compliance-evidence`),
      ]);
      setControls(controlsRes.data?.data || []);
      setEvidence(evidenceRes.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load compliance evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDownload(record) {
    try {
      const res = await axios.get(`${API}/api/compliance-evidence/${record._id}/download`, {
        responseType: "blob",
      });
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

  // Group evidence by control
  const grouped = evidence.reduce((acc, e) => {
    const key = e.controlId;
    if (!acc[key]) acc[key] = { controlId: e.controlId, controlName: e.controlName, items: [] };
    acc[key].items.push(e);
    return acc;
  }, {});
  const groups = Object.values(grouped).sort((a, b) => a.controlId.localeCompare(b.controlId));

  return (
    <Layout
      title="Compliance Evidence"
      rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          {canManage && (
            <button
              onClick={() => setShowUpload(true)}
              style={{
                fontSize: 12, padding: "7px 16px", borderRadius: 7, fontWeight: 700,
                background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
              }}
            >
              + Upload Evidence
            </button>
          )}
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, maxWidth: 760 }}>
        Compliance evidence that no scanner can verify — signed policies, training records,
        disaster-recovery plans — linked directly to the ISO 27001:2022 control they support.
        This is the human-attested layer sitting alongside scanned technical checks and the
        platform's own compliance evidence.
      </div>

      {err && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13,
          background: "hsla(350,75%,50%,0.08)", border: "1px solid hsla(350,75%,50%,0.25)", color: "hsl(350,75%,45%)",
        }}>
          {err}
        </div>
      )}

      {loading && <div className="muted" style={{ padding: 20 }}>Loading...</div>}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No evidence uploaded yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {canManage
              ? 'Click "+ Upload Evidence" to attach the first document.'
              : "Nothing has been uploaded yet."}
          </div>
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <div key={g.controlId} className="card" style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
              {g.controlId} {g.controlName && `— ${g.controlName}`}
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
                    <th style={{ width: 90 }}>Size</th>
                    <th style={{ width: 110 }}>Uploaded By</th>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((item) => (
                    <tr key={item._id}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>
                        {item.originalFileName}
                        {item.notes && (
                          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>{item.notes}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 11 }}>{CATEGORY_LABELS[item.category] || item.category}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{formatBytes(item.fileSize)}</td>
                      <td style={{ fontSize: 11 }}>{item.uploadedBy}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>
                        {new Date(item.uploadedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleDownload(item)}
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer" }}
                          >
                            Download
                          </button>
                          {canManage && (
                            <button
                              onClick={() => handleDelete(item)}
                              style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "transparent", border: "1px solid hsla(350,75%,50%,0.3)", color: "hsl(350,75%,45%)", cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {showUpload && (
        <UploadModal
          controls={controls}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}
    </Layout>
  );
}
