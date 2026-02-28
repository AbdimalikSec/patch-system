import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Set axios default auth header
  function setToken(token) {
    if (token) {
      localStorage.setItem("riskpatch_token", token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      localStorage.removeItem("riskpatch_token");
      delete axios.defaults.headers.common["Authorization"];
    }
  }

  // On mount — restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("riskpatch_token");
    if (!token) {
      setLoading(false);
      return;
    }
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    axios.get(`${API}/api/auth/me`)
      .then(res => setUser(res.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const res = await axios.post(`${API}/api/auth/login`, { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}