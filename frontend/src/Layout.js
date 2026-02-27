import { NavLink } from "react-router-dom";

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

export default function Layout({ title, rightControls, children }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandName">RiskPatch</div>
          <div className="brandSub">Security Intelligence</div>
        </div>

        <div className="nav">
          <NavItem to="/" label="Overview" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>} />
          <NavItem to="/assets" label="Assets" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>} />
          <NavItem to="/backlog" label="Patch Backlog" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>} />
          <NavItem to="/compliance" label="Compliance" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>} />
          <NavItem to="/evaluation" label="Evaluation" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>} />
        </div>

        <div className="sidebarFooter">
          <div className="muted" style={{ fontSize: '10px', marginBottom: '4px' }}>SYSTEM STATUS</div>
          <div className="mono">API: 10.10.20.30:5000</div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="title">{title}</div>
          <div className="controls">{rightControls}</div>
        </div>

        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
