import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./ui.css";

import Overview from "./pages/Overview";
import Assets from "./pages/Assets";
import Backlog from "./pages/Backlog";
import Compliance from "./pages/Compliance";
import AssetDetails from "./pages/AssetDetails";
import Evaluation from "./pages/Evaluation";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/asset/:hostname" element={<AssetDetails />} />
        <Route path="/backlog" element={<Backlog />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/evaluation" element={<Evaluation />} />
      </Routes>
    </BrowserRouter>
  );
}
