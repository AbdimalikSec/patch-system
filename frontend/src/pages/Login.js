import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (e) {
      setErr(e?.response?.data?.error || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)"
    }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>

        {/* Logo / Title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 16px", fontSize: 28
          }}>🛡</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>RiskPatch</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Intelligent Patch Management & Compliance
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 24 }}>Sign in to your account</div>

          {err && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 20,
              background: "hsla(350,100%,65%,0.1)", border: "1px solid hsla(350,100%,65%,0.3)",
              color: "hsl(350,100%,65%)", fontSize: 13
            }}>
              {err}
            </div>
          )}

          <div onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Username
              </div>
              <input
                className="input"
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Enter username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Password
              </div>
              <input
                className="input"
                style={{ width: "100%", boxSizing: "border-box" }}
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit(e)}
              />
            </div>

            <button
              className="btn"
              onClick={handleSubmit}
              disabled={loading || !username || !password}
              style={{
                width: "100%", padding: "12px", marginTop: 8,
                fontSize: 14, fontWeight: 700,
                opacity: loading ? 0.7 : 1,
                background: "var(--accent)", color: "#fff", border: "none"
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--muted)" }}>
          RiskPatch — Final Year Project · Secure Access Only
        </div>
      </div>
    </div>
  );
}