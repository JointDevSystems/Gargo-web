"use strict";

const { v4: uuid } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./index");

function seed() {
  const driverCount = db.prepare("SELECT COUNT(*) AS c FROM drivers").get().c;
  if (driverCount > 0) {
    console.log("Seed skipped — data already exists.");
    return;
  }

  const insertDriver = db.prepare(
    "INSERT INTO drivers (id, name, phone, license, status) VALUES (?,?,?,?,?)"
  );
  const insertTruck = db.prepare(
    "INSERT INTO trucks (id, reg, type, capacity, status) VALUES (?,?,?,?,?)"
  );
  const insertTrip = db.prepare(
    `INSERT INTO trips (id, booking_id, truck_id, driver_id, container, origin, destination, status, created)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
  );
  const insertEvent = db.prepare(
    "INSERT INTO trip_events (trip_id, label, detail) VALUES (?,?,?)"
  );

  const drivers = [
    { name: "Hassan Mwakio", phone: "+254711222333", license: "DL-KE-1029" },
    { name: "James Otieno", phone: "+254722333444", license: "DL-KE-2048" },
    { name: "Peter Kamau", phone: "+254733444555", license: "DL-KE-3067" },
    { name: "Said Abdalla", phone: "+254744555666", license: "DL-KE-4086" },
  ];
  const driverIds = drivers.map((d) => {
    const id = uuid();
    insertDriver.run(id, d.name, d.phone, d.license, "available");
    return id;
  });

  const trucks = [
    { reg: "KDA 221C", type: "flatbed", capacity: "40T" },
    { reg: "KDB 442D", type: "reefer", capacity: "30T" },
    { reg: "KDC 558E", type: "lowbed", capacity: "60T" },
    { reg: "KDD 671F", type: "flatbed", capacity: "40T" },
  ];
  const truckIds = trucks.map((t) => {
    const id = uuid();
    insertTruck.run(id, t.reg, t.type, t.capacity, "idle");
    return id;
  });

  // Demo trip so /api/track has something to find out of the box
  const tripId = "GH-2024-0001";
  insertTrip.run(
    tripId,
    null,
    truckIds[0],
    driverIds[0],
    "MSCU1234567",
    "Gargo Haven — Changamwe Depot",
    "Mombasa Port (KPA) Gate 18",
    "active"
  );
  db.prepare("UPDATE trucks SET status='transit' WHERE id=?").run(truckIds[0]);
  db.prepare("UPDATE drivers SET status='on_trip' WHERE id=?").run(driverIds[0]);

  insertEvent.run(tripId, "Booking Confirmed", "Booking GH-2024-0001 confirmed");
  insertEvent.run(tripId, "Gate-In at Depot", "Container released from Changamwe yard");
  insertEvent.run(tripId, "In Transit", "Truck KDA 221C en route to Mombasa Port");

  // Default admin account (change password after first login!)
  const adminId = uuid();
  const hash = bcrypt.hashSync("ChangeMe123!", 10);
  db.prepare(
    "INSERT INTO users (id, name, email, phone, company, password_hash, role) VALUES (?,?,?,?,?,?,?)"
  ).run(adminId, "Gargo Admin", "admin@gargo.co.ke", "+254116307751", "Gargo Haven Ltd", hash, "admin");

  console.log("Seed complete:");
  console.log("  4 drivers, 4 trucks, 1 demo trip (GH-2024-0001 / container MSCU1234567)");
  console.log("  Admin login -> email: admin@gargo.co.ke  password: ChangeMe123!");
}

seed();
