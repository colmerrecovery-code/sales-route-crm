/**
 * Lay an ordered list of customer stops onto working days, inserting breaks
 * and rolling to the next day when the working window is exhausted.
 *
 * stops: [{ company_id, duration_min, leg_duration_s, leg_distance_m }]
 * trip:  { start_date, end_date, work_start, work_end, repeat_daily }
 * breaks:[{ id, starts_at, duration_min, only_on_day, label, kind }]
 */
export function scheduleStops(stops, trip, breaks) {
  const out = [];
  const [ws, we] = [toMin(trip.work_start), toMin(trip.work_end)];
  const maxDays = trip.end_date ? daysBetween(trip.start_date, trip.end_date) + 1 : Infinity;

  let day = 1, clock = ws, seq = 1;
  let remaining = [...stops];
  const breaksFor = (d) => breaks
    .filter(b => b.only_on_day == null ? (trip.repeat_daily || d === 1) : b.only_on_day === d)
    .map(b => ({ ...b, start: toMin(b.starts_at), end: toMin(b.starts_at) + b.duration_min }))
    .sort((a, b) => a.start - b.start);
  let dayBreaks = breaksFor(day), usedBreaks = new Set();

  const pushBreak = (b) => {
    out.push({ day_number: day, sequence: seq++, kind: 'break', break_id: b.id, duration_min: b.duration_min,
      planned_arrival: at(trip.start_date, day, b.start), planned_depart: at(trip.start_date, day, b.end) });
    usedBreaks.add(b.id); clock = Math.max(clock, b.end);
  };

  while (remaining.length) {
    const s = remaining[0];
    const travel = Math.ceil((s.leg_duration_s || 0) / 60);
    let arrive = clock + travel;
    // Any break that would start before we arrive? Emit it first.
    for (const b of dayBreaks) if (!usedBreaks.has(b.id) && b.start <= arrive) pushBreak(b), arrive = Math.max(arrive, clock + travel);
    // Would this visit overlap a break? Push arrival past the break.
    for (const b of dayBreaks) if (!usedBreaks.has(b.id) && arrive < b.end && arrive + s.duration_min > b.start) { pushBreak(b); arrive = b.end; }
    const depart = arrive + s.duration_min;
    if (depart > we) {
      // Roll to next day
      if (day + 1 > maxDays) { out.push(...remaining.map(r => ({ ...r, unscheduled: true }))); break; }
      day++; clock = ws; seq = 1; dayBreaks = breaksFor(day); usedBreaks = new Set();
      continue;
    }
    out.push({ day_number: day, sequence: seq++, kind: 'customer', company_id: s.company_id, duration_min: s.duration_min,
      leg_distance_m: s.leg_distance_m ?? null, leg_duration_s: s.leg_duration_s ?? null,
      planned_arrival: at(trip.start_date, day, arrive), planned_depart: at(trip.start_date, day, depart) });
    clock = depart; remaining.shift();
  }
  return out;
}

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const at = (startDate, day, minutes) => {
  const d = new Date(startDate); d.setUTCDate(d.getUTCDate() + day - 1); d.setUTCHours(0, minutes, 0, 0); return d.toISOString();
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
