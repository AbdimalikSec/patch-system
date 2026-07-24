import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const ROLE_COLOR = {
  admin: { bg: "hsla(210,100%,60%,0.15)", border: "hsl(210,100%,60%)", text: "hsl(210,100%,60%)" },
  analyst: { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" },
  auditor: { bg: "hsla(45,100%,50%,0.15)", border: "hsl(45,100%,50%)", text: "hsl(45,100%,50%)" },
};

const ROLE_DESC = {
  admin: "Full access including user management and all dashboards.",
  analyst: "Full dashboard access. Cannot manage users.",
  auditor: "Read-only access to compliance page only. Can export reports.",
};

function validatePassword(val) {
  if (!val || val.length === 0) return "Password is required.";
  if (val.length < 8) return "Password must be at least 8 characters.";
  if (val.length > 128) return "Password is too long.";
  return "";
}

function ActionBadge({ action, success }) {
  let label = action;
  let c = { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)" };

  if (action === "login_success") {
    label = "Login Success";
    c = { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" };
  } else if (action === "login_failed") {
    label = "Login Failed";
    c = { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" };
  } else if (!success) {
    c = { bg: "hsla(25,100%,60%,0.15)", border: "hsl(25,100%,60%)", text: "hsl(25,100%,60%)" };
  } else {
    c = { bg: "hsla(210,100%,60%,0.15)", border: "hsl(210,100%,60%)", text: "hsl(210,100%,60%)" };
  }

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 4,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
      }}
    >
      {label}
    </span>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const [meRes, activityRes] = await Promise.all([
        axios.get(`${API}/api/auth/me`),
        axios.get(`${API}/api/user-activity/me`),
      ]);
      setMe(meRes.data?.user || null);
      setSummary(activityRes.data?.summary || null);
      setRecords(activityRes.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwErr("");
    setPwSuccess("");

    if (!currentPassword) {
      setPwErr("Current password is required.");
      return;
    }
    const vErr = validatePassword(newPassword);
    if (vErr) {
      setPwErr(vErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr("New password and confirmation do not match.");
      return;
    }

    try {
      setSaving(true);
      await axios.put(`${API}/api/auth/me/password`, { currentPassword, newPassword });
      setPwSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPwErr(e?.response?.data?.error || "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  const role = me?.role || user?.role || "analyst";
  const rc = ROLE_COLOR[role] || ROLE_COLOR.analyst;

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <Layout title="My Profile">
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

      {loading ? (
        <div className="muted" style={{ padding: 24 }}>Loading profile...</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: rc.bg,
                  border: `1px solid ${rc.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 900,
                  color: rc.text,
                  flexShrink: 0,
                }}
              >
                {(me?.username || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{me?.username}</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: rc.bg,
                    border: `1px solid ${rc.border}`,
                    color: rc.text,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {role}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              {ROLE_DESC[role]}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                marginTop: 20,
                paddingTop: 20,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div>
                <div style={labelStyle}>Successful Logins</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(130,60%,50%)" }}>
                  {summary?.logins ?? 0}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Actions Taken</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(210,100%,60%)" }}>
                  {summary?.actions ?? 0}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Last Login</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                  {summary?.lastLogin ? new Date(summary.lastLogin).toLocaleString() : "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>
              Change Password
            </div>
            {pwErr && (
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  marginBottom: 14,
                  background: "hsla(350,100%,65%,0.1)",
                  border: "1px solid hsla(350,100%,65%,0.3)",
                  color: "hsl(350,100%,65%)",
                  fontSize: 12,
                }}
              >
                {pwErr}
              </div>
            )}
            {pwSuccess && (
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  marginBottom: 14,
                  background: "hsla(130,60%,50%,0.1)",
                  border: "1px solid hsla(130,60%,50%,0.3)",
                  color: "hsl(130,60%,50%)",
                  fontSize: 12,
                }}
              >
                {pwSuccess}
              </div>
            )}
            <form
              onSubmit={handleChangePassword}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}
            >
              <div>
                <div style={labelStyle}>Current Password</div>
                <input
                  className="input"
                  type="password"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <div style={labelStyle}>New Password</div>
                <input
                  className="input"
                  type="password"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <div style={labelStyle}>Confirm New Password</div>
                <input
                  className="input"
                  type="password"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                className="btn"
                type="submit"
                disabled={saving}
                style={{ padding: "10px 20px", opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Saving..." : "Update Password"}
              </button>
            </form>
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
              <div style={{ fontWeight: 800, fontSize: 15 }}>My Recent Activity</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {records.length} record{records.length !== 1 ? "s" : ""}
              </div>
            </div>

            {records.length === 0 && (
              <div className="muted" style={{ padding: 24 }}>No activity recorded yet.</div>
            )}

            {records.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Action", "Path", "IP", "Time"].map((h) => (
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
                  {records.map((r, i) => (
                    <tr
                      key={r._id}
                      style={{ borderBottom: i < records.length - 1 ? "1px solid var(--line)" : "none" }}
                    >
                      <td style={{ padding: "12px 24px" }}>
                        <ActionBadge action={r.action} success={r.success} />
                      </td>
                      <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>
                        {r.path}
                      </td>
                      <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>
                        {r.ip}
                      </td>
                      <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
