"use strict";

const express = require("express");
const { v4: uuid } = require("uuid");

const db = require("../db/index");
const { requireAuth, optionalAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function generateBookingRef() {
  // GH-<year>-<4 digit incrementing-ish sequence based on row count>
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) AS c FROM bookings").get().c + 1;
  const seq = String(count).padStart(4, "0");
  let ref = `GH-${year}-${seq}`;
  // Guard against collisions (e.g. after deletions) by falling back to a uuid-based ref
  const exists = db.prepare("SELECT id FROM bookings WHERE id = ?").get(ref);
  if (exists) {
    ref = `GH-${year}-${uuid().slice(0, 8).toUpperCase()}`;
  }
  return ref;
}

// POST /api/bookings  (guest or logged-in)
router.post("/", optionalAuth, (req, res) => {
  const {
    fullName,
    full_name,
    company,
    email,
    phone,
    serviceType,
    service_type,
    cargoType,
    cargo_type,
    container,
    pickupLocation,
    pickup_location,
    dropoffLocation,
    dropoff_location,
    pickupDate,
    pickup_date,
    quoteAmount,
    quote_amount,
    notes,
  } = req.body || {};

  const name = fullName || full_name;
  const svcType = serviceType || service_type;

  if (!name || !svcType) {
    return res.status(400).json({ error: "fullName and serviceType are required" });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: "Provide at least an email or a phone number" });
  }

  const id = generateBookingRef();
  const userId = req.user ? req.user.id : null;

  db.prepare(
    `INSERT INTO bookings
      (id, user_id, full_name, company, email, phone, service_type, cargo_type,
       container, pickup_location, dropoff_location, pickup_date, quote_amount, notes, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`
  ).run(
    id,
    userId,
    name,
    company || null,
    email || null,
    phone || null,
    svcType,
    cargoType || cargo_type || null,
    container || null,
    pickupLocation || pickup_location || null,
    dropoffLocation || dropoff_location || null,
    pickupDate || pickup_date || null,
    quoteAmount != null ? quoteAmount : quote_amount != null ? quote_amount : null,
    notes || null
  );

  // Auto-create a linked trip so /api/track has something to find immediately
  db.prepare(
    `INSERT INTO trips (id, booking_id, truck_id, driver_id, container, origin, destination, status, created)
     VALUES (?, ?, NULL, NULL, ?, ?, ?, 'pending', datetime('now'))`
  ).run(
    id,
    id,
    container || null,
    pickupLocation || pickup_location || null,
    dropoffLocation || dropoff_location || null
  );

  db.prepare("INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)").run(
    id,
    "Booking Received",
    `Booking ${id} created for ${svcType}`
  );

  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  res.status(201).json({ booking });
});

// GET /api/bookings  (own bookings; admin sees all)
router.get("/", requireAuth, (req, res) => {
  let bookings;
  if (req.user.role === "admin") {
    bookings = db.prepare("SELECT * FROM bookings ORDER BY created DESC").all();
  } else {
    bookings = db
      .prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created DESC")
      .all(req.user.id);
  }
  res.json({ bookings });
});

// GET /api/bookings/:id
router.get("/:id", (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  res.json({ booking });
});

// PATCH /api/bookings/:id/status  (admin only)
router.patch("/:id/status", requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ["pending", "confirmed", "in_progress", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, req.params.id);

  // Keep the linked trip's lifecycle roughly in sync
  const trip = db.prepare("SELECT * FROM trips WHERE booking_id = ?").get(req.params.id);
  if (trip) {
    const tripStatusMap = {
      pending: "pending",
      confirmed: "pending",
      in_progress: "active",
      completed: "completed",
      cancelled: "cancelled",
    };
    db.prepare("UPDATE trips SET status = ? WHERE id = ?").run(tripStatusMap[status], trip.id);
    db.prepare("INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)").run(
      trip.id,
      "Booking Status Updated",
      `Status changed to ${status}`
    );
  }

  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  res.json({ booking: updated });
});

module.exports = router;
