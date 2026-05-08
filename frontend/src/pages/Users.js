import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const ROLE_COLOR = {
  admin:   { bg: "hsla(210,100%,60%,0.15)", border: "hsl(210,100%,60%)", text: "hsl(210,100%,60%)" },
  analyst: { bg: "hsla(130,60%,50%,0.15)",  border: "hsl(130,60%,50%)",  text: "hsl(130,60%,50%)"  },
  auditor: { bg: "hsla(45,100%,50%,0.15)",  border: "hsl(45,100%,50%)",  text: "hsl(45,100%,50%)"  },
};

function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] || ROLE_COLOR.analyst;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      textTransform: "uppercase", letterSpacing: "0.05em"
    }}>{role}</span>
  );
}

// ── Validation helpers ────────────────────────────────────────────────────────
function validateUsername(val) {
  if (!val || val.trim().length === 0) return "Username is required.";
  if (val.trim().length < 3) return "Username must be at least 3 characters.";
  if (val.trim().length > 32) return "Username must be 32 characters or fewer.";
  if (/^\d+$/.test(val.trim())) return "Username cannot be numbers only.";
  if (!/^[a-zA-Z0-9._-]+$/.test(val.trim())) return "Username can only contain letters, numbers, dots, hyphens, and underscores.";
  return "";
}

function validatePassword(val) {
  if (!val || val.length === 0) return "Password is required.";
  if (val.length < 8) return "Password must be at least 8 characters.";
  if (val.length > 128) return "Password is too long.";
  return "";
}

export default function Users() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [success, setSuccess]   = useState("");

  // New user form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState("analyst");
  const [creating, setCreating] = useState(false);

  // Inline field errors
  const [usernameErr, setUsernameErr] = useState("");
  const [passwordErr, setPasswordErr] = useState("");

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);

  async function loadUsers() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/auth/users`);
      setUsers(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function handleUsernameChange(e) {
    const val = e.target.value;
    setUsername(val);
    setUsernameErr(validateUsername(val));
  }

  function handlePasswordChange(e) {
    const val = e.target.value;
    setPassword(val);
    setPasswordErr(validatePassword(val));
  }

  async function handleCreate() {
    // Run full validation before submitting
    const uErr = validateUsername(username);
    const pErr = validatePassword(password);
    setUsernameErr(uErr);
    setPasswordErr(pErr);
    if (uErr || pErr) return;

    try {
      setCreating(true);
      setErr("");
      setSuccess("");
      await axios.post(`${API}/api/auth/users`, {
        username: username.trim().toLowerCase(),
        password,
        role
      });
      setSuccess(`User "${username.trim()}" created successfully.`);
      setUsername("");
      setPassword("");
      setUsernameErr("");
      setPasswordErr("");
      setRole("analyst");
      loadUsers();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id, uname) {
    try {
      setErr("");
      setSuccess("");
      await axios.delete(`${API}/api/auth/users/${id}`);
      setSuccess(`User "${uname}" deleted.`);
      setDeleteId(null);
      loadUsers();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to delete user");
    }
  }

  const formValid = !usernameErr && !passwordErr && username.trim().length > 0 && password.length > 0;

  return (
    <Layout title="User Management">
      {err && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 20,
          background: "hsla(350,100%,65%,0.1)", border: "1px solid hsla(350,100%,65%,0.3)",
          color: "hsl(350,100%,65%)", fontSize: 13
        }}>{err}</div>
      )}
      {success && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 20,
          background: "hsla(130,60%,50%,0.1)", border: "1px solid hsla(130,60%,50%,0.3)",
          color: "hsl(130,60%,50%)", fontSize: 13
        }}>{success}</div>
      )}

      {/* Create user card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 20 }}>Add New User</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 180px 120px", gap: 12, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Username</div>
            <input
              className="input" style={{ width: "100%", boxSizing: "border-box", borderColor: usernameErr ? "hsl(350,100%,65%)" : undefined }}
              placeholder="e.g. john.doe"
              value={username}
              onChange={handleUsernameChange}
            />
            {usernameErr && <div style={{ fontSize: 11, color: "hsl(350,100%,65%)", marginTop: 4 }}>{usernameErr}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</div>
            <input
              className="input" style={{ width: "100%", boxSizing: "border-box", borderColor: passwordErr ? "hsl(350,100%,65%)" : undefined }}
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={handlePasswordChange}
            />
            {passwordErr && <div style={{ fontSize: 11, color: "hsl(350,100%,65%)", marginTop: 4 }}>{passwordErr}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</div>
            <select
              className="input" style={{ width: "100%", boxSizing: "border-box" }}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="analyst">Analyst</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ paddingTop: 22 }}>
            <button
              className="btn"
              onClick={handleCreate}
              disabled={creating || !formValid}
              style={{ padding: "10px 16px", opacity: creating || !formValid ? 0.5 : 1, width: "100%" }}
            >
              {creating ? "Creating..." : "Add User"}
            </button>
          </div>
        </div>

        {/* Role descriptions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 }}>
          {[
            { role: "admin",   desc: "Full access including user management and all dashboards." },
            { role: "analyst", desc: "Full dashboard access. Cannot manage users." },
            { role: "auditor", desc: "Read-only access to compliance page only. Can export reports." },
          ].map(r => (
            <div key={r.role} style={{
              padding: "12px 14px", borderRadius: 8, background: "var(--surface)",
              border: `1px solid ${ROLE_COLOR[r.role].border}`,
            }}>
              <RoleBadge role={r.role} />
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>System Users</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{users.length} user{users.length !== 1 ? "s" : ""}</div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading users...</div>}
        {!loading && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "12px 24px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>User</th>
                <th style={{ padding: "12px 24px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</th>
                <th style={{ padding: "12px 24px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</th>
                <th style={{ padding: "12px 24px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u._id} style={{ borderBottom: i < users.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: ROLE_COLOR[u.role]?.bg,
                        border: `1px solid ${ROLE_COLOR[u.role]?.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 900, color: ROLE_COLOR[u.role]?.text
                      }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{u.username}</div>
                    </div>
                  </td>
                  <td style={{ padding: "16px 24px" }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: "16px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                  </td>
                  <td style={{ padding: "16px 24px", textAlign: "center" }}>
                    {deleteId === u._id ? (
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn" onClick={() => handleDelete(u._id, u.username)}
                          style={{ fontSize: 11, padding: "5px 12px", background: "hsl(350,100%,65%)", color: "#fff", border: "none" }}>
                          Confirm
                        </button>
                        <button className="btn" onClick={() => setDeleteId(null)}
                          style={{ fontSize: 11, padding: "5px 12px" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="btn" onClick={() => setDeleteId(u._id)}
                        style={{ fontSize: 11, padding: "5px 12px", color: "hsl(350,100%,65%)", borderColor: "hsla(350,100%,65%,0.3)" }}>
                        Delete
                      </button>
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