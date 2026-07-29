import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "navItem" + (isActive ? " navItemActive" : "")
      }
      end
    >
      <span className="navIcon">{icon}</span>
      {label}
    </NavLink>
  );
}

function NavGroup({ group, role, expanded, onToggle }) {
  const visibleItems = group.items.filter((item) => item.roles.includes(role));
  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => onToggle(group.key)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px",
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="navIcon">{ICONS[group.icon]}</span>
        <span style={{ flex: 1 }}>{group.label}</span>
        <span
          style={{
            fontSize: 10,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 14 }}>
          {visibleItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={ICONS[item.icon]} />
          ))}
        </div>
      )}
    </div>
  );
}

const ICONS = {
  overview: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  ),
  assets: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  ),
  backlog: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  ),
  compliance: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 11 12 14 22 4"></polyline>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
  ),
  evaluation: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  users: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  network: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="6" height="6" rx="1"></rect>
      <rect x="16" y="2" width="6" height="6" rx="1"></rect>
      <rect x="9" y="16" width="6" height="6" rx="1"></rect>
      <path d="M5 8v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"></path>
      <line x1="12" y1="14" x2="12" y2="12"></line>
    </svg>
  ),
  groups: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      <path d="M21 21v-2a4 4 0 0 0-3-3.87"></path>
    </svg>
  ),
  tickets: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <line x1="10" y1="9" x2="8" y2="9"></line>
    </svg>
  ),
};

// ── Grouped nav structure — top-level standalone items + expandable groups ──
const NAV_STANDALONE = [
  { to: "/", label: "Overview", icon: "overview", roles: ["admin", "compliance-officer", "patch-operator", "analyst"] },
];

const NAV_GROUPS = [
  {
    key: "patch",
    label: "Patch Management",
    icon: "backlog",
    items: [
      { to: "/backlog", label: "Patch Backlog", icon: "backlog", roles: ["admin", "compliance-officer", "patch-operator", "analyst"] },
      { to: "/patch-log", label: "Patch Log", icon: "evaluation", roles: ["admin", "compliance-officer", "patch-operator", "analyst"] },
      { to: "/patch-velocity-report", label: "Patch Velocity Report", icon: "evaluation", roles: ["admin", "compliance-officer", "patch-operator", "analyst"] },
    ],
  },
  {
    key: "compliance",
    label: "Compliance & Risk",
    icon: "compliance",
    items: [
      { to: "/compliance", label: "Compliance", icon: "compliance", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
      { to: "/compliance-history", label: "Compliance History", icon: "evaluation", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
      { to: "/vulnerabilities", label: "Vulnerabilities", icon: "compliance", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
      { to: "/tickets", label: "Tickets", icon: "tickets", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
      { to: "/resolution-report", label: "Resolution Report", icon: "evaluation", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
      { to: "/compliance-trend-report", label: "Compliance Trend Report", icon: "evaluation", roles: ["admin", "compliance-officer", "analyst", "auditor"] },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    icon: "assets",
    items: [
      { to: "/assets", label: "Assets", icon: "assets", roles: ["admin", "compliance-officer", "patch-operator", "analyst"] },
      { to: "/groups", label: "Asset Groups", icon: "groups", roles: ["admin", "compliance-officer", "analyst"] },
      { to: "/network", label: "Network Map", icon: "network", roles: ["admin", "compliance-officer", "analyst"] },
    ],
  },
  {
    key: "monitoring",
    label: "Audit & Monitoring",
    icon: "users",
    items: [
      { to: "/audit-log", label: "Audit Log", icon: "users", roles: ["admin", "auditor"] },
      { to: "/user-activity", label: "User Activity", icon: "users", roles: ["admin", "analyst"] },
      { to: "/login-report", label: "Login & Access Report", icon: "evaluation", roles: ["admin", "analyst"] },
      { to: "/discovery", label: "Device Discovery", icon: "network", roles: ["admin"] },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    icon: "users",
    items: [
      { to: "/machines", label: "Machines", icon: "assets", roles: ["admin"] },
      { to: "/users", label: "User Management", icon: "users", roles: ["admin"] },
      { to: "/system-ops", label: "System Operations", icon: "evaluation", roles: ["admin"] },
    ],
  },
];

const ROLE_COLOR = {
  admin: {
    bg: "hsla(210,100%,60%,0.15)",
    border: "hsl(210,100%,60%)",
    text: "hsl(210,100%,60%)",
  },
  analyst: {
    bg: "hsla(130,60%,50%,0.15)",
    border: "hsl(130,60%,50%)",
    text: "hsl(130,60%,50%)",
  },
  auditor: {
    bg: "hsla(45,100%,50%,0.15)",
    border: "hsl(45,100%,50%)",
    text: "hsl(45,100%,50%)",
  },
"compliance-officer": {
  bg: "hsla(280,60%,60%,0.15)",
  border: "hsl(280,60%,60%)",
  text: "hsl(280,60%,60%)",
},
"patch-operator": {
  bg: "hsla(25,100%,55%,0.15)",
  border: "hsl(25,100%,55%)",
  text: "hsl(25,100%,55%)",
}
};

// ── Notification Bell Component ───────────────────────────────────────────────
// ── Notification Bell Component ───────────────────────────────────────────────
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNoti] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    axios
      .get(`${API}/api/notifications`, { params: { limit: 30 } })
      .then((res) => {
        setNoti(res.data?.data || []);
        setUnreadCount(res.data?.unreadCount || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function severityColor(sev) {
    if (sev === "critical") return "hsl(350,100%,65%)";
    if (sev === "warning") return "hsl(45,100%,50%)";
    return "hsl(210,100%,60%)";
  }

  async function handleItemClick(n) {
    if (!n.isRead) {
      try {
        await axios.post(`${API}/api/notifications/${n._id}/read`);
        setNoti((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {}
    }
    setOpen(false);
    if (n.relatedHostname) {
      navigate(`/asset/${encodeURIComponent(n.relatedHostname)}`);
    } else if (n.relatedTicketId) {
      navigate("/tickets");
    }
  }

  async function handleReadAll() {
    try {
      await axios.post(`${API}/api/notifications/read-all`);
      setNoti((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          background: open ? "var(--accent-muted)" : "transparent",
          border: "1px solid var(--line)",
          borderRadius: 8,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--text)",
          transition: "all 0.15s",
        }}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "No unread notifications"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "hsl(350,100%,65%)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--bg)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 380,
            maxHeight: 480,
            background: "#1a1d27",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            zIndex: 9999,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13 }}>Notifications</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unreadCount > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "hsla(350,100%,65%,0.15)",
                    color: "hsl(350,100%,65%)",
                    border: "1px solid hsla(350,100%,65%,0.3)",
                  }}
                >
                  {unreadCount} new
                </div>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleReadAll}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: "transparent",
                    border: "1px solid var(--line)",
                    color: "var(--muted)",
                    cursor: "pointer",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowY: "auto", maxHeight: 420 }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                Loading...
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>All clear</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>No notifications right now.</div>
              </div>
            )}
            {!loading &&
              notifications.map((n, i) => (
                <div
                  key={n._id}
                  onClick={() => handleItemClick(n)}
                  style={{
                    padding: "12px 18px",
                    borderBottom: i < notifications.length - 1 ? "1px solid var(--line)" : "none",
                    cursor: "pointer",
                    background: n.isRead ? "transparent" : "hsla(210,100%,60%,0.04)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = n.isRead ? "transparent" : "hsla(210,100%,60%,0.04)")
                  }
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: severityColor(n.severity),
                        marginTop: 5,
                        flexShrink: 0,
                        opacity: n.isRead ? 0.3 : 1,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: n.isRead ? 500 : 700, marginBottom: 2 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  };

  return (
    <button
      className="themeToggleBtn"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </svg>
      )}
    </button>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function Layout({ title, rightControls, children }) {
  const { user, logout, loginAt } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || "analyst";
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem("navExpandedGroups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  function toggleGroup(key) {
    setExpandedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("navExpandedGroups", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
 const rc = ROLE_COLOR[role] || ROLE_COLOR.analyst;

  function handleLogout() {
    localStorage.removeItem("navExpandedGroups");
    logout();
    navigate("/login");
  }

  return (
    <div className="layout">
      <aside
        className="sidebar"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div className="brand">
          <div className="brandName">RiskPatch</div>
          <div className="brandSub">Security Intelligence</div>
        </div>
    
       <div
          className="nav"
          style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
        >
          <NavItem to="/profile" label="My Profile" icon={ICONS.users} />
          {NAV_STANDALONE.filter((item) => item.roles.includes(role)).map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={ICONS[item.icon]} />
          ))}
          {NAV_GROUPS.map((group) => (
            <NavGroup
              key={group.key}
              group={group}
              role={role}
              expanded={!!expandedGroups[group.key]}
              onToggle={toggleGroup}
            />
          ))}
      </div> 

        <div className="sidebarFooter">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: rc.bg,
                border: `1px solid ${rc.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 900,
                color: rc.text,
                flexShrink: 0,
              }}
            >
              {(user?.username || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.username}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 3,
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

          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "7px 12px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "hsl(350,100%,65%)";
              e.currentTarget.style.color = "hsl(350,100%,65%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line)";
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sign Out
          </button>

          <div
            className="mono"
            style={{ fontSize: 10, color: "var(--muted)", marginTop: 10 }}
          >
            API: 192.168.0.30:5000
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar" style={{ position: "relative", zIndex: 100 }}>
          <div className="title">{title}</div>
           <div
            className="controls"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            {rightControls}
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
