const fs = require("fs");
const path = require("path");

const FRAMEWORKS_DIR = path.join(__dirname, "..", "frameworks");

// Which frameworks currently exist, purely from what files are actually
// present -- adding a new framework later means dropping in a new JSON
// file here, not touching any code.
function listFrameworks() {
  const files = fs.readdirSync(FRAMEWORKS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const id = f.replace(".json", "");
    const label = id
      .split("-")
      .map((w) => (w.toLowerCase() === "iso27001" ? "ISO/IEC 27001:2022" : w.toUpperCase()))
      .join(" ");
    return { id, label: id === "iso27001" ? "ISO/IEC 27001:2022" : label };
  });
}

function loadFrameworkData(frameworkId) {
  const filePath = path.join(FRAMEWORKS_DIR, `${frameworkId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Every control defined for a framework -- scanned or not. This is the
// real, curated list the upload picker uses; nothing is ever free-typed.
function getAllControls(frameworkId) {
  const data = loadFrameworkData(frameworkId);
  if (!data) return [];
  return data.map((e) => ({
    control: e.control,
    title: e.title,
    domain: e.domain,
    scannable: Array.isArray(e.keywords) && e.keywords.length > 0,
  }));
}

// Same keyword-matching logic already proven in isoMapping.js, generalised
// to work against any framework's file, not just ISO's.
function getControlForCheckTitle(frameworkId, checkTitle) {
  const data = loadFrameworkData(frameworkId);
  if (!data || !checkTitle) return null;
  const lower = checkTitle.toLowerCase();
  for (const entry of data) {
    if ((entry.keywords || []).some((kw) => lower.includes(kw.toLowerCase()))) {
      return { control: entry.control, title: entry.title, domain: entry.domain };
    }
  }
  return null;
}

module.exports = { listFrameworks, getAllControls, getControlForCheckTitle };
