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
    `SELECT id, email, full_name, home_address, ST_Y(home_location::geometry) AS home_lat, ST_X(home_location::geometry) AS home_lng FROM users WHERE id=$1`, [id]);
  return rows[0] || null;
}
export async function setHome(id, { home_address, lat, lng }) {
  await query(`UPDATE users SET home_address=$2, home_location=ST_SetSRID(ST_MakePoint($4,$3),4326)::geography WHERE id=$1`, [id, home_address, lat, lng]);
  return me(id);
}
