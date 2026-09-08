/**
 * Geocoding and routing.
 *
 * Mapbox when a token is set; OpenStreetMap's Nominatim and the public OSRM
 * demo server otherwise. The fallback is not just politeness — those free
 * services rate-limited us mid-import, and OSRM's terms forbid use behind a
 * paywall, so they cannot back a paid product. Keeping both means the app still
 * runs on a laptop with no account, and switching is one environment variable.
 */
const MAPBOX = 'https://api.mapbox.com';
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';
/* Mapbox's cheap "temporary" geocoding may NOT be stored — and storing the
   coordinate is the entire point here, since a customer is geocoded once and
   the pin is kept. So ask for permanent results, which is the licence that
   allows it. Costs per lookup and needs a card on the Mapbox account. */
const MAPBOX_PERMANENT = (process.env.MAPBOX_PERMANENT ?? 'true') !== 'false';
/* Routing and map tiles are free on Mapbox; only ADDRESS LOOKUP costs money,
   because storing a pin needs their paid permanent licence. So the two are
   separable: set MAPBOX_GEOCODING=false to take the free routing and sharper
   tiles while addresses keep using the OpenStreetMap services. Useful before a
   payment method is set up, and harmless afterwards. */
const MAPBOX_GEOCODING = (process.env.MAPBOX_GEOCODING ?? 'true') !== 'false';
const onMapbox = () => Boolean(MAPBOX_TOKEN);
const geocodeOnMapbox = () => onMapbox() && MAPBOX_GEOCODING;

const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const UA = process.env.NOMINATIM_USER_AGENT || 'gomichi-crm/1.0 (tcolmer6@gmail.com)';
const PHOTON = process.env.PHOTON_URL || 'https://photon.komoot.io';

/** Which service is actually in use — surfaced in diagnostics and the UI. */
export const provider = () => (onMapbox() ? 'mapbox' : 'openstreetmap');
/** Routing and addresses can legitimately be on different services — see above. */
export const providers = () => ({
  routing: onMapbox() ? 'mapbox' : 'osrm',
  tiles: onMapbox() ? 'mapbox' : 'openstreetmap',
  geocoding: geocodeOnMapbox() ? 'mapbox' : 'openstreetmap',
});

/** Last status seen per provider — surfaced by `geocodeSelfTest`. */
export const geoStatus = { mapbox: null, nominatim: null, photon: null };

/** Why routing last fell back off Mapbox, if it did. Read by mapbox-check.js. */
export let lastRoutingFallback = null;
export const routingFallbackReason = () => lastRoutingFallback;

const coordStr = (pts) => pts.map(p => `${p.lng},${p.lat}`).join(';');

// ---------------------------------------------------------------- geocoding

/** Geocode a free-form address → {lat, lng} or null. */
export async function geocode({ address, city, postal_code, province, country }) {
  const q = [address, city, province, postal_code, country].filter(Boolean).join(', ');
  if (!q) return null;
  const chain = geocodeOnMapbox() ? [mapboxGeocode, nominatim, photon] : [nominatim, photon];
  for (const p of chain) {
    try { const hit = await p(q); if (hit) return hit; }
    catch { /* try the next provider */ }
  }
  return null;
}

async function mapboxGeocode(q) {
  const params = new URLSearchParams({
    q, limit: '1', country: 'ca', access_token: MAPBOX_TOKEN,
  });
  if (MAPBOX_PERMANENT) params.set('permanent', 'true');
  const res = await fetch(`${MAPBOX}/search/geocode/v6/forward?${params}`);
  geoStatus.mapbox = res.status;
  if (res.status === 401 || res.status === 402) {
    /* Mapbox says WHY in the body; without it a bad token and an unpaid
       account look identical, which is a long afternoon of guessing. */
    const why = await res.text().catch(() => '');
    /* Permanent geocoding needs a payment method. Say so plainly rather than
       letting it look like "address not found" for every single lookup. */
    throw new Error(`Mapbox refused the lookup (HTTP ${res.status}). It said: ${why.slice(0, 200) || '(nothing)'}`);
  }
  if (!res.ok) return null;
  const data = await res.json();
  const f = data?.features?.[0];
  const c = f?.geometry?.coordinates;
  return c ? { lat: c[1], lng: c[0], display_name: f.properties?.full_address || f.properties?.name } : null;
}

async function nominatim(q) {
  const url = `${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  geoStatus.nominatim = res.status;
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display_name: hit.display_name } : null;
}

async function photon(q) {
  const url = `${PHOTON}/api/?limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  geoStatus.photon = res.status;
  if (!res.ok) return null;
  const data = await res.json();
  const f = data?.features?.[0];
  if (!f?.geometry?.coordinates) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat, lng, display_name: f.properties?.name };
}

/** Ask every configured provider for one known address; report what each said. */
export async function geocodeSelfTest() {
  const q = '2270 Portland Street SE, Calgary, Alberta, Canada';
  const chain = geocodeOnMapbox() ? [['mapbox', mapboxGeocode], ['nominatim', nominatim], ['photon', photon]]
                                  : [['nominatim', nominatim], ['photon', photon]];
  const out = { provider: provider() };
  for (const [name, fn] of chain) {
    try { out[name] = { hit: await fn(q), status: geoStatus[name] }; }
    catch (e) { out[name] = { hit: null, status: geoStatus[name], error: e.message }; }
  }
  return out;
}

// ------------------------------------------------------------------ routing

const OPTIMIZE_MAX = 12;   // Mapbox Optimization v1 hard limit, start and end included
const DIRECTIONS_MAX = 25; // Mapbox Directions v5 limit

/**
 * Solve the order of `pts`, keeping pts[0] first.
 *
 * Three shapes, and the caller picks by what a day actually looks like:
 *   roundTrip: true                  out from home and back to it
 *   roundTrip: false                 open-ended; finish wherever suits
 *   destination: 'last'              fixed finish at the LAST point — a day
 *                                    that starts at home and ends at a hotel
 * With destination 'last', pass [from, ...stops, to] and read the solved stops
 * back with order.slice(1, -1); leg k is the arrival at solved stop k.
 */
export async function optimizeOrder(pts, { roundTrip = false, destination } = {}) {
  if (pts.length < 2) return { order: pts.map((_, i) => i), legs: [], geometry: null, distance_m: 0, duration_s: 0 };

  if (onMapbox()) {
    /* Mapbox caps the optimiser at 12 points including both ends. A long day
       exceeds that, so order it ourselves and then ask Directions for the real
       distances — a worse order than the optimiser would find, but real roads
       and honest numbers, which matters more than a perfect sequence. */
    try {
      if (pts.length <= OPTIMIZE_MAX) return await mapboxOptimize(pts, { roundTrip, destination });
      return await orderThenMeasure(pts, { roundTrip, destination });
    } catch (e) {
      /* Never let a bad token or a Mapbox outage stop someone planning a day.
         Geocoding has always fallen through to the free services; routing did
         not, so one rejected token took trip planning down with it. */
      console.error(`Mapbox routing failed (${e.message}) — falling back to OSRM.`);
      lastRoutingFallback = e.message;
    }
  }
  return osrmOptimize(pts, { roundTrip, destination });
}

async function mapboxOptimize(pts, { roundTrip, destination }) {
  const params = new URLSearchParams({
    source: 'first', roundtrip: String(roundTrip), overview: 'full',
    geometries: 'geojson', access_token: MAPBOX_TOKEN,
  });
  // Mapbox only accepts destination=last when roundtrip is false.
  if (!roundTrip) params.set('destination', destination === 'last' ? 'last' : 'any');
  const res = await fetch(`${MAPBOX}/optimized-trips/v1/mapbox/driving/${coordStr(pts)}?${params}`);
  if (!res.ok) {
    const why = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status} — Mapbox said: ${why.slice(0, 200) || '(nothing)'}`), { status: 502 });
  }
  const data = await res.json();
  if (data.code !== 'Ok') throw Object.assign(new Error(`Routing failed: ${data.code}`), { status: 502 });
  return readTrip(data);
}

async function osrmOptimize(pts, { roundTrip, destination }) {
  const params = new URLSearchParams({
    source: 'first', roundtrip: String(roundTrip), overview: 'full', geometries: 'geojson',
  });
  if (!roundTrip) params.set('destination', destination || 'any');
  const res = await fetch(`${OSRM}/trip/v1/driving/${coordStr(pts)}?${params}`);
  if (!res.ok) throw Object.assign(new Error('Routing service unavailable'), { status: 502 });
  const data = await res.json();
  if (data.code !== 'Ok') throw Object.assign(new Error(`Routing failed: ${data.code}`), { status: 502 });
  return readTrip(data);
}

/* Mapbox's trip response is OSRM's — they built theirs on it — so one reader
   serves both. waypoints[i].waypoint_index is input i's position in the route. */
function readTrip(data) {
  const trip = data.trips[0];
  const order = data.waypoints
    .map((w, inputIdx) => ({ inputIdx, pos: w.waypoint_index }))
    .sort((a, b) => a.pos - b.pos)
    .map(w => w.inputIdx);
  return {
    order,
    legs: trip.legs.map(l => ({ distance_m: Math.round(l.distance), duration_s: Math.round(l.duration) })),
    geometry: trip.geometry,
    distance_m: Math.round(trip.distance),
    duration_s: Math.round(trip.duration),
  };
}

/** Straight-line km, for ordering only. */
const km = (a, b) => {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
};

/** More points than the optimiser takes: nearest-neighbour, then measure for real. */
async function orderThenMeasure(pts, { roundTrip, destination }) {
  const fixedEnd = !roundTrip && destination === 'last' ? pts.length - 1 : null;
  const middle = pts.map((_, i) => i).filter(i => i !== 0 && i !== fixedEnd);

  const seq = [0];
  let here = pts[0];
  const left = [...middle];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (km(here, pts[left[i]]) < km(here, pts[left[best]])) best = i;
    const pick = left.splice(best, 1)[0];
    seq.push(pick); here = pts[pick];
  }
  if (fixedEnd != null) seq.push(fixedEnd);

  const route = await routeThrough(roundTrip ? [...seq.map(i => pts[i]), pts[0]] : seq.map(i => pts[i]));
  return {
    order: seq,
    legs: route.legs.map(l => ({ distance_m: l.distance_m, duration_s: l.duration_s })),
    geometry: route.geometry,
    distance_m: route.distance_m,
    duration_s: route.duration_s,
  };
}

/** Turn-by-turn directions for an already-ordered list of points. */
export async function directions(pts) {
  return routeThrough(pts, { steps: true });
}

async function routeThrough(pts, { steps = false } = {}) {
  if (pts.length > DIRECTIONS_MAX) {
    throw Object.assign(new Error(`That is ${pts.length} points in one run; the routing service takes ${DIRECTIONS_MAX}. Split the day.`), { status: 400 });
  }
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: String(steps) });
  let url;
  if (onMapbox()) {
    params.set('access_token', MAPBOX_TOKEN);
    url = `${MAPBOX}/directions/v5/mapbox/driving/${coordStr(pts)}?${params}`;
  } else {
    url = `${OSRM}/route/v1/driving/${coordStr(pts)}?${params}`;
  }
  let res = await fetch(url);
  if (!res.ok && onMapbox()) {
    const why = await res.text().catch(() => '');
    console.error(`Mapbox directions failed (${res.status}: ${why.slice(0, 200)}) — falling back to OSRM.`);
    lastRoutingFallback = `HTTP ${res.status}: ${why.slice(0, 200)}`;
    res = await fetch(`${OSRM}/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson&steps=${steps}`);
  }
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
      steps: (l.steps || []).map(s => ({
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
