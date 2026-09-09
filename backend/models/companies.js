import { query } from '../config/db.js';

/* Province filtering.
 *
 * A rep covers a territory, not a country. Troy's list carries 956 locations
 * from Victoria to St John's while he is responsible for six provinces, so
 * every screen was showing him four hundred customers he will never visit.
 *
 * The stored value is whatever the source system wrote -- full names in
 * Troy's case -- so a filter has to accept the short forms a person would
 * type as well. Everything is compared lowercased and trimmed; no unaccent
 * extension is assumed, hence the explicit accented spellings.
 */
const PROVINCE_ALIASES = {
  'ontario': ['ontario', 'on', 'ont'],
  'quebec': ['quebec', 'québec', 'qc', 'pq', 'que'],
  'new brunswick': ['new brunswick', 'nb', 'nouveau-brunswick'],
  'nova scotia': ['nova scotia', 'ns', 'nouvelle-écosse'],
  'prince edward island': ['prince edward island', 'pe', 'pei', 'île-du-prince-édouard'],
  'newfoundland and labrador': ['newfoundland and labrador', 'newfoundland', 'nl', 'nf', 'nfld'],
  'manitoba': ['manitoba', 'mb', 'man'],
  'saskatchewan': ['saskatchewan', 'sk', 'sask'],
  'alberta': ['alberta', 'ab', 'alta'],
  'british columbia': ['british columbia', 'bc', 'colombie-britannique'],
  'yukon': ['yukon', 'yt'],
  'northwest territories': ['northwest territories', 'nt', 'nwt'],
  'nunavut': ['nunavut', 'nu'],
};

/* "Ontario,QC" -> every spelling of both, ready for = ANY(). An unrecognised
   value is passed through as typed rather than dropped, so a filter on a
   US state still does something sensible. */
export function expandProvinces(csv) {
  const out = new Set();
  for (const raw of String(csv).split(',')) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    const key = Object.keys(PROVINCE_ALIASES).find(k => k === v || PROVINCE_ALIASES[k].includes(v));
    if (key) PROVINCE_ALIASES[key].forEach(a => out.add(a));
    else out.add(v);
  }
  return [...out];
}

const cols = `id, owner_id, company_code, name, address, city, postal_code, province, country, phone, website, notes,
  created_at, updated_at, tier, temperature, last_contact_at, last_purchase_at, next_touch_due, annual_value, lat, lng, inactive_365`;

export async function list(ownerId, { tier, temperature, city, postal_code, province, provinces, q, near, radius_km, due, limit, offset, fields } = {}) {
  const where = ['owner_id = $1']; const params = [ownerId];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (tier) add('tier = ?', tier);
  if (temperature) add('temperature = ?', temperature);
  if (city) add('lower(city) = lower(?)', city);
  /* provinces=all (or absent) means no restriction; the UI sends the rep's
     own list by default. `province` is kept as a single-value alias. */
  const provList = provinces && provinces !== 'all' ? provinces : (province && province !== 'all' ? province : null);
  if (provList) add('lower(btrim(province)) = ANY(?)', expandProvinces(provList));
  if (postal_code) add("upper(replace(postal_code,' ','')) LIKE upper(replace(?,' ',''))||'%'", postal_code);
  if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR company_code ILIKE $${params.length})`); }
  if (due === 'true') where.push('next_touch_due <= CURRENT_DATE');
  if (near) {
    const [lat, lng] = near.split(',').map(Number);
    params.push(lng, lat, (Number(radius_km) || 25) * 1000);
    where.push(`ST_DWithin(location, ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}),4326)::geography, $${params.length})`);
  }
  const whereSql = where.join(' AND ');

  // `fields=map` ships only what a pin needs, and only pinned companies —
  // a fraction of the payload when the map is all you're drawing.
  const isMap = fields === 'map';
  const select = isMap
    ? 'id, company_code, name, address, city, tier, temperature, lat, lng'   // no notes/dates — the bulk of the payload
    : cols;
  const mapOnly = isMap ? ' AND location IS NOT NULL' : '';

  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) {
    const { rows } = await query(
      `SELECT ${select} FROM company_overview WHERE ${whereSql}${mapOnly} ORDER BY name`, params);
    return rows;
  }

  // Paged: give back the slice plus the true total, so the UI can say "50 of 956".
  const take = Math.min(n, 200);
  const skip = Math.max(0, Number(offset) || 0);
  const [{ rows }, { rows: [count] }] = await Promise.all([
    query(`SELECT ${select} FROM company_overview WHERE ${whereSql}${mapOnly} ORDER BY name LIMIT ${take} OFFSET ${skip}`, params),
    query(`SELECT count(*)::int AS total FROM company_overview WHERE ${whereSql}${mapOnly}`, params),
  ]);
  return { rows, total: count.total, limit: take, offset: skip };
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

  const cf = ['tier', 'temperature', 'last_contact_at', 'last_purchase_at', 'annual_value', 'touch_interval_days'];
  const csets = []; const cparams = [id];
  for (const f of cf) if (f in data) { cparams.push(data[f]); csets.push(`${f}=$${cparams.length}`); }
  if (csets.length) await query(`UPDATE customers SET ${csets.join(',')} WHERE company_id=$1`, cparams);
  return get(ownerId, id);
}

export async function remove(ownerId, id) {
  const { rowCount } = await query('DELETE FROM companies WHERE owner_id=$1 AND id=$2', [ownerId, id]);
  return rowCount > 0;
}

/* Same territory rule as the list. Counting customers he does not cover would
   make the dashboard disagree with every screen it links to. */
export async function stats(ownerId, { provinces } = {}) {
  const params = [ownerId];
  let extra = '';
  if (provinces && provinces !== 'all') { params.push(expandProvinces(provinces)); extra = ` AND lower(btrim(province)) = ANY($${params.length})`; }
  const { rows } = await query(`
    SELECT tier, count(*)::int AS count, coalesce(sum(annual_value),0)::float AS value,
           count(*) FILTER (WHERE next_touch_due <= CURRENT_DATE)::int AS due
    FROM company_overview WHERE owner_id=$1${extra} GROUP BY tier`, params);
  return rows;
}
