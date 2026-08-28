// Geocoding (Nominatim) and routing (OSRM). Both are swappable for Google Maps.
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const UA = process.env.NOMINATIM_USER_AGENT || 'sales-route-crm/1.0';

/** Geocode a free-form address → {lat, lng} or null. */
export async function geocode({ address, city, postal_code, province, country }) {
  const q = [address, city, province, postal_code, country].filter(Boolean).join(', ');
  if (!q) return null;
  const url = `${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
}

const coordStr = (pts) => pts.map(p => `${p.lng},${p.lat}`).join(';');

/**
 * Solve the visiting order for a set of points (TSP) starting at pts[0].
 * Returns { order: [indexes], legs: [{distance_m, duration_s}], geometry }.
 */
export async function optimizeOrder(pts, { roundTrip = false } = {}) {
  if (pts.length < 2) return { order: pts.map((_, i) => i), legs: [], geometry: null, distance_m: 0, duration_s: 0 };
  const params = new URLSearchParams({
    source: 'first', roundtrip: String(roundTrip), overview: 'full', geometries: 'geojson',
  });
  if (!roundTrip) params.set('destination', 'any');
  const res = await fetch(`${OSRM}/trip/v1/driving/${coordStr(pts)}?${params}`);
  if (!res.ok) throw Object.assign(new Error('Routing service unavailable'), { status: 502 });
  const data = await res.json();
  if (data.code !== 'Ok') throw Object.assign(new Error(`Routing failed: ${data.code}`), { status: 502 });
  const trip = data.trips[0];
  // waypoints[i].waypoint_index = position of input i in the solved route
  const order = data.waypoints
    .map((w, inputIdx) => ({ inputIdx, pos: w.waypoint_index }))
    .sort((a, b) => a.pos - b.pos)
    .map(w => w.inputIdx);
  const legs = trip.legs.map(l => ({ distance_m: Math.round(l.distance), duration_s: Math.round(l.duration) }));
  return { order, legs, geometry: trip.geometry, distance_m: Math.round(trip.distance), duration_s: Math.round(trip.duration) };
}

/** Turn-by-turn directions for an already-ordered list of points. */
export async function directions(pts) {
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' });
  const res = await fetch(`${OSRM}/route/v1/driving/${coordStr(pts)}?${params}`);
  if (!res.ok) throw Object.assign(new Error('Routing service unavailable'), { status: 502 });
  const data = await res.json();
  if (data.code !== 'Ok') throw Object.assign(new Error(`Routing failed: ${data.code}`), { status: 502 });
  const route = data.routes[0];
  return {
    distance_m: Math.round(route.distance),
    duration_s: Math.round(route.duration),
    geometry: route.geometry,
    legs: route.legs.map(l => ({
      distance_m: Math.round(l.distance),
      duration_s: Math.round(l.duration),
      steps: l.steps.map(s => ({
        instruction: describeStep(s), road: s.name || null,
        distance_m: Math.round(s.distance), duration_s: Math.round(s.duration),
      })),
    })),
  };
}

function describeStep(s) {
  const m = s.maneuver || {};
  const road = s.name ? ` onto ${s.name}` : '';
  switch (m.type) {
    case 'depart': return `Head ${m.modifier || ''}${road}`.trim();
    case 'arrive': return 'Arrive at destination';
    case 'turn': return `Turn ${m.modifier}${road}`;
    case 'merge': return `Merge ${m.modifier}${road}`;
    case 'on ramp': return `Take the ramp${road}`;
    case 'off ramp': return `Take the exit${road}`;
    case 'roundabout': return `At the roundabout take exit ${m.exit ?? ''}${road}`.trim();
    case 'fork': return `Keep ${m.modifier} at the fork${road}`;
    case 'continue': return `Continue${road}`;
    default: return `${m.type || 'Continue'} ${m.modifier || ''}${road}`.trim();
  }
}
