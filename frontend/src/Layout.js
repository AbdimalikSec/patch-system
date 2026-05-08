import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => "navItem" + (isActive ? " navItemActive" : "")}
      end
    >
      <span className="navIcon">{icon}</span>
      {label}
    </NavLink>
  );
}

const ICONS = {
  overview:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
  assets:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
  backlog:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  compliance: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>,
  evaluation: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>,
  users:      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
};

const ROLE_COLOR = {
  admin:   { bg: "hsla(210,100%,60%,0.15)", border: "hsl(210,100%,60%)", text: "hsl(210,100%,60%)" },
  analyst: { bg: "hsla(130,60%,50%,0.15)",  border: "hsl(130,60%,50%)",  text: "hsl(130,60%,50%)"  },
  auditor: { bg: "hsla(45,100%,50%,0.15)",  border: "hsl(45,100%,50%)",  text: "hsl(45,100%,50%)"  },
};

// ── Notification Bell Component ───────────────────────────────────────────────
function NotificationBell({ loginAt }) {
  const [open, setOpen]           = useState(false);
  const [notifications, setNoti]  = useState([]);
  const [loading, setLoading]     = useState(false);
  const dropdownRef               = useRef(null);
  const navigate                  = useNavigate();

  useEffect(() => {
    if (!loginAt) return;
    setLoading(true);
    axios.get(`${API}/api/notifications/new-failures?since=${encodeURIComponent(loginAt)}`)
      .then(res => setNoti(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loginAt]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const count = notifications.length;

  function handleNotificationClick(hostname) {
    setOpen(false);
    navigate(`/asset/${encodeURIComponent(hostname)}`);
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "relative",
          background: open ? "var(--accent-muted)" : "transparent",
          border: "1px solid var(--line)",
          borderRadius: 8,
          width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "var(--text)",
          transition: "all 0.15s",
        }}
        title={count > 0 ? `${count} new compliance failure${count > 1 ? "s" : ""} since login` : "No new failures since login"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {/* Red badge */}
        {count > 0 && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            background: "hsl(350,100%,65%)",
            color: "#fff", fontSize: 9, fontWeight: 800,
            borderRadius: "50%", width: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg)",
          }}>
            {count > 9 ? "9+" : count}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: 44, right: 0,
          width: 360, maxHeight: 480,
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          zIndex: 9999, overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid var(--line)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>New Failures Since Login</div>
            {count > 0 && (
              <div style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                background: "hsla(350,100%,65%,0.15)", color: "hsl(350,100%,65%)",
                border: "1px solid hsla(350,100%,65%,0.3)",
              }}>
                {count} new
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", maxHeight: 400 }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                Checking for new failures...
              </div>
            )}
            {!loading && count === 0 && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>All clear</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>No new compliance failures since you logged in.</div>
              </div>
            )}
            {!loading && count > 0 && notifications.map((n, i) => (
              <div
                key={i}
                onClick={() => handleNotificationClick(n.assetHostname)}
                style={{
                  padding: "12px 18px",
                  borderBottom: i < notifications.length - 1 ? "1px solid var(--line)" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                        background: "hsla(350,100%,65%,0.15)", color: "hsl(350,100%,65%)",
                        border: "1px solid hsla(350,100%,65%,0.3)", textTransform: "uppercase",
                      }}>
                        {n.assetHostname}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>Check {n.checkId}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: "var(--text)" }}>
                      {n.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", marginTop: 2 }}>
                    {new Date(n.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 18px", borderTop: "1px solid var(--line)",
            fontSize: 11, color: "var(--muted)", textAlign: "center",
          }}>
            Since {loginAt ? new Date(loginAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "login"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function Layout({ title, rightControls, children }) {
  const { user, logout, loginAt } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || "analyst";
  const rc = ROLE_COLOR[role] || ROLE_COLOR.analyst;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandName">RiskPatch</div>
          <div className="brandSub">Security Intelligence</div>
        </div>

        <div className="nav">
          {role === "auditor" ? (
            <NavItem to="/compliance" label="Compliance" icon={ICONS.compliance} />
          ) : (
            <>
              <NavItem to="/"           label="Overview"      icon={ICONS.overview}   />
              <NavItem to="/assets"     label="Assets"        icon={ICONS.assets}     />
              <NavItem to="/backlog"    label="Patch Backlog"  icon={ICONS.backlog}    />
              <NavItem to="/compliance" label="Compliance"    icon={ICONS.compliance} />
              <NavItem to="/evaluation" label="Evaluation"    icon={ICONS.evaluation} />
              {role === "admin" && (
                <NavItem to="/users" label="User Management" icon={ICONS.users} />
              )}
            </>
          )}
        </div>

        <div className="sidebarFooter">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: rc.bg, border: `1px solid ${rc.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 900, color: rc.text, flexShrink: 0,
            }}>
              {(user?.username || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.username}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {role}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "7px 12px", borderRadius: 6,
              background: "transparent", border: "1px solid var(--line)",
              color: "var(--muted)", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(350,100%,65%)"; e.currentTarget.style.color = "hsl(350,100%,65%)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--muted)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sign Out
          </button>

          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 10 }}>
            API: 10.10.20.30:5000
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar" style={{ position: "relative", zIndex: 100 }}>
          <div className="title">{title}</div>
          <div className="controls" style={{ display: "flex", alignItems: "center",  gap: 10 }}>
            {rightControls}
            {/* Notification bell — shown for all roles */}
            <NotificationBell loginAt={loginAt} />
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}