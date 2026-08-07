import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const u = username.trim();
    const p = password;
    if (!u) return "Username is required.";
    if (u.length < 3) return "Username must be at least 3 characters.";
    if (!p) return "Password is required.";
    if (p.length < 8) return "Password must be at least 8 characters.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    const validationErr = validate();
    if (validationErr) {
      setErr(validationErr);
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (e) {
      setErr(e?.response?.data?.error || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle background accent — a faint grid, evoking a monitored fleet */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          opacity: 0.25,
          maskImage: "radial-gradient(ellipse 60% 60% at 50% 40%, #000 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 60% at 50% 40%, #000 30%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px", position: "relative" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 28,
            }}
          >
            🛡
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>
            Triarch
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5 }}>
            Intelligent Patch Management &amp; Compliance
          </div>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>
            Authorized personnel only.
          </div>

          {err && (
            <div
              style={{
                padding: "10px 14px",
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

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={labelStyle}>Username</div>
              <input
                className="input"
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Enter username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErr("");
                }}
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <div style={labelStyle}>Password</div>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    paddingRight: 44,
                  }}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErr("");
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--muted)",
                  }}
                >
                  {showPassword ? (
                    // eye-off icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    // eye icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              className="btn"
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                marginTop: 8,
                fontSize: 14,
                fontWeight: 700,
                opacity: loading ? 0.7 : 1,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Forgot password — internal tool, admin-managed reset */}
          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid var(--line)",
              fontSize: 12.5,
              color: "var(--muted)",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            Forgot your password? Contact your system administrator to have it
            reset.
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 11,
            color: "var(--muted)",
            opacity: 0.7,
          }}
        >
          Access is monitored and logged.
        </div>
      </div>
    </div>
  );
}
