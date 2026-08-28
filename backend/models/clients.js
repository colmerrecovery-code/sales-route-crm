import { query } from '../config/db.js';

const owned = `EXISTS (SELECT 1 FROM companies c WHERE c.id = clients.company_id AND c.owner_id = $1)`;

export async function listForCompany(ownerId, companyId) {
  const { rows } = await query(`SELECT * FROM clients WHERE company_id=$2 AND ${owned} ORDER BY is_primary DESC, last_name, first_name`, [ownerId, companyId]);
  return rows;
}

export async function create(ownerId, companyId, d) {
  const { rows: [c] } = await query('SELECT company_code FROM companies WHERE id=$2 AND owner_id=$1', [ownerId, companyId]);
  if (!c) return null;
  const { rows: [n] } = await query('SELECT count(*)::int + 1 AS n FROM clients WHERE company_id=$1', [companyId]);
  const code = `${c.company_code}-${String(n.n).padStart(2, '0')}`;
  const { rows } = await query(
    `INSERT INTO clients (company_id, client_code, first_name, last_name, title, email, phone, is_primary, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId, code, d.first_name, d.last_name, d.title, d.email, d.phone, !!d.is_primary, d.notes]);
  return rows[0];
}

export async function update(ownerId, id, d) {
  const fields = ['first_name', 'last_name', 'title', 'email', 'phone', 'is_primary', 'notes'];
  const sets = []; const params = [ownerId, id];
  for (const f of fields) if (f in d) { params.push(d[f]); sets.push(`${f}=$${params.length}`); }
  if (!sets.length) return null;
  const { rows } = await query(`UPDATE clients SET ${sets.join(',')} WHERE id=$2 AND ${owned} RETURNING *`, params);
  return rows[0] || null;
}

export async function remove(ownerId, id) {
  const { rowCount } = await query(`DELETE FROM clients WHERE id=$2 AND ${owned}`, [ownerId, id]);
  return rowCount > 0;
}
