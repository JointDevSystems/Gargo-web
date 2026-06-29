
"use strict";

const BRIDGE_KEY = "GARGO_FLEET_v3";


function loadSystemState() {
  try {
    const raw = localStorage.getItem(BRIDGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data === "object") return data;
    return null;
  } catch (e) {
    console.warn("bridge: failed to load system state", e);
    return null;
  }
}


function findTripByContainer(container) {
  const state = loadSystemState();
  if (!state || !state.trips) return null;
  const search = container.trim().toUpperCase();
  return state.trips.find(t => t.container && t.container.toUpperCase() === search) || null;
}


function findTripByBookingRef(ref) {
  const state = loadSystemState();
  if (!state || !state.trips) return null;
  const search = ref.trim().toUpperCase();
  return state.trips.find(t => t.id && t.id.toUpperCase() === search) || null;
}


function findTripByTruckReg(reg) {
  const state = loadSystemState();
  if (!state || !state.trips || !state.trucks) return null;
  const search = reg.trim().toUpperCase();

  const truck = state.trucks.find(t => t.reg && t.reg.toUpperCase() === search);
  if (!truck) return null;

  const activeTrip = state.trips.find(t => t.truck_id === truck.id && t.status === "active");
  if (activeTrip) return activeTrip;
 
  const tripsForTruck = state.trips.filter(t => t.truck_id === truck.id);
  if (!tripsForTruck.length) return null;
  return tripsForTruck.sort((a,b) => new Date(b.created) - new Date(a.created))[0];
}

/**
 * Search for a trip by driver name (case-insensitive).
 * Returns the trip object if found, otherwise null.
 * (If multiple, returns the first active or most recent.)
 */
function findTripByDriverName(name) {
  const state = loadSystemState();
  if (!state || !state.trips || !state.drivers) return null;
  const search = name.trim().toUpperCase();
  const driver = state.drivers.find(d => d.name && d.name.toUpperCase().includes(search));
  if (!driver) return null;
  const activeTrip = state.trips.find(t => t.driver_id === driver.id && t.status === "active");
  if (activeTrip) return activeTrip;
  const tripsForDriver = state.trips.filter(t => t.driver_id === driver.id);
  if (!tripsForDriver.length) return null;
  return tripsForDriver.sort((a,b) => new Date(b.created) - new Date(a.created))[0];
}

/**
 * Get full details for a trip, including truck, driver, container info.
 * Returns an object with all relevant data.
 */
function getTripDetails(trip) {
  if (!trip) return null;
  const state = loadSystemState();
  if (!state) return { trip, truck: null, driver: null };

  const truck = state.trucks ? state.trucks.find(t => t.id === trip.truck_id) : null;
  const driver = state.drivers ? state.drivers.find(d => d.id === trip.driver_id) : null;


  let gps = null;
  if (trip.status === "active") {
    
    const hash = trip.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const lat = -4.0 + (hash % 100) / 1000;
    const lng = 39.6 + ((hash * 7) % 100) / 1000;
    const speed = 20 + (hash % 60);
    gps = { lat, lng, speed };
  }

  return {
    trip,
    truck,
    driver,
    gps
  };
}


window.bridge = {
  loadSystemState,
  findTripByContainer,
  findTripByBookingRef,
  findTripByTruckReg,
  findTripByDriverName,
  getTripDetails
};
