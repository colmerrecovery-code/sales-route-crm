import { query } from '../config/db.js';

export async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email=$1', [email]);
  return rows[0] || null;
}
export async function create({ email, password_hash, full_name }) {
  const { rows } = await query(
    'INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email, full_name, created_at',
    [email, password_hash, full_name]);
  return rows[0];
}
export async function me(id) {
  const { rows } = await query(
    `SELECT id, email, full_name, home_address,
            ST_Y(home_location::geometry) AS home_lat, ST_X(home_location::geometry) AS home_lng,
            touch_days_tier1, touch_days_tier2, touch_days_tier3, touch_days_tier4
       FROM users WHERE id=$1`, [id]);
  return rows[0] || null;
}
/**
 * How often this rep comes back round to a customer, per tier.
 *
 * The second query looks pointless — it writes each customer's interval back to
 * itself — but it is what makes a changed default take effect. next_touch_due
 * is maintained by a trigger on the customers row, so without touching those
 * rows a new default would not apply until each customer was next contacted,
 * and the rep would think the setting had done nothing.
 */
export async function setCadence(id, days) {
  const cols = ['touch_days_tier1', 'touch_days_tier2', 'touch_days_tier3', 'touch_days_tier4'];
  const sets = []; const params = [id];
  for (const c of cols) if (c in days) { params.push(days[c]); sets.push(`${c}=$${params.length}`); }
  if (sets.length) await query(`UPDATE users SET ${sets.join(',')} WHERE id=$1`, params);

  await query(`
    UPDATE customers cu SET touch_interval_days = cu.touch_interval_days
      FROM companies c WHERE c.id = cu.company_id AND c.owner_id = $1`, [id]);
  return me(id);
}

export async function setHome(id, { home_address, lat, lng }) {
  await query(`UPDATE users SET home_address=$2, home_location=ST_SetSRID(ST_MakePoint($4,$3),4326)::geography WHERE id=$1`, [id, home_address, lat, lng]);
  return me(id);
}
