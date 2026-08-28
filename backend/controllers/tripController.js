import { z } from 'zod';
import * as Trips from '../models/trips.js';
import * as Users from '../models/users.js';
import { optimizeOrder, directions } from '../services/geo.js';
import { scheduleStops } from '../services/scheduler.js';

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const tripSchema = z.object({
  name: z.string().trim().min(1), start_date: date, end_date: date.nullish(), work_start: time.optional(), work_end: time.optional(),
  default_visit_min: z.number().int().positive().optional(), repeat_daily: z.boolean().optional(),
  start_lat: z.number().optional(), start_lng: z.number().optional(), end_lat: z.number().optional(), end_lng: z.number().optional(),
  status: z.enum(['draft', 'planned', 'in_progress', 'completed', 'cancelled']).optional(),
});
export const tripPatchSchema = tripSchema.partial();
export const addStopsSchema = z.object({ company_ids: z.array(z.string().uuid()).min(1), duration_min: z.number().int().positive().optional() });
export const stopPatchSchema = z.object({ duration_min: z.number().int().positive().optional(), visited: z.boolean().optional(), notes: z.string().nullish() });
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
  const t = await Trips.addStops(req.user.id, req.params.id, req.body.company_ids, req.body.duration_min);
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
export async function optimize(req, res) {
  const trip = await Trips.get(req.user.id, req.params.id);
  if (!trip) return notFound(res);
  const customers = trip.stops.filter(s => s.kind === 'customer');
  const missing = customers.filter(s => s.lat == null);
  if (missing.length) {
    return res.status(400).json({ error: `${missing.length} stop(s) have no map location yet: ${missing.map(m => m.company_name).join(', ')}` });
  }
  const start = await resolveStart(trip, req.user.id, customers[0]);
  const pts = [start, ...customers.map(s => ({ lat: s.lat, lng: s.lng }))];
  const roundTrip = req.body?.round_trip ?? true;
  const solved = await optimizeOrder(pts, { roundTrip });
  // solved.order includes the start (index 0) first; map the rest back to stops
  const ordered = solved.order.slice(1).map((i, k) => ({
    ...customers[i - 1], leg_distance_m: solved.legs[k]?.distance_m, leg_duration_s: solved.legs[k]?.duration_s,
  }));
  const scheduled = scheduleStops(ordered, trip, trip.breaks);
  const unscheduled = scheduled.filter(s => s.unscheduled);
  const saved = await Trips.replaceStops(req.user.id, trip.id, scheduled.filter(s => !s.unscheduled), solved);
  res.json({ ...saved, geometry: solved.geometry, unscheduled: unscheduled.map(u => u.company_name) });
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
  return { lat: fallbackStop.lat, lng: fallbackStop.lng };
}
