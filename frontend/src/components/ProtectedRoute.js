import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="muted">Loading...</div>
      </div>
    );
  }

  // Not logged in — go to login
  if (!user) return <Navigate to="/login" replace />;

  // Role restriction — auditor trying to access admin/analyst only page
  if (roles && !roles.includes(user.role)) {
    // Auditor always lands on compliance
    if (user.role === "auditor") return <Navigate to="/compliance" replace />;
    // Analyst trying to access admin-only page
    return <Navigate to="/" replace />;
  }

  return children;
}