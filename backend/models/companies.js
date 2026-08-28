import { query } from '../config/db.js';

const cols = `id, owner_id, company_code, name, address, city, postal_code, province, country, phone, website, notes,
  created_at, updated_at, tier, temperature, last_contact_at, last_purchase_at, next_touch_due, annual_value, lat, lng, inactive_365`;

export async function list(ownerId, { tier, temperature, city, postal_code, q, near, radius_km, due } = {}) {
  const where = ['owner_id = $1']; const params = [ownerId];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (tier) add('tier = ?', tier);
  if (temperature) add('temperature = ?', temperature);
  if (city) add('lower(city) = lower(?)', city);
  if (postal_code) add("upper(replace(postal_code,' ','')) LIKE upper(replace(?,' ',''))||'%'", postal_code);
  if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR company_code ILIKE $${params.length})`); }
  if (due === 'true') where.push('next_touch_due <= CURRENT_DATE');
  if (near) {
    const [lat, lng] = near.split(',').map(Number);
    params.push(lng, lat, (Number(radius_km) || 25) * 1000);
    where.push(`ST_DWithin(location, ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}),4326)::geography, $${params.length})`);
  }
  const { rows } = await query(`SELECT ${cols} FROM company_overview WHERE ${where.join(' AND ')} ORDER BY name`, params);
  return rows;
}

export async function get(ownerId, id) {
  const { rows } = await query(`SELECT ${cols} FROM company_overview WHERE owner_id=$1 AND id=$2`, [ownerId, id]);
  return rows[0] || null;
}

export async function nextCode(ownerId) {
  const { rows } = await query(
    `SELECT COALESCE(MAX(substring(company_code from '\\d+$')::int), 1000) + 1 AS n FROM companies WHERE owner_id=$1`, [ownerId]);
  return `C-${String(rows[0].n).padStart(6, '0')}`;
}

export async function create(ownerId, data, geo) {
  const code = data.company_code || await nextCode(ownerId);
  const { rows } = await query(
    `INSERT INTO companies (owner_id, company_code, name, address, city, postal_code, province, country, phone, website, notes, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, ${geo ? 'ST_SetSRID(ST_MakePoint($12,$13),4326)::geography' : 'NULL'}) RETURNING id`,
    [ownerId, code, data.name, data.address, data.city, data.postal_code, data.province, data.country, data.phone, data.website, data.notes,
      ...(geo ? [geo.lng, geo.lat] : [])]);
  const id = rows[0].id;
  await query(`INSERT INTO customers (company_id, tier, temperature, last_contact_at, last_purchase_at, annual_value)
               VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, data.tier || 'tier2', data.temperature || null, data.last_contact_at || null, data.last_purchase_at || null, data.annual_value || null]);
  return get(ownerId, id);
}

export async function update(ownerId, id, data, geo) {
  const fields = ['name', 'address', 'city', 'postal_code', 'province', 'country', 'phone', 'website', 'notes'];
  const sets = []; const params = [ownerId, id];
  for (const f of fields) if (f in data) { params.push(data[f]); sets.push(`${f}=$${params.length}`); }
  if (geo) { params.push(geo.lng, geo.lat); sets.push(`location=ST_SetSRID(ST_MakePoint($${params.length - 1},$${params.length}),4326)::geography`); }
  if (sets.length) await query(`UPDATE companies SET ${sets.join(',')} WHERE owner_id=$1 AND id=$2`, params);

  const cf = ['tier', 'temperature', 'last_contact_at', 'last_purchase_at', 'annual_value'];
  const csets = []; const cparams = [id];
  for (const f of cf) if (f in data) { cparams.push(data[f]); csets.push(`${f}=$${cparams.length}`); }
  if (csets.length) await query(`UPDATE customers SET ${csets.join(',')} WHERE company_id=$1`, cparams);
  return get(ownerId, id);
}

export async function remove(ownerId, id) {
  const { rowCount } = await query('DELETE FROM companies WHERE owner_id=$1 AND id=$2', [ownerId, id]);
  return rowCount > 0;
}

export async function stats(ownerId) {
  const { rows } = await query(`
    SELECT tier, count(*)::int AS count, coalesce(sum(annual_value),0)::float AS value,
           count(*) FILTER (WHERE next_touch_due <= CURRENT_DATE)::int AS due
    FROM company_overview WHERE owner_id=$1 GROUP BY tier`, [ownerId]);
  return rows;
}
