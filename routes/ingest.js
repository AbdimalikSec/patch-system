const express = require("express");
const router = express.Router();
const Asset = require("../models/Asset");

router.post("/", async (req, res) => {
  try {
    const asset = new Asset(req.body);
    await asset.save();
    res.status(201).json({ message: "Data ingested successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
