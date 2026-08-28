import { query } from '../config/db.js';

export async function listForCompany(ownerId, companyId, limit = 50) {
  const { rows } = await query(
    `SELECT i.*, cl.first_name || ' ' || coalesce(cl.last_name,'') AS client_name
       FROM interactions i JOIN companies c ON c.id=i.company_id LEFT JOIN clients cl ON cl.id=i.client_id
      WHERE c.owner_id=$1 AND i.company_id=$2 ORDER BY occurred_at DESC LIMIT $3`, [ownerId, companyId, limit]);
  return rows;
}

export async function create(ownerId, d) {
  const { rows } = await query(
    `INSERT INTO interactions (company_id, client_id, user_id, kind, occurred_at, summary, outcome)
     SELECT $2,$3,$1,$4,coalesce($5, now()),$6,$7 WHERE EXISTS (SELECT 1 FROM companies WHERE id=$2 AND owner_id=$1)
     RETURNING *`, [ownerId, d.company_id, d.client_id || null, d.kind, d.occurred_at || null, d.summary, d.outcome]);
  return rows[0] || null;
}
