const mapping = require("../iso27001_mapping.json");

function getISOControl(checkTitle) {
  if (!checkTitle) return null;
  const lower = checkTitle.toLowerCase();
  for (const entry of mapping) {
    if (entry.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return {
        control: entry.control,
        title: entry.title,
        domain: entry.domain,
      };
    }
  }
  return null;
}

module.exports = { getISOControl };