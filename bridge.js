"use strict";


const BRIDGE_SUPABASE_URL = 'https://okisjizcyidvvwdwehaa.supabase.co';
const BRIDGE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9raXNqaXpjeWlkdnZ3ZHdlaGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTYzNjMsImV4cCI6MjA5ODM5MjM2M30.O_0EeK297a07B7FLunpWr6HDlqrfP5Z8Owyp3qE4hQE';

if (!window.supabase) {
  console.error('bridge.js: supabase-js must be loaded before bridge.js');
}

const bridgeSupabase = window.supabase.createClient(BRIDGE_SUPABASE_URL, BRIDGE_SUPABASE_ANON_KEY);


async function trackQuery(query) {
  const q = (query || '').trim();
  if (!q) throw new Error('Enter a container, booking ref, truck reg, or driver name');
  const { data, error } = await bridgeSupabase.rpc('public_track_lookup', { p_query: q });
  if (error) throw new Error(error.message || 'Lookup failed');
  if (!data) throw new Error('No matching record found');
  return data;
}


async function fleetStatus() {
  const { data, error } = await bridgeSupabase.rpc('public_fleet_status');
  if (error) throw new Error(error.message || 'Could not load fleet status');
  return { trucks: data || [] };
}


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


async function submitContact(payload) {
  const { error } = await bridgeSupabase.from('public_contact_messages').insert(payload);
  if (error) throw new Error(error.message || 'Message failed — please try again');
  return { ok: true };
}

window.bridge = { trackQuery, fleetStatus, submitBooking, submitContact };
