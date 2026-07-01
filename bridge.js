"use strict";

/* ─────────────────────────────────────────────────────────
   GARGO BRIDGE — live link between the public website and the
   Gargo TMS (Supabase).

   Replaces the old localStorage-based version, which could never
   actually work: localStorage is per-browser/per-origin, and
   nothing wrote to it in the first place, so a real customer
   visiting from their own device would never see live data.

   Exposes window.bridge = { trackQuery(query), fleetStatus() }.
   Both return Promises.

   Public reads go through two narrowly-scoped Postgres RPC
   functions (SECURITY DEFINER — see public_tracking_functions.sql).
   The anon key used here never gets direct SELECT access to
   trips/trucks/drivers: a visitor can only pull the one exact
   record they searched for, not browse other clients' shipments.
   ───────────────────────────────────────────────────────── */

const BRIDGE_SUPABASE_URL = 'https://okisjizcyidvvwdwehaa.supabase.co';
const BRIDGE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9raXNqaXpjeWlkdnZ3ZHdlaGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTYzNjMsImV4cCI6MjA5ODM5MjM2M30.O_0EeK297a07B7FLunpWr6HDlqrfP5Z8Owyp3qE4hQE';

if (!window.supabase) {
  console.error('bridge.js: supabase-js must be loaded before bridge.js');
}

const bridgeSupabase = window.supabase.createClient(BRIDGE_SUPABASE_URL, BRIDGE_SUPABASE_ANON_KEY);

/**
 * Look up a single shipment by container number, booking reference,
 * truck registration, or driver name. Resolves to
 * { trip, truck, driver, events, gps } — the exact shape
 * renderTrackResult() in script.js expects. Rejects if nothing
 * matches or the request fails.
 */
async function trackQuery(query) {
  const q = (query || '').trim();
  if (!q) throw new Error('Enter a container, booking ref, truck reg, or driver name');
  const { data, error } = await bridgeSupabase.rpc('public_track_lookup', { p_query: q });
  if (error) throw new Error(error.message || 'Lookup failed');
  if (!data) throw new Error('No matching record found');
  return data;
}

/**
 * Public fleet status strip for the homepage/live panel.
 * Resolves to { trucks: [{ reg, type, status }, ...] }.
 */
async function fleetStatus() {
  const { data, error } = await bridgeSupabase.rpc('public_fleet_status');
  if (error) throw new Error(error.message || 'Could not load fleet status');
  return { trucks: data || [] };
}

/**
 * Submit a booking request. Resolves to { booking: { id } } so callers
 * can show the reference number, matching the old backend's response
 * shape. We generate the id client-side rather than relying on
 * INSERT ... RETURNING, because RETURNING is itself subject to the
 * table's SELECT policy — and anon intentionally has no SELECT policy
 * on public_bookings, so a server-generated id wouldn't come back.
 */
async function submitBooking(payload) {
  const id = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  const { error } = await bridgeSupabase.from('public_bookings').insert(Object.assign({ id }, payload));
  if (error) throw new Error(error.message || 'Booking failed — please try again');
  return { booking: { id } };
}

/**
 * Submit a contact form message. Resolves to { ok: true } on success.
 */
async function submitContact(payload) {
  const { error } = await bridgeSupabase.from('public_contact_messages').insert(payload);
  if (error) throw new Error(error.message || 'Message failed — please try again');
  return { ok: true };
}

window.bridge = { trackQuery, fleetStatus, submitBooking, submitContact };