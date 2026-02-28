import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login      from "./pages/Login";
import Overview   from "./pages/Overview";
import Compliance from "./pages/Compliance";
import AssetDetails from "./pages/AssetDetails";
import Evaluation from "./pages/Evaluation";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected */}
          <Route path="/" element={
            <ProtectedRoute><Overview /></ProtectedRoute>
          } />
          <Route path="/compliance" element={
            <ProtectedRoute><Compliance /></ProtectedRoute>
          } />
          <Route path="/asset/:hostname" element={
            <ProtectedRoute><AssetDetails /></ProtectedRoute>
          } />
          <Route path="/evaluation" element={
            <ProtectedRoute><Evaluation /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}