import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/db.js';

const dir = path.resolve('../database/migrations');
await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  if (file === '002_demote_inactive.sql') continue; // scheduled job, not a migration
  process.stdout.write(`applying ${file}... `);
  await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  console.log('ok');
}
await pool.end();
