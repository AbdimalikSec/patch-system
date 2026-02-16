const router = require("express").Router();

router.get("/", (req, res) => {
  res.json({ ok: true, service: "risk-patch-api", time: new Date().toISOString() });
});

module.exports = router;
