/**
 * Deciding which stops make up a day.
 *
 * This is the part that kept going wrong. Clustering stops by geography, or by
 * an estimate of a day's total time, failed the same way twice: a day would end
 * up over its hours, the overflow had nowhere to go, and stops were silently
 * dropped. The lesson was not to guess at the shape of a day before knowing
 * whether it fits.
 *
 * So: start each day at that day's origin and repeatedly take the nearest stop
 * you can still reach, visit, AND get to the day's FINISH from before
 * knocking-off time. When nothing else fits, the day is done.
 *
 * Most days finish where they began — out from home and back. A day on a real
 * road trip does not: it starts at home and ends at tonight's hotel, or starts
 * at one hotel and ends at the next. That is why a day has both a `from` and a
 * `to` rather than a single `home`.
 *
 * Travel here is a straight-line estimate (at `kmh`, plus a buffer for real
 * roads) used only to decide what fits. The real order and distances come from
 * the routing service afterwards, once the day's membership is settled.
 */

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

/** Rough km between two lat/lng points — good enough for grouping. */
export function km(a, b) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

const key = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/**
 * @param stops    objects with lat, lng and optionally duration_min
 * @param maxDays  how many days are available (must be finite)
 * @param opts
 *   home     a single point used as both ends of every day (the common case)
 *   baseFor  (dayNumber) => ({ from, to }) — takes precedence over `home`
 *   visitMin, workStart, workEnd, lunchMin, lunchAt, kmh, buffer
 *
 * @returns { days, leftover } where **days[i] is day i+1**, and may be an empty
 *   array: an empty day still occupies its number, because on a trip with
 *   hotels day 3 means "the day you set out from the London hotel" and cannot
 *   be silently renumbered. Callers should skip empty entries, not compact them.
 */
export function planDays(stops, maxDays, opts = {}) {
  const {
    home, baseFor, visitMin = 45, workStart = '08:30', workEnd = '17:00',
    lunchMin = 45, lunchAt = 12 * 60, kmh = 55, buffer = 1.2,
  } = opts;
  if (!home && !baseFor) throw new Error('planDays needs either a home position or a baseFor(day) function');
  if (!Number.isFinite(maxDays)) throw new Error('planDays needs a finite maxDays');

  const basesOf = baseFor || (() => ({ from: home, to: home }));
  const travel = (a, b) => (km(a, b) / kmh) * 60 * buffer;
  const visitOf = (s) => s.duration_min || visitMin;
  const ws = toMin(workStart), we = toMin(workEnd);

  let remaining = [...stops];
  const days = [];
  let lastEmptyShape = null;

  for (let d = 1; d <= maxDays && remaining.length; d++) {
    const { from, to } = basesOf(d);
    let clock = ws, pos = from, lunchTaken = false;
    const day = [];

    for (;;) {
      let best = -1, bestT = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const t = travel(pos, remaining[i]);
        if (t >= bestT) continue;                                // already have a closer one
        let arrive = clock + t;
        if (!lunchTaken && arrive >= lunchAt) arrive += lunchMin;
        const depart = arrive + visitOf(remaining[i]);
        if (depart + travel(remaining[i], to) > we) continue;     // couldn't reach tonight's finish
        bestT = t; best = i;
      }
      if (best < 0) break;

      const chosen = remaining[best];
      let arrive = clock + travel(pos, chosen);
      if (!lunchTaken && arrive >= lunchAt) { arrive += lunchMin; lunchTaken = true; }
      clock = arrive + visitOf(chosen);
      pos = chosen;
      day.push(chosen);
      remaining.splice(best, 1);
    }

    days.push(day);

    /* A day that came back empty means nothing left fits a day of THAT shape.
       When every day runs home-to-home the shapes are identical, so one empty
       day proves no later day can help — stop, rather than spinning out empty
       days to maxDays. With hotels the shapes differ, so an empty Tuesday says
       nothing about a Wednesday that sets out from somewhere else; only give up
       when the same shape comes back empty twice in a row. */
    if (!day.length) {
      const shape = `${key(from)}>${key(to)}`;
      if (shape === lastEmptyShape) break;
      lastEmptyShape = shape;
    } else {
      lastEmptyShape = null;
    }
  }

  while (days.length && !days[days.length - 1].length) days.pop();   // trim trailing empties
  return { days, leftover: remaining };
}
