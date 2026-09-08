import { z } from 'zod';
import * as Trips from '../models/trips.js';
import * as Users from '../models/users.js';
import { optimizeOrder, directions, geocode } from '../services/geo.js';
import { scheduleStops } from '../services/scheduler.js';
import { planDays } from '../services/planner.js';

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const tripSchema = z.object({
  name: z.string().trim().min(1), start_date: date, end_date: date.nullish(), work_start: time.optional(), work_end: time.optional(),
  default_visit_min: z.number().int().positive().optional(), repeat_daily: z.boolean().optional(),
  start_lat: z.number().optional(), start_lng: z.number().optional(), end_lat: z.number().optional(), end_lng: z.number().optional(),
  status: z.enum(['draft', 'planned', 'in_progress', 'completed', 'cancelled']).optional(),
});
export const tripPatchSchema = tripSchema.partial();
export const addStopsSchema = z.object({ company_ids: z.array(z.string().uuid()).min(1), duration_min: z.number().int().positive().optional(), day: z.number().int().positive().optional() });
export const visitLengthSchema = z.object({
  minutes: z.number().int().min(5).max(480),
});

/** How long each visit takes. A cold-call drop-in is not a 45-minute meeting. */
export async function setVisitLength(req, res) {
  const r = await Trips.setVisitLength(req.user.id, req.params.id, req.body.minutes);
  if (!r) return notFound(res);
  res.json({ ...r.trip, changed: r.changed, minutes: req.body.minutes });
}

export const replanSchema = z.object({
  lat: z.number().optional(), lng: z.number().optional(),
  day: z.number().int().positive().optional(),
  from_minutes: z.number().int().min(0).max(24 * 60).optional(),   // local wall clock
  return_home: z.boolean().optional(),
});
export const stopPatchSchema = z.object({ duration_min: z.number().int().positive().optional(), visited: z.boolean().optional(), notes: z.string().nullish(), day_number: z.number().int().positive().optional() });
export const breakSchema = z.object({
  kind: z.enum(['lunch', 'meeting', 'off_duty', 'other']).optional(), label: z.string().nullish(), starts_at: time,
  duration_min: z.number().int().positive().optional(), only_on_day: z.number().int().positive().nullish(),
});

const notFound = (res) => res.status(404).json({ error: 'Trip not found' });

export async function list(req, res) { res.json(await Trips.list(req.user.id)); }
export async function get(req, res) { const t = await Trips.get(req.user.id, req.params.id); t ? res.json(t) : notFound(res); }
export async function create(req, res) { res.status(201).json(await Trips.create(req.user.id, req.body)); }
export async function update(req, res) { const t = await Trips.update(req.user.id, req.params.id, req.body); t ? res.json(t) : notFound(res); }
export async function remove(req, res) { (await Trips.remove(req.user.id, req.params.id)) ? res.status(204).end() : notFound(res); }

export async function addStops(req, res) {
  const t = await Trips.addStops(req.user.id, req.params.id, req.body.company_ids, req.body.duration_min, req.body.day);
  t ? res.json(t) : notFound(res);
}
export async function updateStop(req, res) {
  const s = await Trips.updateStop(req.user.id, req.params.id, req.params.stopId, req.body);
  s ? res.json(s) : res.status(404).json({ error: 'Stop not found' });
}
export async function removeStop(req, res) {
  (await Trips.removeStop(req.user.id, req.params.id, req.params.stopId)) ? res.status(204).end() : res.status(404).json({ error: 'Stop not found' });
}
export async function addBreak(req, res) {
  const b = await Trips.addBreak(req.user.id, req.params.id, req.body);
  b ? res.status(201).json(b) : notFound(res);
}
export async function removeBreak(req, res) {
  (await Trips.removeBreak(req.user.id, req.params.id, req.params.breakId)) ? res.status(204).end() : res.status(404).json({ error: 'Break not found' });
}

/**
 * POST /trips/:id/optimize
 * Solves the best visiting order from the start point, then lays stops onto days
 * using working hours and breaks. Persists the result.
 */
/**
 * Where a day begins and ends.
 *
 * A day-base row for day N says where you set out on the MORNING of day N.
 * The corollary is the bit that is easy to get backwards: the END of day N is
 * the base of day N+1 — you finish at tonight's hotel and leave from it in the
 * morning. With no row for a day, you are at home.
 */
function dayBases(trip, home) {
  const byDay = new Map((trip.day_bases || []).map(b => [b.day_number, b]));
  const at = (d) => { const b = byDay.get(d); return b?.lat != null ? { lat: b.lat, lng: b.lng, label: b.label, address: b.address } : home; };
  return { at, baseFor: (d) => ({ from: at(d), to: at(d + 1) }) };
}

const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

export async function optimize(req, res) {
  const trip = await Trips.get(req.user.id, req.params.id);
  if (!trip) return notFound(res);
  const customers = trip.stops.filter(s => s.kind === 'customer');
  if (!customers.length) return res.status(400).json({ error: 'There are no stops on this trip yet.' });
  const missing = customers.filter(s => s.lat == null);
  if (missing.length) {
    return res.status(400).json({ error: `${missing.length} stop(s) have no map location yet: ${missing.map(m => m.company_name).join(', ')}` });
  }

  const home = await resolveStart(trip, req.user.id, customers[0]);
  const roundTrip = req.body?.round_trip ?? true;
  /* Home every night by default: a day should end where it started. One
     continuous loop is still available for a genuine overnight trip. */
  const homeEachNight = req.body?.home_each_night ?? true;
  const dateOf = (n) => { const d = new Date(trip.start_date); d.setUTCDate(d.getUTCDate() + n - 1); return d.toISOString().slice(0, 10); };
  const { at, baseFor } = dayBases(trip, home);

  const scheduled = [];
  const leftovers = [];
  const coordinates = [];
  let totalDist = 0, totalDur = 0;

  if (!homeEachNight) {
    // One path across the whole trip, then sliced by the clock into days.
    const pts = [home, ...customers.map(s => ({ lat: s.lat, lng: s.lng }))];
    const solved = await optimizeOrder(pts, { roundTrip });
    const ordered = solved.order.slice(1).map((i, k) => ({
      ...customers[i - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
    }));
    const laid = scheduleStops(ordered, trip, trip.breaks);
    for (const st of laid) (st.unscheduled ? leftovers : scheduled).push(st);
    totalDist = solved.distance_m; totalDur = solved.duration_s;
    coordinates.push(...(solved.geometry?.coordinates || []));
  } else {
    /* Decide each day's membership first (planner), then route that day for
       real. Routing the whole week as one path and cutting it by the clock is
       what used to strand you an hour from home at 5pm. */
    const maxDays = trip.end_date
      ? Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) + 1
      : customers.length;          // open-ended: never needs more days than stops
    const { days: groups, leftover } = planDays(customers, maxDays, {
      baseFor, visitMin: trip.default_visit_min, workStart: trip.work_start, workEnd: trip.work_end,
    });
    leftovers.push(...leftover);

    for (const [i, group] of groups.entries()) {
      const dayNo = i + 1;
      if (!group.length) continue;     // an empty day keeps its number, it just holds nothing
      const from = at(dayNo), to = at(dayNo + 1);
      const ends = samePlace(from, to);

      /* Out and back when the day finishes where it started; a fixed A-to-B run
         when it finishes somewhere else, so the last leg is the drive to
         tonight's hotel rather than a loop back to this morning. */
      const pts = ends ? [from, ...group.map(s => ({ lat: s.lat, lng: s.lng }))]
                       : [from, ...group.map(s => ({ lat: s.lat, lng: s.lng })), to];
      const solved = await optimizeOrder(pts, ends ? { roundTrip: true } : { roundTrip: false, destination: 'last' });
      const solvedStops = ends ? solved.order.slice(1) : solved.order.slice(1, -1);
      const ordered = solvedStops.map((j, k) => ({
        ...group[j - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
      }));
      // Schedule the day on its own, so nothing can spill into tomorrow.
      const oneDay = { ...trip, start_date: dateOf(dayNo), end_date: dateOf(dayNo) };
      for (const st of scheduleStops(ordered, oneDay, trip.breaks)) {
        if (st.unscheduled) leftovers.push(st);
        else scheduled.push({ ...st, day_number: dayNo });
      }
      totalDist += solved.distance_m; totalDur += solved.duration_s;
      coordinates.push(...(solved.geometry?.coordinates || []));
    }
  }

  /* Whatever didn't fit STAYS on the trip, parked at the end of the last day
     with no time against it. Deleting it was the old behaviour and the wrong
     one: which stops to sacrifice is the rep's call, not the router's. From
     there the day header counts it as unscheduled and the push button can
     move it to another day. */
  const lastDay = scheduled.length ? Math.max(...scheduled.map(s => s.day_number)) : 1;
  let tail = scheduled.filter(s => s.day_number === lastDay).length;
  const parked = leftovers.map(s => ({
    day_number: lastDay, sequence: ++tail, kind: 'customer', company_id: s.company_id,
    duration_min: s.duration_min || trip.default_visit_min,
    planned_arrival: null, planned_depart: null, leg_distance_m: null, leg_duration_s: null,
  }));

  const saved = await Trips.replaceStops(req.user.id, trip.id, [...scheduled, ...parked],
    { distance_m: totalDist, duration_s: totalDur });
  const nameOf = (cid) => customers.find(c => c.company_id === cid)?.company_name || 'a stop';
  res.json({
    ...saved,
    geometry: coordinates.length ? { type: 'LineString', coordinates } : null,
    home_each_night: homeEachNight,
    days: scheduled.length ? Math.max(...scheduled.map(s => s.day_number)) : 0,
    unscheduled: parked.map(p => nameOf(p.company_id)),
  });
}

export const dayBaseSchema = z.object({
  label: z.string().trim().max(120).optional(),
  address: z.string().trim().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(d => d.address || (d.lat != null && d.lng != null), {
  message: 'Give an address to look up, or a lat/lng.',
});

/** Set where one day starts — the hotel you wake up in. */
export async function setDayBase(req, res) {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1) return res.status(400).json({ error: 'Day must be 1 or more.' });

  let { lat, lng, address, label } = req.body;
  if (lat == null || lng == null) {
    const hit = await geocode({ address, country: 'Canada' });
    if (!hit) return res.status(422).json({ error: `Could not find "${address}" on the map. Try adding the city, or use the nearest intersection.` });
    ({ lat, lng } = hit);
  }
  const saved = await Trips.setDayBase(req.user.id, req.params.id, day, { label: label || address, address, lat, lng });
  if (!saved) return notFound(res);
  res.json({ ...saved, resolved: { lat, lng } });
}

/** Back to starting that day from home. */
export async function clearDayBase(req, res) {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1) return res.status(400).json({ error: 'Day must be 1 or more.' });
  const saved = await Trips.removeDayBase(req.user.id, req.params.id, day);
  if (!saved) return notFound(res);
  res.json(saved);
}

/**
 * POST /trips/:id/replan
 * Re-plan the rest of a day from wherever you are standing, right now.
 *
 * A planned day survives about as long as the first customer who keeps you
 * talking. This keeps everything already marked visited exactly as it happened,
 * takes the stops that are left, re-solves their order starting from your
 * current position, and re-times them against the clock you give it, the breaks
 * that haven't happened yet, and the end of your working day. Stops that no
 * longer fit are kept on the day without a time rather than being thrown away,
 * so you can decide what to drop instead of the software deciding for you.
 */
export async function replan(req, res) {
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const trip = await Trips.get(req.user.id, req.params.id);
  if (!trip) return notFound(res);

  const { return_home = true } = req.body;
  const fromHere = req.body.lat != null && req.body.lng != null;

  // Which day? Use the one asked for, else today if the trip covers it, else the first.
  let day = req.body.day;
  if (!day) {
    const day1 = new Date(trip.start_date);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const n = Math.round((today - day1) / 86400000) + 1;
    const maxDay = Math.max(...trip.stops.map(s => s.day_number), 1);
    day = (n >= 1 && n <= maxDay) ? n : 1;
  }
  /* Two ways in. With a position, you're standing somewhere mid-afternoon and we
     plan from there, now. Without one, you're rebuilding a day at the desk, so
     the day starts where the day starts.
     That second case uses the SAME fallback chain as Build route: the trip's own start point, then
     the rep's home base, then the first mapped stop. Without this, Recalculate
     failed on every trip made through the New Trip form — which never sets a
     start point — while Build route on the very same trip worked fine, because
     only it knew the chain. Two buttons, two answers, no way to tell why. */
  const homeBase = await resolveStart(trip, req.user.id, trip.stops.find(s => s.kind === 'customer' && s.lat != null));
  const { at } = dayBases(trip, homeBase);
  const here = fromHere ? { lat: req.body.lat, lng: req.body.lng } : at(day);
  if (!here) return res.status(400).json({ error: 'This trip has no start point, you have no home base set, and none of its stops are on the map yet — so there is nowhere to plan from. Set a home base, or re-plan from your current location.' });

  const fromMinutes = req.body.from_minutes ?? (fromHere
    ? (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })()
    : toMin(trip.work_start));

  const onDay = trip.stops.filter(s => s.day_number === day);
  const done = onDay.filter(s => s.kind === 'customer' && s.visited);
  const left = onDay.filter(s => s.kind === 'customer' && !s.visited);
  if (!left.length) return res.status(400).json({ error: `Nothing left to re-plan on day ${day} — every stop is marked visited.` });

  const noPin = left.filter(s => s.lat == null);
  if (noPin.length) {
    return res.status(400).json({ error: `${noPin.length} remaining stop(s) have no map location: ${noPin.map(s => s.company_name).join(', ')}` });
  }

  /* Where the day has to finish: tonight's lodging if one is set, otherwise
     home. Same three shapes as Build route — a loop when you end where you are
     standing, a fixed A-to-B when you end elsewhere, open-ended if you have
     said you are not going home. */
  const finish = return_home ? at(day + 1) : null;
  const loops = finish && samePlace(here, finish);
  const pts = (!finish || loops)
    ? [here, ...left.map(s => ({ lat: s.lat, lng: s.lng }))]
    : [here, ...left.map(s => ({ lat: s.lat, lng: s.lng })), finish];
  const solved = await optimizeOrder(pts,
    loops ? { roundTrip: true } : (finish ? { roundTrip: false, destination: 'last' } : { roundTrip: false }));
  const solvedStops = (finish && !loops) ? solved.order.slice(1, -1) : solved.order.slice(1);
  const ordered = solvedStops.map((i, k) => ({
    ...left[i - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
  }));

  // Re-time from now. Setting work_start to the current clock lets the normal
  // scheduler do the work; breaks already behind us are dropped from the day.
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dayDate = (() => { const d = new Date(trip.start_date); d.setUTCDate(d.getUTCDate() + day - 1); return d.toISOString().slice(0, 10); })();
  const stillToCome = trip.breaks.filter(b => toMin(b.starts_at) + b.duration_min > fromMinutes);
  const oneDay = { ...trip, start_date: dayDate, end_date: dayDate, work_start: hhmm(Math.min(fromMinutes, toMin(trip.work_end))) };
  const laid = scheduleStops(ordered, oneDay, stillToCome);

  const fitted = laid.filter(s => !s.unscheduled);
  const dropped = laid.filter(s => s.unscheduled);

  // Rebuild the day: what you already did, then the new plan, then whatever no
  // longer fits — kept, but with no time against it.
  let seq = 1;
  const rows = [
    ...done.map(s => ({ ...s, sequence: seq++, visited: true })),
    ...fitted.map(s => ({ ...s, sequence: seq++, visited: false })),
    ...dropped.map(s => ({ ...s, sequence: seq++, visited: false, planned_arrival: null, planned_depart: null, leg_distance_m: null, leg_duration_s: null })),
  ];

  const saved = await Trips.replaceDayStops(req.user.id, req.params.id, day, rows);
  if (!saved) return notFound(res);
  const nameOf = (id) => left.find(s => s.company_id === id)?.company_name || 'a stop';
  res.json({
    ...saved,
    geometry: solved.geometry,
    replanned_day: day,
    from: hhmm(fromMinutes),
    kept: done.length,
    rescheduled: fitted.filter(s => s.kind === 'customer').length,
    dropped: dropped.map(s => nameOf(s.company_id)),
  });
}

/** GET /trips/:id/directions?day=1 — turn-by-turn for a day (or whole trip) in stored order */
export async function getDirections(req, res) {
  const trip = await Trips.get(req.user.id, req.params.id);
  if (!trip) return notFound(res);
  const day = req.query.day ? Number(req.query.day) : null;
  const stops = trip.stops.filter(s => s.kind === 'customer' && s.lat != null && (day == null || s.day_number === day));
  if (!stops.length) return res.status(400).json({ error: 'No stops with locations for that day' });
  const start = await resolveStart(trip, req.user.id, stops[0]);
  const pts = [start, ...stops.map(s => ({ lat: s.lat, lng: s.lng }))];
  if (trip.end_lat != null) pts.push({ lat: trip.end_lat, lng: trip.end_lng });
  const result = await directions(pts);
  res.json({ ...result, stops: stops.map(s => ({ id: s.id, company_name: s.company_name, planned_arrival: s.planned_arrival })) });
}

async function resolveStart(trip, userId, fallbackStop) {
  if (trip.start_lat != null) return { lat: trip.start_lat, lng: trip.start_lng };
  const me = await Users.me(userId);
  if (me?.home_lat != null) return { lat: me.home_lat, lng: me.home_lng };
  return fallbackStop?.lat != null ? { lat: fallbackStop.lat, lng: fallbackStop.lng } : null;
}
