"use strict";

const express = require("express");
const db = require("../db/index");

const router = express.Router();

/**
 * Deterministic-but-drifting GPS simulation, keyed by trip id.
 * Mirrors the front-end's old bridge.js behaviour: a fixed seed position
 * per trip that wobbles slightly every ~5s based on the current time.
 */
function simulateGps(tripId) {
  // Hash the trip id into a stable seed
  let seed = 0;
  for (let i = 0; i < tripId.length; i++) {
    seed = (seed * 31 + tripId.charCodeAt(i)) % 100000;
  }

  // Base coordinates roughly around the Mombasa / Changamwe corridor (Kenya)
  const baseLat = -4.04 + (seed % 50) / 1000; // ~ -4.04 to -3.99
  const baseLng = 39.62 + (seed % 70) / 1000; // ~ 39.62 to 39.69

  // Drift slowly using a 5-second tick so consecutive polls look "live"
  const tick = Math.floor(Date.now() / 5000);
  const driftLat = Math.sin((tick + seed) / 12) * 0.004;
  const driftLng = Math.cos((tick + seed) / 9) * 0.004;

  return {
    lat: Number((baseLat + driftLat).toFixed(6)),
    lng: Number((baseLng + driftLng).toFixed(6)),
    heading: Math.round(((tick + seed) * 7) % 360),
    speed_kph: 35 + (Math.abs(Math.round(Math.sin(tick + seed) * 30))),
    updated: new Date().toISOString(),
  };
}

function buildTripPayload(trip) {
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

  const gps = trip.status === "active" ? simulateGps(trip.id) : null;

  return { trip, booking, truck, driver, events, gps };
}

function findTrip(query, type) {
  const q = String(query).trim();
  const qLower = q.toLowerCase();

  const tryContainer = () =>
    db.prepare("SELECT * FROM trips WHERE LOWER(container) = ?").get(qLower);

  const tryBookingRef = () => db.prepare("SELECT * FROM trips WHERE LOWER(id) = ?").get(qLower);

  const tryTruckReg = () => {
    const truck = db.prepare("SELECT * FROM trucks WHERE LOWER(reg) = ?").get(qLower);
    if (!truck) return null;
    return db
      .prepare("SELECT * FROM trips WHERE truck_id = ? ORDER BY created DESC LIMIT 1")
      .get(truck.id);
  };

  const tryDriverName = () => {
    const driver = db
      .prepare("SELECT * FROM drivers WHERE LOWER(name) LIKE ?")
      .get(`%${qLower}%`);
    if (!driver) return null;
    return db
      .prepare("SELECT * FROM trips WHERE driver_id = ? ORDER BY created DESC LIMIT 1")
      .get(driver.id);
  };

  switch (type) {
    case "container":
      return tryContainer();
    case "booking":
    case "booking_ref":
      return tryBookingRef();
    case "truck":
      return tryTruckReg();
    case "driver":
      return tryDriverName();
    default:
      return (
        tryContainer() || tryBookingRef() || tryTruckReg() || tryDriverName() || null
      );
  }
}

// GET /api/track?query=&type=
router.get("/", (req, res) => {
  const { query, type } = req.query;
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: "query parameter is required" });
  }

  const trip = findTrip(query, type || "auto");
  if (!trip) {
    return res.status(404).json({ error: "No matching trip found" });
  }

  res.json(buildTripPayload(trip));
});

// GET /api/track/:id  (direct trip/booking id lookup)
router.get("/:id", (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: "No matching trip found" });
  }
  res.json(buildTripPayload(trip));
});

module.exports = router;
