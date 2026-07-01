"use strict";

const express = require("express");
const { v4: uuid } = require("uuid");

const db = require("../db/index");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/fleet  — truck list + live status summary
router.get("/", (req, res) => {
  const trucks = db.prepare("SELECT * FROM trucks ORDER BY reg ASC").all();

  const summary = trucks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    trucks,
    summary: {
      total: trucks.length,
      idle: summary.idle || 0,
      yard: summary.yard || 0,
      transit: summary.transit || 0,
      maintenance: summary.maintenance || 0,
    },
  });
});

// GET /api/fleet/drivers
router.get("/drivers", (req, res) => {
  const drivers = db.prepare("SELECT * FROM drivers ORDER BY name ASC").all();
  res.json({ drivers });
});

// POST /api/fleet/trucks  (admin only)
router.post("/trucks", requireAuth, requireAdmin, (req, res) => {
  const { reg, type, capacity, status } = req.body || {};
  if (!reg) {
    return res.status(400).json({ error: "reg is required" });
  }

  const existing = db.prepare("SELECT id FROM trucks WHERE LOWER(reg) = ?").get(
    String(reg).toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: "A truck with that registration already exists" });
  }

  const id = uuid();
  db.prepare(
    "INSERT INTO trucks (id, reg, type, capacity, status) VALUES (?,?,?,?,?)"
  ).run(id, reg, type || "flatbed", capacity || null, status || "idle");

  const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(id);
  res.status(201).json({ truck });
});

// PATCH /api/fleet/trucks/:id/status  (admin only)
router.patch("/trucks/:id/status", requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ["idle", "yard", "transit", "maintenance"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(req.params.id);
  if (!truck) {
    return res.status(404).json({ error: "Truck not found" });
  }

  db.prepare("UPDATE trucks SET status = ? WHERE id = ?").run(status, req.params.id);
  const updated = db.prepare("SELECT * FROM trucks WHERE id = ?").get(req.params.id);
  res.json({ truck: updated });
});

module.exports = router;
