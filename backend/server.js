"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookings");
const trackRoutes = require("./routes/track");
const fleetRoutes = require("./routes/fleet");
const contactRoutes = require("./routes/contact");
const tripRoutes = require("./routes/trips");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "gargo-haven-backend", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/track", trackRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin/trips", tripRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Gargo Haven backend running on http://localhost:${PORT}`);
});
