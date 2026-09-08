/**
 * Import merged customer locations + contacts into a user's account.
 *
 *   docker compose exec backend node scripts/import-customers.js --list
 *   docker compose exec backend node scripts/import-customers.js --user you@example.com --dry-run
 *   docker compose exec backend node scripts/import-customers.js --user you@example.com
 *   docker compose exec backend node scripts/import-customers.js --user you@example.com --geocode
 *
 * Reads 1_Locations.csv and 2_Contacts.csv from --dir (default /database/import).
 * Safe to re-run: a location already present for this user (same company_code) is skipped,
 * and its contacts are topped up rather than duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pool, query, withTransaction } from '../config/db.js';
import { geocode, geocodeSelfTest } from '../services/geo.js';

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = opt('dir', '/database/import');
const DRY = flag('dry-run');
const GEO = flag('geocode');
const EMAIL = opt('user', null);
const ACTIVE_MONTHS = Number(opt('active-months', 24));

// ---------- tiny RFC4180 CSV reader ----------
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim() !== ''))
             .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const read = (f) => parseCSV(fs.readFileSync(path.join(DIR, f), 'utf8'));
const nul = (v) => (v && v.trim() !== '' && v.toLowerCase() !== 'nan' ? v.trim() : null);

// ---------- map-service self test ----------
if (flag('test-map')) {
  const r = await geocodeSelfTest();
  console.log('\nChecking the map lookup services with one known Calgary address:\n');
  for (const [name, v] of Object.entries(r)) {
    const label = name === 'nominatim' ? 'OpenStreetMap' : 'Photon (backup)';
    console.log(`  ${label.padEnd(18)} HTTP ${String(v.status ?? '-').padEnd(5)} ${v.hit ? 'found it' : (v.error || 'no result')}`);
  }
  const any = Object.values(r).some(v => v.hit);
  console.log(any ? '\nAt least one service is answering. Good to go.\n'
                  : '\nNeither service answered. Wait a while and try again.\n');
  await pool.end(); process.exit(any ? 0 : 2);
}

// ---------- user ----------
/* Which account is "yours"? The one with customers in it. A second, empty
   account is easy to create by accident on a phone, and guessing wrong would
   plan a trip in the wrong place. */
if (flag('main-user')) {
  const { rows } = await query(`
    SELECT u.email, count(c.id)::int AS companies
      FROM users u LEFT JOIN companies c ON c.owner_id = u.id
     WHERE u.email <> 'demo@example.com'
     GROUP BY u.email ORDER BY companies DESC, u.email`);
  if (!rows.length) { console.error('No account other than the demo login.'); await pool.end(); process.exit(1); }
  const withData = rows.filter(r => r.companies > 0);
  if (withData.length === 1) { console.log(withData[0].email); await pool.end(); process.exit(0); }
  if (withData.length === 0 && rows.length === 1) { console.log(rows[0].email); await pool.end(); process.exit(0); }
  console.error('More than one account has customers: ' + rows.map(r => `${r.email} (${r.companies})`).join(', '));
  await pool.end(); process.exit(1);
}

if (flag('print-users')) {
  const { rows } = await query("SELECT email FROM users WHERE email <> 'demo@example.com' ORDER BY created_at");
  console.log(rows.map(r => r.email).join(' '));
  await pool.end(); process.exit(0);
}
if (flag('list') || !EMAIL) {
  const { rows } = await query('SELECT email, full_name, created_at FROM users ORDER BY created_at');
  console.log('\nAccounts in this database:');
  for (const u of rows) console.log(`  ${u.email.padEnd(32)} ${u.full_name}`);
  console.log(`\nRe-run with:  --user <email>   (add --dry-run first)\n`);
  await pool.end(); process.exit(0);
}
const { rows: [user] } = await query('SELECT id, email FROM users WHERE email=$1', [EMAIL]);
if (!user) { console.error(`No account with email "${EMAIL}". Run with --list to see them.`); await pool.end(); process.exit(1); }

// ---------- load ----------
const locs = read('1_Locations.csv');
const cons = read('2_Contacts.csv');
console.log(`Read ${locs.length} locations and ${cons.length} contacts from ${DIR}`);

const byCode = new Map();
for (const c of cons) {
  if (!byCode.has(c['Customer Code'])) byCode.set(c['Customer Code'], []);
  byCode.get(c['Customer Code']).push(c);
}

const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - ACTIVE_MONTHS);
const tierFor = (l) => {
  const d = Date.parse(l['Last Record']);
  return Number.isFinite(d) && d >= cutoff.getTime() ? 'tier1' : 'tier3';
};

const existing = new Set((await query('SELECT company_code FROM companies WHERE owner_id=$1', [user.id])).rows.map(r => r.company_code));
const todo = locs.filter(l => !existing.has(l['Customer Code']));
const tally = { tier1: 0, tier3: 0, mappable: 0, contacts: 0 };
for (const l of todo) {
  tally[tierFor(l)]++;
  if (nul(l.Address) && nul(l.City)) tally.mappable++;
  tally.contacts += (byCode.get(l['Customer Code']) || []).length;
}

console.log(`\nAccount:            ${user.email}`);
console.log(`Already imported:   ${existing.size}`);
console.log(`To import:          ${todo.length} locations, ${tally.contacts} contacts`);
console.log(`  tier1 (active, last record < ${ACTIVE_MONTHS} months):  ${tally.tier1}`);
console.log(`  tier3 (dormant):                            ${tally.tier3}`);
console.log(`  with a mappable address:                    ${tally.mappable}`);

if (DRY) { console.log('\n--dry-run: nothing written.\n'); await pool.end(); process.exit(0); }
const ANYGEO = GEO || flag('geocode-retry');
if (!todo.length && !ANYGEO) { console.log('\nNothing new to import.\n'); await pool.end(); process.exit(0); }
if (!todo.length) console.log('\nNothing new to import — going straight to the map.');

// ---------- write ----------
let done = 0, contactsWritten = 0;
for (const l of todo) {
  await withTransaction(async (c) => {
    const { rows: [co] } = await c.query(
      `INSERT INTO companies (owner_id, company_code, name, address, city, postal_code, province, country, phone, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [user.id, l['Customer Code'], l['Customer (import name)'], nul(l.Address), nul(l.City),
       nul(l['Postal Code']), nul(l.Province), nul(l.Country) || 'Canada', nul(l.Phone),
       `Imported ${new Date().toISOString().slice(0, 10)} from the merged customer list. `
       + `Parent company: ${l['Parent Company']}. Records on file ${l['First Record']} to ${l['Last Record']}.`
       + (nul(l.Needs) ? ` Needs attention: ${l.Needs}.` : '')]);
    await c.query('INSERT INTO customers (company_id, tier) VALUES ($1,$2)', [co.id, tierFor(l)]);

    const people = byCode.get(l['Customer Code']) || [];
    let n = 0;
    for (const p of people) {
      n++;
      await c.query(
        `INSERT INTO clients (company_id, client_code, first_name, last_name, email, phone, is_primary, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [co.id, `${l['Customer Code']}-${String(n).padStart(2, '0')}`,
         nul(p['First Name']) || '(no first name)', nul(p['Last Name']),
         nul(p.Email), nul(p['Business Phone']) || nul(p.Mobile), n === 1,
         nul(p['On File Since']) ? `On file since ${p['On File Since']}.` : null]);
      contactsWritten++;
    }
  });
  if (++done % 100 === 0) console.log(`  ...${done}/${todo.length} locations`);
}
if (done) console.log(`\nImported ${done} locations and ${contactsWritten} contacts.`);

// ---------- second-pass geocoding for the ones the first pass missed ----------
/** Nominatim struggles with Canadian unit prefixes. Try progressively looser queries. */
function addressVariants(r) {
  const out = [];
  const a = (r.address || '').trim();
  if (a) {
    out.push(a);
    // drop a leading unit/bay/suite/door token: "Bay #10, 5251-48 Avenue S.E" -> "5251-48 Avenue S.E"
    let v = a.replace(/^\s*(unit|bay|suite|ste|apt|door|bldg|building|#)\s*[#]?\s*[\w-]+\s*[,\-]?\s*/i, '').trim();
    // drop a "102-1437 " style unit prefix, keeping the street number
    v = v.replace(/^\s*\d+\s*-\s*(?=\d)/, '').trim();
    // collapse "5251-48 Avenue" -> "5251 48 Avenue"
    const w = v.replace(/(\d)\s*-\s*(\d)/, '$1 $2').trim();
    if (v && v !== a) out.push(v);
    if (w && w !== v) out.push(w);
  }
  return out;
}
if (flag('geocode-retry')) {
  const { rows } = await query(
    `SELECT id, name, address, city, postal_code, province, country FROM companies
      WHERE owner_id=$1 AND location IS NULL`, [user.id]);
  console.log(`\nRetrying ${rows.length} locations the first pass could not place.`);
  console.log('Three attempts each: a tidied street address, then the postal code, then the town centre.\n');
  let street = 0, postal = 0, town = 0, none = 0;
  for (const [i, r] of rows.entries()) {
    let hit = null, how = '';
    for (const v of addressVariants(r)) {
      hit = await geocode({ ...r, address: v });
      await new Promise(res => setTimeout(res, 1100));
      if (hit) { how = 'street'; break; }
    }
    if (!hit && r.postal_code) {
      hit = await geocode({ address: null, city: null, postal_code: r.postal_code, province: r.province, country: r.country });
      await new Promise(res => setTimeout(res, 1100));
      if (hit) how = 'postal';
    }
    if (!hit && r.city) {
      hit = await geocode({ address: null, city: r.city, postal_code: null, province: r.province, country: r.country });
      await new Promise(res => setTimeout(res, 1100));
      if (hit) how = 'town';
    }
    if (hit) {
      await query('UPDATE companies SET location=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id=$3', [hit.lng, hit.lat, r.id]);
      if (how === 'street') street++; else if (how === 'postal') postal++; else town++;
      if (how !== 'street') await query(
        `UPDATE companies SET notes = coalesce(notes,'') || $2 WHERE id=$1`,
        [r.id, how === 'postal'
          ? ' Map pin is approximate — placed from the postal code, not the street address.'
          : ' Map pin is approximate — placed at the town centre, not the street address.']);
    } else none++;
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${rows.length}  (${street} exact, ${postal} by postal code, ${town} by town, ${none} still unplaced)`);
  }
  console.log(`\nPlaced ${street} exactly, ${postal} from the postal code, ${town} at the town centre.`);
  console.log(`${none} could not be placed at all — their addresses need a look.`);
  console.log('Anything approximate says so in the customer notes.');
  await pool.end(); process.exit(0);
}

// ---------- geocoding ----------
if (GEO) {
  const { rows } = await query(
    `SELECT id, address, city, postal_code, province, country FROM companies
      WHERE owner_id=$1 AND location IS NULL AND address IS NOT NULL AND city IS NOT NULL`, [user.id]);
  console.log(`\nGeocoding ${rows.length} addresses (about 1 per second — roughly ${Math.ceil(rows.length / 60)} minutes).`);
  console.log('Safe to stop with Ctrl+C and re-run later; it picks up where it left off.\n');
  let ok = 0, miss = 0;
  for (const [i, r] of rows.entries()) {
    try {
      const hit = await geocode(r);
      if (hit) {
        await query('UPDATE companies SET location=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id=$3', [hit.lng, hit.lat, r.id]);
        ok++;
      } else miss++;
    } catch { miss++; }
    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${rows.length}  (${ok} placed, ${miss} not found)`);
    await new Promise(res => setTimeout(res, 1100));
  }
  console.log(`\nGeocoded ${ok} locations. ${miss} could not be placed — check their addresses on the Needs Review list.`);
} else {
  console.log('\nNothing is on the map yet. Add --geocode to place them (takes a while, and is resumable).');
}
await pool.end();
