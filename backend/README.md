# Gargo Haven Backend

A real Node.js + Express + SQLite API that replaces the `bridge.js` /
`localStorage` mock used by the front end (`GARGO_FLEET_v3`, `gh_users`, etc.).
SQLite is accessed via Node's **built-in** `node:sqlite` module — no native
compiler/toolchain required.

## Requirements
- Node.js 22.5+ (uses the built-in `node:sqlite` module)

## Setup

```bash
cd backend
npm install
cp .env.example .env      # edit JWT_SECRET, CORS_ORIGIN, etc.
npm run seed               # creates db/gargo.db, demo data, admin account
npm start                  # http://localhost:4000
```

Demo admin login: `admin@gargo.co.ke` / `ChangeMe123!` — change this after first login.
Demo trackable trip: container `MSCU1234567`, booking ref `GH-2024-0001`, truck `KDA 221C`.

## Project layout

```
backend/
  server.js          Express app entry point
  db/index.js         DB connection + schema (users, drivers, trucks, bookings, trips, trip_events, contact_messages)
  db/seed.js           Demo data + admin account
  middleware/auth.js   JWT auth + admin-only guard
  routes/auth.js        signup / login / me
  routes/bookings.js    create + list + status updates (auto-creates a linked trip)
  routes/track.js        public tracking, mirrors bridge.js (container / booking ref / truck reg / driver name)
  routes/fleet.js         public truck + driver lists with live status summary
  routes/contact.js       contact form intake + admin inbox
  routes/trips.js          admin-only: assign truck/driver, update status, add timeline events
```

## API summary

| Method | Path                              | Auth        | Purpose |
|--------|------------------------------------|-------------|---------|
| GET    | /api/health                        | none        | liveness check |
| POST   | /api/auth/signup                   | none        | create client account |
| POST   | /api/auth/login                    | none        | get JWT |
| GET    | /api/auth/me                       | bearer      | current user |
| POST   | /api/bookings                      | optional    | create booking (guest or logged-in); auto-creates a trip |
| GET    | /api/bookings                      | bearer      | list own bookings (admin sees all) |
| GET    | /api/bookings/:id                  | none        | fetch one booking |
| PATCH  | /api/bookings/:id/status            | admin       | update booking status |
| GET    | /api/track?query=&type=             | none        | track by container / booking ref / truck reg / driver name (type=auto by default) |
| GET    | /api/track/:id                      | none        | track by trip/booking id directly |
| GET    | /api/fleet                          | none        | truck list + live status summary |
| GET    | /api/fleet/drivers                  | none        | driver list |
| POST   | /api/fleet/trucks                   | admin       | add a truck |
| PATCH  | /api/fleet/trucks/:id/status         | admin       | change truck status |
| POST   | /api/contact                        | none        | submit contact form |
| GET    | /api/contact                        | admin       | view inbox |
| PATCH  | /api/contact/:id/status              | admin       | mark read/replied |
| GET    | /api/admin/trips                     | admin       | list all trips |
| PATCH  | /api/admin/trips/:id/assign          | admin       | assign truck_id / driver_id to a trip |
| PATCH  | /api/admin/trips/:id/status           | admin       | pending/active/completed/cancelled (also syncs truck & driver status) |
| POST   | /api/admin/trips/:id/events           | admin       | append a timeline event |

All authenticated routes expect `Authorization: Bearer <token>`.

## Wiring up the existing front end

The front end currently calls into `window.bridge` (backed by `localStorage`)
and has a separate `localStorage`-based mock auth system in `script.js`
(`gh_users`). To switch to this real backend:

1. Set `CORS_ORIGIN` in `.env` to wherever the site is served from (e.g.
   `http://localhost:5500` for a local static server, or your real domain).
2. Replace `bridge.js` calls (`findTripByContainer`, `getTripDetails`, etc.)
   with `fetch` calls to `/api/track`. Example:
   ```js
   const res = await fetch(`http://localhost:4000/api/track?query=${encodeURIComponent(value)}`);
   const data = await res.json(); // { trip, truck, driver, events, gps } or { error }
   ```
3. Replace the booking form submit handler (`submitBooking()` in
   `script.js`) with a `POST` to `/api/bookings`.
4. Replace the `getUsers/saveUsers` mock auth block with calls to
   `/api/auth/signup` and `/api/auth/login`, storing the returned JWT (e.g.
   in memory or `sessionStorage`) and sending it as `Authorization: Bearer
   <token>` on subsequent requests.
5. Replace the contact form submit (`sendContact()`) with a `POST` to
   `/api/contact`.

I can wire these calls into `script.js` directly next if you'd like — just say the word.

## Notes
- Passwords are hashed with bcrypt; never stored in plain text.
- JWTs expire per `JWT_EXPIRES_IN` (default 7 days).
- GPS coordinates on `/api/track` are simulated (deterministic per trip, drifting slightly every 5s) — the same approach the old `bridge.js` used, just server-side now. Swap in real telematics data by replacing `simulateGps()` in `routes/track.js`.
- SQLite file lives at `db/gargo.db` (gitignore this in production and back it up, or swap `DB_PATH` for a Postgres connection later if you outgrow SQLite).
