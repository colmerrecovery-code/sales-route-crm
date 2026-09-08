import { query, withTransaction } from '../config/db.js';

const tripCols = `id, owner_id, name, status, start_date, end_date, work_start, work_end, default_visit_min, repeat_daily,
  ST_Y(start_location::geometry) AS start_lat, ST_X(start_location::geometry) AS start_lng,
  ST_Y(end_location::geometry) AS end_lat, ST_X(end_location::geometry) AS end_lng,
  total_distance_m, total_duration_s, created_at, updated_at`;

export async function list(ownerId) {
  const { rows } = await query(
    `SELECT ${tripCols}, (SELECT count(*)::int FROM trip_stops s WHERE s.trip_id=road_trips.id AND s.kind='customer') AS stop_count
       FROM road_trips WHERE owner_id=$1 ORDER BY start_date DESC`, [ownerId]);
  return rows;
}

export async function get(ownerId, id) {
  const { rows: [trip] } = await query(`SELECT ${tripCols} FROM road_trips WHERE owner_id=$1 AND id=$2`, [ownerId, id]);
  if (!trip) return null;
  const { rows: stops } = await query(
    `SELECT s.*, c.name AS company_name, c.company_code, c.address, c.city, c.postal_code,
            ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng, cu.tier, cu.temperature,
            b.label AS break_label, b.kind AS break_kind
       FROM trip_stops s LEFT JOIN companies c ON c.id=s.company_id LEFT JOIN customers cu ON cu.company_id=c.id
       LEFT JOIN break_times b ON b.id=s.break_id
      WHERE s.trip_id=$1 ORDER BY day_number, sequence`, [id]);
  const { rows: breaks } = await query('SELECT * FROM break_times WHERE trip_id=$1 ORDER BY starts_at', [id]);
  const { rows: day_bases } = await query(
    `SELECT day_number, label, address,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM trip_day_bases WHERE trip_id=$1 ORDER BY day_number`, [id]);
  return { ...trip, stops, breaks, day_bases };
}

/**
 * Set where a day STARTS. Day N's row is tonight-before's destination: the end
 * of day N-1 is wherever day N begins. See migration 003.
 */
export async function setDayBase(ownerId, tripId, day, { label, address, lat, lng }) {
  const { rows: [owned] } = await query('SELECT id FROM road_trips WHERE id=$1 AND owner_id=$2', [tripId, ownerId]);
  if (!owned) return null;
  await query(
    `INSERT INTO trip_day_bases (trip_id, day_number, label, address, location)
     VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($6,$5),4326)::geography)
     ON CONFLICT (trip_id, day_number)
     DO UPDATE SET label=EXCLUDED.label, address=EXCLUDED.address, location=EXCLUDED.location`,
    [tripId, day, label || null, address || null, lat, lng]);
  return get(ownerId, tripId);
}

export async function removeDayBase(ownerId, tripId, day) {
  const { rows: [owned] } = await query('SELECT id FROM road_trips WHERE id=$1 AND owner_id=$2', [tripId, ownerId]);
  if (!owned) return null;
  await query('DELETE FROM trip_day_bases WHERE trip_id=$1 AND day_number=$2', [tripId, day]);
  return get(ownerId, tripId);
}

const pt = (lat, lng, i) => (lat != null && lng != null) ? `ST_SetSRID(ST_MakePoint($${i + 1},$${i}),4326)::geography` : 'NULL';

export async function create(ownerId, d) {
  const params = [ownerId, d.name, d.start_date, d.end_date || null, d.work_start || '08:30', d.work_end || '17:00',
    d.default_visit_min || 45, d.repeat_daily ?? true];
  let startSql = 'NULL', endSql = 'NULL';
  if (d.start_lat != null) { params.push(d.start_lat, d.start_lng); startSql = pt(d.start_lat, d.start_lng, params.length - 1); }
  if (d.end_lat != null) { params.push(d.end_lat, d.end_lng); endSql = pt(d.end_lat, d.end_lng, params.length - 1); }
  const { rows } = await query(
    `INSERT INTO road_trips (owner_id, name, start_date, end_date, work_start, work_end, default_visit_min, repeat_daily, start_location, end_location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${startSql},${endSql}) RETURNING id`, params);
  return get(ownerId, rows[0].id);
}

export async function update(ownerId, id, d) {
  const fields = ['name', 'status', 'start_date', 'end_date', 'work_start', 'work_end', 'default_visit_min', 'repeat_daily'];
  const sets = []; const params = [ownerId, id];
  for (const f of fields) if (f in d) { params.push(d[f]); sets.push(`${f}=$${params.length}`); }
  if (d.start_lat != null) { params.push(d.start_lat, d.start_lng); sets.push(`start_location=${pt(d.start_lat, d.start_lng, params.length - 1)}`); }
  if (d.end_lat != null) { params.push(d.end_lat, d.end_lng); sets.push(`end_location=${pt(d.end_lat, d.end_lng, params.length - 1)}`); }
  if (sets.length) await query(`UPDATE road_trips SET ${sets.join(',')} WHERE owner_id=$1 AND id=$2`, params);
  return get(ownerId, id);
}

export async function remove(ownerId, id) {
  const { rowCount } = await query('DELETE FROM road_trips WHERE owner_id=$1 AND id=$2', [ownerId, id]);
  return rowCount > 0;
}

/** Append customer stops to a day (untimed until the day is recalculated). */
export async function addStops(ownerId, tripId, companyIds, durationMin, targetDay) {
  const trip = await get(ownerId, tripId);
  if (!trip) return null;
  let day, seq;
  if (targetDay) {
    day = targetDay;
    const onDay = trip.stops.filter(s => s.day_number === targetDay);
    seq = (onDay.at(-1)?.sequence || 0) + 1;
  } else {
    const last = trip.stops.at(-1);
    day = last?.day_number || 1; seq = (last?.sequence || 0) + 1;
  }
  const existing = new Set(trip.stops.map(s => s.company_id));
  for (const cid of companyIds) {
    if (existing.has(cid)) continue;
    await query(`INSERT INTO trip_stops (trip_id, day_number, sequence, kind, company_id, duration_min) VALUES ($1,$2,$3,'customer',$4,$5)`,
      [tripId, day, seq++, cid, durationMin || trip.default_visit_min]);
  }
  return get(ownerId, tripId);
}

export async function removeStop(ownerId, tripId, stopId) {
  const { rowCount } = await query(
    `DELETE FROM trip_stops WHERE id=$3 AND trip_id=$2 AND EXISTS (SELECT 1 FROM road_trips WHERE id=$2 AND owner_id=$1)`, [ownerId, tripId, stopId]);
  return rowCount > 0;
}

/**
 * Set how long every visit on a trip takes.
 *
 * Two things have to move together, which is why this is one call rather than a
 * loop of updateStop from the browser: the trip's default (what NEW stops
 * inherit) and the duration already stored on each existing stop. Changing only
 * the default silently does nothing to the day you are looking at.
 *
 * Visited stops are left alone — they already happened, and rewriting how long
 * they took would be a lie.
 */
export async function setVisitLength(ownerId, tripId, minutes) {
  const { rows: [owned] } = await query('SELECT id FROM road_trips WHERE id=$1 AND owner_id=$2', [tripId, ownerId]);
  if (!owned) return null;
  await query('UPDATE road_trips SET default_visit_min=$2 WHERE id=$1', [tripId, minutes]);
  const { rowCount } = await query(
    `UPDATE trip_stops SET duration_min=$2
      WHERE trip_id=$1 AND kind='customer' AND NOT visited`, [tripId, minutes]);
  return { trip: await get(ownerId, tripId), changed: rowCount };
}

export async function updateStop(ownerId, tripId, stopId, d) {
  const fields = ['duration_min', 'visited', 'notes'];
  const sets = []; const params = [ownerId, tripId, stopId];
  for (const f of fields) if (f in d) { params.push(d[f]); sets.push(`${f}=$${params.length}`); }

  /* Moving a stop to another day drops its old timings — it has to be
     recalculated against that day's schedule before the times mean anything. */
  if (d.day_number) {
    const { rows: [tail] } = await query(
      'SELECT coalesce(max(sequence),0) AS n FROM trip_stops WHERE trip_id=$1 AND day_number=$2',
      [tripId, d.day_number]);
    params.push(d.day_number, Number(tail.n) + 1);
    sets.push(`day_number=$${params.length - 1}`, `sequence=$${params.length}`,
              'planned_arrival=NULL', 'planned_depart=NULL', 'leg_distance_m=NULL', 'leg_duration_s=NULL');
  }
  if (!sets.length) return null;
  const { rows } = await query(
    `UPDATE trip_stops SET ${sets.join(',')} WHERE id=$3 AND trip_id=$2 AND EXISTS (SELECT 1 FROM road_trips WHERE id=$2 AND owner_id=$1) RETURNING *`, params);
  return rows[0] || null;
}

/** Replace all stops with a freshly scheduled list (inside a transaction). */
export async function replaceStops(ownerId, tripId, scheduled, totals) {
  return withTransaction(async (c) => {
    await c.query('DELETE FROM trip_stops WHERE trip_id=$1', [tripId]);
    for (const s of scheduled) {
      await c.query(
        `INSERT INTO trip_stops (trip_id, day_number, sequence, kind, company_id, break_id, planned_arrival, planned_depart,
                                 duration_min, leg_distance_m, leg_duration_s)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tripId, s.day_number, s.sequence, s.kind, s.company_id || null, s.break_id || null, s.planned_arrival || null,
          s.planned_depart || null, s.duration_min, s.leg_distance_m ?? null, s.leg_duration_s ?? null]);
    }
    await c.query('UPDATE road_trips SET total_distance_m=$2, total_duration_s=$3, status=CASE WHEN status=\'draft\' THEN \'planned\' ELSE status END WHERE id=$1',
      [tripId, totals.distance_m, totals.duration_s]);
  }).then(() => get(ownerId, tripId));
}

/**
 * Replace the stops of ONE day, leaving every other day untouched.
 *
 * Re-planning mid-afternoon must not disturb the rest of the week, so this is
 * scoped to a single day rather than going through replaceStops. Trip totals are
 * recomputed afterwards from whatever legs remain, so the header stays honest.
 */
export async function replaceDayStops(ownerId, tripId, day, rows) {
  return withTransaction(async (c) => {
    const { rows: [owned] } = await c.query('SELECT 1 FROM road_trips WHERE id=$1 AND owner_id=$2', [tripId, ownerId]);
    if (!owned) return null;
    await c.query('DELETE FROM trip_stops WHERE trip_id=$1 AND day_number=$2', [tripId, day]);
    for (const s of rows) {
      await c.query(
        `INSERT INTO trip_stops (trip_id, day_number, sequence, kind, company_id, break_id, planned_arrival, planned_depart,
                                 duration_min, leg_distance_m, leg_duration_s, visited, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tripId, day, s.sequence, s.kind, s.company_id || null, s.break_id || null,
         s.planned_arrival || null, s.planned_depart || null, s.duration_min,
         s.leg_distance_m ?? null, s.leg_duration_s ?? null, !!s.visited, s.notes ?? null]);
    }
    await c.query(`
      UPDATE road_trips SET
        total_distance_m = (SELECT coalesce(sum(leg_distance_m),0)::int FROM trip_stops WHERE trip_id=$1),
        total_duration_s = (SELECT coalesce(sum(leg_duration_s),0)::int FROM trip_stops WHERE trip_id=$1)
      WHERE id=$1`, [tripId]);
    return true;
  }).then((ok) => ok ? get(ownerId, tripId) : null);
}

export async function addBreak(ownerId, tripId, d) {
  const { rows } = await query(
    `INSERT INTO break_times (trip_id, kind, label, starts_at, duration_min, only_on_day)
     SELECT $2,$3,$4,$5,$6,$7 WHERE EXISTS (SELECT 1 FROM road_trips WHERE id=$2 AND owner_id=$1) RETURNING *`,
    [ownerId, tripId, d.kind || 'lunch', d.label || null, d.starts_at, d.duration_min || 60, d.only_on_day ?? null]);
  return rows[0] || null;
}

export async function removeBreak(ownerId, tripId, breakId) {
  const { rowCount } = await query(
    `DELETE FROM break_times WHERE id=$3 AND trip_id=$2 AND EXISTS (SELECT 1 FROM road_trips WHERE id=$2 AND owner_id=$1)`, [ownerId, tripId, breakId]);
  return rowCount > 0;
}
