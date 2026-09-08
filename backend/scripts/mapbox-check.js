/**
 * Read-only check that Mapbox is actually wired up: which provider each part of
 * the app will use, and whether a real address and a real route come back.
 * Costs a couple of API calls and changes nothing.
 */
import { pool } from '../config/db.js';
import { providers, geocodeSelfTest, optimizeOrder, routingFallbackReason } from '../services/geo.js';

const p = providers();
console.log('\n  What each part of the app is using:');
console.log(`    Routing (trip planning)  ${p.routing.toUpperCase()}`);
console.log(`    Map tiles                ${p.tiles.toUpperCase()}`);
console.log(`    Address lookup           ${p.geocoding.toUpperCase()}${p.geocoding === 'openstreetmap' && p.routing === 'mapbox' ? '   (free - no payment method needed)' : ''}`);

console.log('\n  Looking up a known address...');
const geo = await geocodeSelfTest();
for (const [name, r] of Object.entries(geo)) {
  if (name === 'provider') continue;
  if (r.error) console.log(`    ${name.padEnd(11)} ERROR  ${r.error}`);
  else if (r.hit) console.log(`    ${name.padEnd(11)} ok     ${r.hit.lat.toFixed(4)}, ${r.hit.lng.toFixed(4)}`);
  else console.log(`    ${name.padEnd(11)} no match (status ${r.status})`);
}

/* Probe each Mapbox service separately with the real token.
   An earlier version asked /tokens/v2 whether the token was "valid" — that
   endpoint needs a scope a public token doesn't have and can answer OK without
   really checking anything, so it reported a healthy token while every actual
   API refused it. These are the calls the app makes, so they cannot lie. */
if (process.env.MAPBOX_TOKEN) {
  const T = process.env.MAPBOX_TOKEN;
  console.log(`\n  Token: ${T.slice(0, 8)}...${T.slice(-4)}  (${T.length} characters)`);
  if (T.length < 60) console.log('    ^ that looks SHORT for a Mapbox token - characters may be missing');

  const probes = [
    ['map tiles',            `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${T}`],
    ['address (free)',       `https://api.mapbox.com/search/geocode/v6/forward?q=Toronto&limit=1&access_token=${T}`],
    ['address (storable)',   `https://api.mapbox.com/search/geocode/v6/forward?q=Toronto&limit=1&permanent=true&access_token=${T}`],
    ['directions',           `https://api.mapbox.com/directions/v5/mapbox/driving/-79.76,43.73;-79.64,43.59?access_token=${T}`],
    ['route optimiser',      `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/-79.76,43.73;-79.64,43.59?access_token=${T}`],
  ];
  console.log('\n  Asking each Mapbox service directly:');
  for (const [label, url] of probes) {
    try {
      const r = await fetch(url);
      if (r.ok) console.log(`    ${label.padEnd(20)} OK`);
      else {
        const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140);
        console.log(`    ${label.padEnd(20)} HTTP ${r.status}  ${body}`);
      }
    } catch (e) { console.log(`    ${label.padEnd(20)} could not connect: ${e.message}`); }
  }
  console.log('');
  console.log('  Reading that: if TILES work but the others do not, the token is');
  console.log('  fine and those services need switching on in the Mapbox account.');
  console.log('  If NOTHING works, the token is wrong - copy it again.');
}

console.log('\n  Routing Brampton -> Mississauga -> home...');
try {
  const r = await optimizeOrder([
    { lat: 43.7315, lng: -79.7624 }, { lat: 43.589, lng: -79.644 }, { lat: 43.601, lng: -79.610 },
  ], { roundTrip: true });
  const fell = routingFallbackReason();
  console.log(`    ok     ${(r.distance_m / 1000).toFixed(1)} km, ${Math.round(r.duration_s / 60)} min round trip`);
  if (fell) {
    console.log(`           ...but via the FREE service, because Mapbox refused:`);
    console.log(`           ${fell}`);
    console.log(`           Trip planning still works. Mapbox routing does not.`);
  }
} catch (e) {
  console.log(`    ERROR  ${e.message}`);
}
console.log('');
await pool.end();
