"use strict";

const express = require("express");
const { v4: uuid } = require("uuid");

const db = require("../db/index");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// POST /api/contact
router.post("/", (req, res) => {
  const {
    fullName,
    full_name,
    company,
    email,
    phone,
    subject,
    contactMethod,
    contact_method,
    message,
  } = req.body || {};

  const name = fullName || full_name;
  if (!name || !message) {
    return res.status(400).json({ error: "fullName and message are required" });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: "Provide at least an email or a phone number" });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO contact_messages
      (id, full_name, company, email, phone, subject, contact_method, message, status)
     VALUES (?,?,?,?,?,?,?,?, 'new')`
  ).run(
    id,
    name,
    company || null,
    email || null,
    phone || null,
    subject || null,
    contactMethod || contact_method || null,
    message
  );

  const contact = db.prepare("SELECT * FROM contact_messages WHERE id = ?").get(id);
  res.status(201).json({ contact });
});

// GET /api/contact  (admin only — inbox)
router.get("/", requireAuth, requireAdmin, (req, res) => {
  const messages = db
    .prepare("SELECT * FROM contact_messages ORDER BY created DESC")
    .all();
  res.json({ messages });
});

// PATCH /api/contact/:id/status  (admin only)
router.patch("/:id/status", requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ["new", "read", "replied"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const message = db.prepare("SELECT * FROM contact_messages WHERE id = ?").get(req.params.id);
  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  db.prepare("UPDATE contact_messages SET status = ? WHERE id = ?").run(status, req.params.id);
  const updated = db.prepare("SELECT * FROM contact_messages WHERE id = ?").get(req.params.id);
  res.json({ message: updated });
});

module.exports = router;
