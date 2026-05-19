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
import NetworkMap   from "./pages/NetworkMap";
import AssetGroups  from "./pages/AssetGroups";
import Tickets from "./pages/Tickets";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

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
          <Route path="/network" element={
            <ProtectedRoute roles={["admin", "analyst"]}><NetworkMap /></ProtectedRoute>
          } />
          <Route path="/groups" element={
            <ProtectedRoute roles={["admin", "analyst"]}><AssetGroups /></ProtectedRoute>
          } />
          <Route path="/compliance" element={
            <ProtectedRoute roles={["admin", "analyst", "auditor"]}><Compliance /></ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute roles={["admin", "analyst", "auditor"]}><Tickets /></ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}