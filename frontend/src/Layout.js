import { NavLink } from "react-router-dom";

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => "navItem" + (isActive ? " navItemActive" : "")}
      end
    >
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
          <div className="brandSub">Risk-Based Patch & Compliance</div>
        </div>

        <div className="nav">
          <NavItem to="/" label="Overview" />
          <NavItem to="/assets" label="Assets" />
          <NavItem to="/backlog" label="Patch Backlog" />
          <NavItem to="/compliance" label="Compliance" />
        </div>

        <div className="sidebarFooter">
          <div className="muted">PATCH-SRV API</div>
          <div className="mono">10.10.20.30:5000</div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="title">{title}</div>
          <div className="controls">{rightControls}</div>
        </div>

        {children}
      </main>
    </div>
  );
}
