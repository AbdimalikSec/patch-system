import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [loginAt, setLoginAt]   = useState(null); // timestamp of current session login

  function setToken(token) {
    if (token) {
      localStorage.setItem("riskpatch_token", token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      localStorage.removeItem("riskpatch_token");
      localStorage.removeItem("riskpatch_login_at");
      delete axios.defaults.headers.common["Authorization"];
    }
  }

  // On mount — restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("riskpatch_token");
    const storedLoginAt = localStorage.getItem("riskpatch_login_at");
    if (!token) {
      setLoading(false);
      return;
    }
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    if (storedLoginAt) setLoginAt(storedLoginAt);
    axios.get(`${API}/api/auth/me`)
      .then(res => setUser(res.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const res = await axios.post(`${API}/api/auth/login`, { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    // Record the exact moment this session started
    const now = new Date().toISOString();
    setLoginAt(now);
    localStorage.setItem("riskpatch_login_at", now);
    return res.data.user;
  }

  function logout() {
    setToken(null);
    setUser(null);
    setLoginAt(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginAt }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}