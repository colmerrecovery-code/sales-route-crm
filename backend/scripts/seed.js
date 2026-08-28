import fs from 'node:fs';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';

let sql = fs.readFileSync('../database/seed-data.sql', 'utf8');
// Replace the placeholder hash with a real bcrypt hash for "demo1234"
sql = sql.replace(/'\$2b\$10\$[^']+'/, `'${await bcrypt.hash('demo1234', 10)}'`);
await pool.query(sql);
console.log('seeded demo data (login: demo@example.com / demo1234)');
await pool.end();
