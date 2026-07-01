"use strict";

const express = require("express");

const db = require("../db/index");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

function hydrateTrip(trip) {
  const truck = trip.truck_id
    ? db.prepare("SELECT * FROM trucks WHERE id = ?").get(trip.truck_id)
    : null;
  const driver = trip.driver_id
    ? db.prepare("SELECT * FROM drivers WHERE id = ?").get(trip.driver_id)
    : null;
  const events = db
    .prepare("SELECT * FROM trip_events WHERE trip_id = ? ORDER BY ts ASC")
    .all(trip.id);
  const booking = trip.booking_id
    ? db.prepare("SELECT * FROM bookings WHERE id = ?").get(trip.booking_id)
    : null;
  return { ...trip, truck, driver, events, booking };
}

// GET /api/admin/trips
router.get("/", (req, res) => {
  const trips = db.prepare("SELECT * FROM trips ORDER BY created DESC").all();
  res.json({ trips: trips.map(hydrateTrip) });
});

// PATCH /api/admin/trips/:id/assign  — assign truck_id / driver_id
router.patch("/:id/assign", (req, res) => {
  const { truck_id, truckId, driver_id, driverId } = req.body || {};
  const tId = truck_id || truckId || null;
  const dId = driver_id || driverId || null;

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: "Trip not found" });
  }

  if (tId) {
    const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(tId);
    if (!truck) return res.status(400).json({ error: "Truck not found" });
  }
  if (dId) {
    const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(dId);
    if (!driver) return res.status(400).json({ error: "Driver not found" });
  }

  db.prepare("UPDATE trips SET truck_id = COALESCE(?, truck_id), driver_id = COALESCE(?, driver_id) WHERE id = ?").run(
    tId,
    dId,
    req.params.id
  );

  if (tId) db.prepare("UPDATE trucks SET status = 'transit' WHERE id = ?").run(tId);
  if (dId) db.prepare("UPDATE drivers SET status = 'on_trip' WHERE id = ?").run(dId);

  db.prepare("INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)").run(
    req.params.id,
    "Truck/Driver Assigned",
    `Assigned truck=${tId || "unchanged"} driver=${dId || "unchanged"}`
  );

  const updated = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  res.json({ trip: hydrateTrip(updated) });
});

// PATCH /api/admin/trips/:id/status  — pending/active/completed/cancelled
router.patch("/:id/status", (req, res) => {
  const { status } = req.body || {};
  const allowed = ["pending", "active", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: "Trip not found" });
  }

  db.prepare("UPDATE trips SET status = ? WHERE id = ?").run(status, req.params.id);

  // Sync truck & driver status with the trip lifecycle
  if (status === "active") {
    if (trip.truck_id) db.prepare("UPDATE trucks SET status = 'transit' WHERE id = ?").run(trip.truck_id);
    if (trip.driver_id) db.prepare("UPDATE drivers SET status = 'on_trip' WHERE id = ?").run(trip.driver_id);
  } else if (status === "completed" || status === "cancelled") {
    if (trip.truck_id) db.prepare("UPDATE trucks SET status = 'idle' WHERE id = ?").run(trip.truck_id);
    if (trip.driver_id) db.prepare("UPDATE drivers SET status = 'available' WHERE id = ?").run(trip.driver_id);
  }

  // Keep linked booking roughly in sync
  if (trip.booking_id) {
    const bookingStatusMap = {
      pending: "pending",
      active: "in_progress",
      completed: "completed",
      cancelled: "cancelled",
    };
    db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(
      bookingStatusMap[status],
      trip.booking_id
    );
  }

  db.prepare("INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)").run(
    req.params.id,
    "Trip Status Updated",
    `Status changed to ${status}`
  );

  const updated = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  res.json({ trip: hydrateTrip(updated) });
});

// POST /api/admin/trips/:id/events — append a timeline event
router.post("/:id/events", (req, res) => {
  const { label, detail } = req.body || {};
  if (!label) {
    return res.status(400).json({ error: "label is required" });
  }

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: "Trip not found" });
  }

  db.prepare("INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)").run(
    req.params.id,
    label,
    detail || null
  );

  const updated = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  res.status(201).json({ trip: hydrateTrip(updated) });
});

module.exports = router;
