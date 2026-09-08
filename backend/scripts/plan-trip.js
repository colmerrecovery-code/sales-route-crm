/**
 * Build a routed road trip from the customers already in an account.
 *
 *   node scripts/plan-trip.js --user you@x.com --name "GTA week" \
 *        --start 2026-09-08 --end 2026-09-11 \
 *        --from 43.7315,-79.7624 --radius-km 90 --max-stops 30
 *
 * Picks active customers with an exact map pin inside the radius, ranked by how
 * many contacts you have there, routes them, and lays them onto working days.
 * Re-running with the same --name replaces that trip rather than making another.
 */
import { pool, query } from '../config/db.js';
import * as Trips from '../models/trips.js';
import { optimizeOrder } from '../services/geo.js';
import { scheduleStops } from '../services/scheduler.js';
import { planDays } from '../services/planner.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const EMAIL = opt('user', null);
const NAME = opt('name', 'Road trip');
const START = opt('start', null);
const END = opt('end', null);
const FROM = (opt('from', '43.7315,-79.7624')).split(',').map(Number);
const RADIUS = Number(opt('radius-km', 90)) * 1000;
const MAX = Number(opt('max-stops', 30));
const VISIT = Number(opt('visit-min', 45));
const WORK_START = opt('work-start', '08:30');
const WORK_END = opt('work-end', '17:00');
const APPROX = flag('include-approximate');
const ONE_LOOP = flag('one-loop');   // default is home-every-night

if (!EMAIL || !START) {
  console.error('Need at least --user <email> and --start <YYYY-MM-DD>.');
  await pool.end(); process.exit(1);
}
const { rows: [user] } = await query('SELECT id, email FROM users WHERE email=$1', [EMAIL]);
if (!user) { console.error(`No account "${EMAIL}".`); await pool.end(); process.exit(1); }

// ---- pick the customers worth the drive
const { rows: picks } = await query(`
  SELECT c.id, c.name, c.address, c.city, c.province,
         ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng,
         (SELECT count(*)::int FROM clients cl WHERE cl.company_id = c.id) AS contacts,
         cu.tier,
         ROUND(ST_Distance(c.location, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography)/1000) AS km
    FROM companies c JOIN customers cu ON cu.company_id = c.id
   WHERE c.owner_id = $1
     AND c.location IS NOT NULL
     AND cu.tier = 'tier1'
     AND ST_DWithin(c.location, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4)
     ${APPROX ? '' : "AND coalesce(c.notes,'') NOT LIKE '%approximate%'"}
   ORDER BY contacts DESC, c.name
   LIMIT $5`, [user.id, FROM[0], FROM[1], RADIUS, MAX]);

if (!picks.length) { console.error('No matching customers found. Try a bigger --radius-km.'); await pool.end(); process.exit(1); }

console.log(`\nAccount: ${user.email}`);
console.log(`Picked ${picks.length} active customers within ${RADIUS / 1000} km, best-covered first:\n`);
for (const p of picks) console.log(`  ${String(p.contacts).padStart(3)} contacts  ${p.km.toString().padStart(3)} km  ${p.name} — ${p.city || ''}`);

// ---- replace any trip of the same name
const existing = (await Trips.list(user.id)).find(t => t.name === NAME);
if (existing) { await Trips.remove(user.id, existing.id); console.log(`\nReplaced the previous "${NAME}".`); }

let trip = await Trips.create(user.id, {
  name: NAME, start_date: START, end_date: END, work_start: WORK_START, work_end: WORK_END,
  default_visit_min: VISIT, repeat_daily: true, start_lat: FROM[0], start_lng: FROM[1],
});
await Trips.addBreak(user.id, trip.id, { kind: 'lunch', label: 'Lunch', starts_at: '12:00', duration_min: 45 });
await Trips.addStops(user.id, trip.id, picks.map(p => p.id), VISIT);
trip = await Trips.get(user.id, trip.id);

// ---- dates

const dayCount = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 86400000) + 1 : 1;
const dateOf = (n) => { const d = new Date(START); d.setUTCDate(d.getUTCDate() + n - 1); return d.toISOString().slice(0, 10); };

// ---- route and schedule
const HOME = { lat: FROM[0], lng: FROM[1] };
const customers = trip.stops.filter(s => s.kind === 'customer');
const scheduled = [];
const unscheduled = [];
let totalDist = 0, totalDur = 0;

if (ONE_LOOP) {
  console.log('\nWorking out one continuous loop across the whole trip...');
  const pts = [HOME, ...customers.map(s => ({ lat: s.lat, lng: s.lng }))];
  const solved = await optimizeOrder(pts, { roundTrip: true });
  const ordered = solved.order.slice(1).map((i, k) => ({
    ...customers[i - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
  }));
  const laid = scheduleStops(ordered, trip, trip.breaks);
  scheduled.push(...laid.filter(s => !s.unscheduled));
  unscheduled.push(...laid.filter(s => s.unscheduled));
  totalDist = solved.distance_m; totalDur = solved.duration_s;
} else {
  const days = dayCount(START, END);
  console.log(`\nBuilding ${days} day${days > 1 ? 's' : ''}, each one out and back from home...`);
  const { days: groups, leftover } = planDays(customers, days, {
    home: HOME, visitMin: VISIT, workStart: WORK_START, workEnd: WORK_END,
  });
  for (const l of leftover) unscheduled.push({ company_id: l.company_id, unscheduled: true });
  for (const [i, group] of groups.entries()) {
    if (!group.length) continue;   // an empty day keeps its number; it just has nothing in it
    const dayNo = i + 1;
    const pts = [HOME, ...group.map(s => ({ lat: s.lat, lng: s.lng }))];
    const solved = await optimizeOrder(pts, { roundTrip: true });
    const ordered = solved.order.slice(1).map((j, k) => ({
      ...group[j - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
    }));
    // Schedule this day on its own, so nothing spills into tomorrow.
    const oneDay = { ...trip, start_date: dateOf(dayNo), end_date: dateOf(dayNo) };
    const laid = scheduleStops(ordered, oneDay, trip.breaks);
    for (const st of laid) {
      if (st.unscheduled) unscheduled.push(st);
      else scheduled.push({ ...st, day_number: dayNo });
    }
    totalDist += solved.distance_m; totalDur += solved.duration_s;
    const fitted = laid.filter(s => !s.unscheduled && s.kind === 'customer').length;
    console.log(`  Day ${dayNo} (${dateOf(dayNo)}): ${fitted} of ${group.length} stops, ${Math.round(solved.distance_m / 1000)} km round trip`);
  }
}

await Trips.replaceStops(user.id, trip.id, scheduled, { distance_m: totalDist, duration_s: totalDur });
const saved = await Trips.get(user.id, trip.id);

// ---- print the itinerary
const hhmm = (iso) => iso ? new Date(iso).toISOString().slice(11, 16) : '     ';
const dayDate = (n) => { const d = new Date(START); d.setUTCDate(d.getUTCDate() + n - 1);
  return d.toUTCString().slice(0, 11); };
console.log('\n' + '='.repeat(64));
console.log(`  ${saved.name}`);
console.log(`  ${Math.round(saved.total_distance_m / 1000)} km driving, ${(saved.total_duration_s / 3600).toFixed(1)} h behind the wheel`);
console.log(`  ${ONE_LOOP ? 'One continuous loop — you sleep on the road.' : 'Home every night — each day starts and ends at your start point.'}`);
console.log('='.repeat(64));
let cur = null;
for (const s of saved.stops) {
  if (s.day_number !== cur) { cur = s.day_number; console.log(`\n--- Day ${cur}  ${dayDate(cur)} ---`); }
  if (s.kind === 'break') { console.log(`  ${hhmm(s.planned_arrival)}  ${(s.break_label || 'Break')}`); continue; }
  const drive = s.leg_duration_s ? `${Math.round(s.leg_duration_s / 60)} min drive` : '';
  console.log(`  ${hhmm(s.planned_arrival)}–${hhmm(s.planned_depart)}  ${s.company_name}`);
  console.log(`            ${[s.address, s.city].filter(Boolean).join(', ')}${drive ? '   (' + drive + ')' : ''}`);
}
if (unscheduled.length) {
  console.log(`\n${unscheduled.length} did not fit in the week:`);
  for (const u of unscheduled) console.log(`  - ${customers.find(c => c.company_id === u.company_id)?.company_name || u.company_id}`);
  console.log('Raise --max-stops or add days to fit more.');
}
console.log('\nOpen GoMichi and go to Trips to see it on the map.\n');
await pool.end();
