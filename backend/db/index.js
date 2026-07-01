"use strict";

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

require("dotenv").config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "gargo.db");

// Ensure parent directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  company       TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'client',   -- client | admin
  created       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  phone    TEXT,
  license  TEXT,
  status   TEXT NOT NULL DEFAULT 'available'      -- available | on_trip | off_duty
);

CREATE TABLE IF NOT EXISTS trucks (
  id       TEXT PRIMARY KEY,
  reg      TEXT NOT NULL UNIQUE,                  -- truck registration plate
  type     TEXT NOT NULL DEFAULT 'flatbed',        -- flatbed | reefer | lowbed
  capacity TEXT,
  status   TEXT NOT NULL DEFAULT 'idle'            -- idle | yard | transit | maintenance
);

CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,                -- booking ref e.g. GH-2024-0001
  user_id         TEXT REFERENCES users(id),
  full_name       TEXT NOT NULL,
  company         TEXT,
  email           TEXT,
  phone           TEXT,
  service_type    TEXT NOT NULL,                   -- truck | storage | reefer | repair
  cargo_type      TEXT,
  container       TEXT,
  pickup_location TEXT,
  dropoff_location TEXT,
  pickup_date     TEXT,
  quote_amount    REAL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | in_progress | completed | cancelled
  created         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,                    -- same as booking id when linked, or generated
  booking_id  TEXT REFERENCES bookings(id),
  truck_id    TEXT REFERENCES trucks(id),
  driver_id   TEXT REFERENCES drivers(id),
  container   TEXT,
  origin      TEXT,
  destination TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',      -- pending | active | completed | cancelled
  created     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id    TEXT NOT NULL REFERENCES trips(id),
  label      TEXT NOT NULL,
  detail     TEXT,
  ts         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id              TEXT PRIMARY KEY,
  full_name       TEXT NOT NULL,
  company         TEXT,
  email           TEXT,
  phone           TEXT,
  subject         TEXT,
  contact_method  TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new',       -- new | read | replied
  created         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_truck ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
`);

module.exports = db;
