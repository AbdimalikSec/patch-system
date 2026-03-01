import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login        from "./pages/Login";
import Overview     from "./pages/Overview";
import Assets       from "./pages/Assets";
import Backlog      from "./pages/Backlog";
import Compliance   from "./pages/Compliance";
import AssetDetails from "./pages/AssetDetails";
import Evaluation   from "./pages/Evaluation";
import Users        from "./pages/Users";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Admin + Analyst only */}
          <Route path="/" element={
            <ProtectedRoute roles={["admin", "analyst"]}><Overview /></ProtectedRoute>
          } />
          <Route path="/assets" element={
            <ProtectedRoute roles={["admin", "analyst"]}><Assets /></ProtectedRoute>
          } />
          <Route path="/backlog" element={
            <ProtectedRoute roles={["admin", "analyst"]}><Backlog /></ProtectedRoute>
          } />
          <Route path="/asset/:hostname" element={
            <ProtectedRoute roles={["admin", "analyst"]}><AssetDetails /></ProtectedRoute>
          } />
          <Route path="/evaluation" element={
            <ProtectedRoute roles={["admin", "analyst"]}><Evaluation /></ProtectedRoute>
          } />

          {/* Admin + Analyst + Auditor */}
          <Route path="/compliance" element={
            <ProtectedRoute roles={["admin", "analyst", "auditor"]}><Compliance /></ProtectedRoute>
          } />

          {/* Admin only */}
          <Route path="/users" element={
            <ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}