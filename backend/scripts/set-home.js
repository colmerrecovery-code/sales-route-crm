/**
 * Set the address a rep leaves from in the morning.
 *
 * Trips built in the app have no start point of their own, so without this the
 * router falls back to using the FIRST CUSTOMER as home — which quietly makes
 * "home each night" mean "back to that customer each night".
 *
 *   node scripts/set-home.js --user you@example.com --address "182 Royal Valley Dr" \
 *        --city Caledon --province Ontario --postal "L7C 1C9"
 *
 * Prints what the geocoder matched so you can check it before trusting it.
 */
import { pool, query } from '../config/db.js';
import * as Users from '../models/users.js';
import { geocode } from '../services/geo.js';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const bail = async (m) => { console.error(`\n${m}\n`); await pool.end(); process.exit(1); };

const EMAIL = opt('user'), ADDRESS = opt('address');
if (!EMAIL || !ADDRESS) await bail('Usage: node scripts/set-home.js --user <email> --address <street> [--city ..] [--province ..] [--postal ..]');

const { rows: [user] } = await query('SELECT id, email FROM users WHERE lower(email)=lower($1)', [EMAIL]);
if (!user) await bail(`No account signs in as "${EMAIL}".`);

const parts = { address: ADDRESS, city: opt('city'), province: opt('province') || 'Ontario', postal_code: opt('postal'), country: 'Canada' };
const pretty = [ADDRESS, parts.city, parts.province, parts.postal_code].filter(Boolean).join(', ');

console.log(`\nLooking up: ${pretty}`);
let hit = null;
try { hit = await geocode(parts); } catch (e) { await bail(`The lookup service didn't answer: ${e.message}`); }

/* Fall back to the postal code alone: it puts you within a block or two, which
   is far better for routing than defaulting to a customer's front door. */
if (!hit && parts.postal_code) {
  console.log('No match on the full address. Trying the postal code on its own...');
  try { hit = await geocode({ postal_code: parts.postal_code, country: 'Canada' }); } catch { /* reported below */ }
  if (hit) console.log('Matched the postal code — close enough to route from, but check the map.');
}
if (!hit) await bail('Could not place that address. Check the spelling, or give me the nearest major intersection.');

console.log(`Matched:    ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`);
if (hit.display_name) console.log(`            ${hit.display_name}`);
console.log(`Map:        https://www.openstreetmap.org/?mlat=${hit.lat}&mlon=${hit.lng}#map=17/${hit.lat}/${hit.lng}`);

await Users.setHome(user.id, { home_address: pretty, lat: hit.lat, lng: hit.lng });
console.log(`\nSaved as the home base for ${user.email}.`);
console.log('Trips you build yourself now start and end here.\n');
console.log('Open that map link and check the pin is your street. If it is off,');
console.log('run this again with a nearby intersection instead.\n');
await pool.end();
