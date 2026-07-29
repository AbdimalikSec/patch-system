import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PatchLog     from "./pages/PatchLog";
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
import NetworkDiscovery from "./pages/NetworkDiscovery";
import Machines from "./pages/Machines";
import Vulnerabilities from "./pages/Vulnerabilities";
import AuditLog from "./pages/AuditLog";
import UserActivity from "./pages/UserActivity";
import Profile from "./pages/Profile";
import SystemOperations from "./pages/SystemOperations";
import LoginReport from "./pages/LoginReport";
import ComplianceHistory from "./pages/ComplianceHistory";
import ResolutionReport from "./pages/ResolutionReport";
import ComplianceTrendReport from "./pages/ComplianceTrendReport";
import PatchVelocityReport from "./pages/PatchVelocityReport";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst"]}><Overview /></ProtectedRoute>
          } />
          <Route path="/assets" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst"]}><Assets /></ProtectedRoute>
          } />
          <Route path="/backlog" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst"]}><Backlog /></ProtectedRoute>
          } />
          <Route path="/asset/:hostname" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst", "auditor"]}><AssetDetails /></ProtectedRoute>
          } />
          <Route path="/evaluation" element={
            <ProtectedRoute roles={["admin", "analyst"]}><Evaluation /></ProtectedRoute>
          } />
          <Route path="/network" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "analyst"]}><NetworkMap /></ProtectedRoute>
          } />
          <Route path="/groups" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "analyst"]}><AssetGroups /></ProtectedRoute>
          } />
          <Route path="/compliance" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><Compliance /></ProtectedRoute>          
          } />

          <Route path="/compliance-history" element={
             <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><ComplianceHistory /></ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><Tickets /></ProtectedRoute>
          } />
            <Route path="/patch-log" element={
             <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst"]}><PatchLog /></ProtectedRoute>
          } />
           <Route path="/vulnerabilities" element={
             <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><Vulnerabilities /></ProtectedRoute>
          } />
           <Route path="/audit-log" element={
              <ProtectedRoute roles={["admin", "auditor"]}><AuditLog /></ProtectedRoute>
          } />
           <Route path="/user-activity" element={
              <ProtectedRoute roles={["admin", "analyst"]}><UserActivity /></ProtectedRoute>
          } />
            <Route path="/login-report" element={
              <ProtectedRoute roles={["admin", "analyst"]}><LoginReport /></ProtectedRoute>
          } />
           <Route path="/resolution-report" element={
             <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><ResolutionReport /></ProtectedRoute>
          } />
             <Route path="/patch-velocity-report" element={
              <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst"]}><PatchVelocityReport /></ProtectedRoute>
           } />
            <Route path="/compliance-trend-report" element={
              <ProtectedRoute roles={["admin", "compliance-officer", "analyst", "auditor"]}><ComplianceTrendReport /></ProtectedRoute>
            } />
            <Route path="/discovery" element={
             <ProtectedRoute roles={["admin"]}><NetworkDiscovery /></ProtectedRoute>
          } />
           <Route path="/system-ops" element={
             <ProtectedRoute roles={["admin"]}><SystemOperations /></ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>
          } />
          <Route path="/machines" element={
            <ProtectedRoute roles={["admin"]}><Machines /></ProtectedRoute>
          } />
         <Route path="/profile" element={
             <ProtectedRoute roles={["admin", "compliance-officer", "patch-operator", "analyst", "auditor"]}><Profile /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
