import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function Asset() {
  const { hostname } = useParams();
  const [risk, setRisk] = useState(null);
  const [patch, setPatch] = useState(null);
  const [comp, setComp] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const r = await axios.get(`${API}/api/risk/latest/${encodeURIComponent(hostname)}`);
        const p = await axios.get(`${API}/api/patches/latest/${encodeURIComponent(hostname)}`);
        const c = await axios.get(`${API}/api/compliance/latest/${encodeURIComponent(hostname)}`);
        setRisk(r.data);
        setPatch(p.data);
        setComp(c.data);
      } catch (e) {
        setErr(e?.message || "Failed to load");
      }
    })();
  }, [hostname]);

  if (err) return <div style={{ color: "crimson" }}>{err}</div>;
  if (!risk || !patch || !comp) return <div>Loading...</div>;

  return (
    <div>
      <h3>Asset: {hostname}</h3>

      <h4>Risk</h4>
      <pre>{JSON.stringify(risk, null, 2)}</pre>

      <h4>Latest Patch</h4>
      <pre>{JSON.stringify(patch, null, 2)}</pre>

      <h4>Latest Compliance</h4>
      <pre>{JSON.stringify(comp, null, 2)}</pre>
    </div>
  );
}
