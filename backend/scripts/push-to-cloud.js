/**
 * Copy customer LOCATIONS from the Mac database up to the GoMichi on Render.
 *
 *   docker compose exec -T backend node scripts/push-to-cloud.js --dry-run
 *   docker compose exec -T backend node scripts/push-to-cloud.js
 *
 * What goes: company code, name, address, city, postal code, province, country,
 * tier, and the coordinates already worked out on this Mac.
 *
 * What stays here: every contact -- names, direct emails, mobiles -- and the
 * companies' phone numbers. A company name and street address is public
 * information; the named people at them are not, and the cloud copy exists to
 * plan routes, not to hold a contact list.
 *
 * Sending the stored coordinates matters beyond speed: those addresses were
 * geocoded once already, and re-running them on Render would be a second
 * Mapbox bill for answers we have.
 *
 * Credentials come from the environment (CLOUD_EMAIL / CLOUD_PASSWORD) so the
 * password never appears in a command line or in shell history.
 *
 * Safe to re-run: anything already up there, matched on company code, is left
 * alone rather than duplicated.
 */
import { pool, query } from '../config/db.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const URL_BASE = (opt('url', process.env.CLOUD_URL || 'https://gomichi.onrender.com')).replace(/\/$/, '');
const EMAIL = opt('user', process.env.CLOUD_EMAIL || '');
const PASSWORD = process.env.CLOUD_PASSWORD || '';
const DRY = flag('dry-run');
const PROVINCES = opt('provinces', null);   // omit = every customer

if (!EMAIL || !PASSWORD) {
  console.error('Need CLOUD_EMAIL and CLOUD_PASSWORD in the environment.');
  process.exit(1);
}

// ---------- whose customers ----------
/* One account, named. This Mac has more than one account with customers in it,
   and quietly sweeping up all of them would push somebody else's list. */
async function resolveUser() {
  const email = opt('user', process.env.CLOUD_LOCAL_USER || '');
  if (email) {
    const { rows } = await query('SELECT id, email FROM users WHERE lower(email)=lower($1)', [email]);
    if (!rows.length) throw new Error(`No account on this Mac with the email ${email}`);
    return rows[0];
  }
  const { rows } = await query(`
    SELECT u.id, u.email, count(c.id)::int AS companies
      FROM users u LEFT JOIN companies c ON c.owner_id = u.id
     WHERE u.email <> 'demo@example.com'
     GROUP BY u.id, u.email ORDER BY companies DESC`);
  const withData = rows.filter(r => r.companies > 0);
  if (withData.length === 1) return withData[0];
  if (!rows.length) throw new Error('No account here other than the demo login.');
  const list = rows.map(r => `    ${r.email.padEnd(34)} ${r.companies} customers`).join('\n');
  throw new Error(`More than one account has customers:\n\n${list}\n\n  Re-run naming the one you mean.`);
}

let localUser;
try { localUser = await resolveUser(); }
catch (e) { console.error(`\n  ${e.message}\n`); await pool.end(); process.exit(1); }
console.log(`\n  Reading from the account ${localUser.email} on this Mac.`);

// ---------- what to send ----------
const params = [localUser.id];
let where = 'c.owner_id = $1';
if (PROVINCES) {
  const { expandProvinces } = await import('../models/companies.js');
  params.push(expandProvinces(PROVINCES));
  where += ` AND lower(btrim(c.province)) = ANY($${params.length})`;
}

const { rows: local } = await query(`
  SELECT c.company_code, c.name, c.address, c.city, c.postal_code, c.province, c.country,
         ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng,
         cu.tier
    FROM companies c
    LEFT JOIN customers cu ON cu.company_id = c.id
   WHERE ${where}
   ORDER BY c.name`, params);

console.log(`  ${local.length} customers on this Mac to consider.`);
const withPin = local.filter(r => r.lat != null).length;
console.log(`  ${withPin} already have map coordinates; ${local.length - withPin} do not and will go up without a pin.\n`);

// ---------- sign in to the cloud copy ----------
async function call(method, path, token, body) {
  const res = await fetch(`${URL_BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.error || text.slice(0, 120)}`);
  return data;
}

console.log(`  Signing in to ${URL_BASE} as ${EMAIL} ...`);
let token;
try {
  ({ token } = await call('POST', '/auth/login', null, { email: EMAIL, password: PASSWORD }));
} catch (e) {
  console.error(`\n  Could not sign in: ${e.message}`);
  console.error('  Check the email and password you use on the website.\n');
  await pool.end(); process.exit(1);
}

// ---------- skip what is already there ----------
/* The full list, not fields=map: that view only returns companies that have a
   pin, so a second run would try to re-send every unpinned one and collide. */
const existing = await call('GET', '/companies', token);
const have = new Set((Array.isArray(existing) ? existing : existing.rows || []).map(c => c.company_code));
const todo = local.filter(c => !have.has(c.company_code));
console.log(`  ${have.size} already up there. ${todo.length} to send.\n`);

if (DRY) {
  for (const c of todo.slice(0, 10)) console.log(`    would send  ${c.company_code}  ${c.name}  ${[c.city, c.province].filter(Boolean).join(', ')}`);
  if (todo.length > 10) console.log(`    ... and ${todo.length - 10} more`);
  console.log('\n  Dry run. Nothing was sent.\n');
  await pool.end(); process.exit(0);
}

// ---------- send ----------
let sent = 0; const failed = [];
for (const c of todo) {
  const body = {
    company_code: c.company_code, name: c.name, address: c.address, city: c.city,
    postal_code: c.postal_code, province: c.province, country: c.country || 'Canada',
    tier: c.tier || 'tier2',
    // No phone. No contacts. Those stay on this Mac, deliberately.
    ...(c.lat != null ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
  };
  try {
    await call('POST', '/companies', token, body);
    sent++;
    if (sent % 25 === 0) process.stdout.write(`    ${sent} of ${todo.length} sent...\n`);
  } catch (e) {
    failed.push(`${c.company_code} ${c.name}: ${e.message}`);
  }
}

console.log(`\n  Sent ${sent} customers to ${URL_BASE}.`);
if (failed.length) {
  console.log(`  ${failed.length} could not be sent:`);
  for (const f of failed.slice(0, 15)) console.log(`    ${f}`);
  if (failed.length > 15) console.log(`    ... and ${failed.length - 15} more`);
}
console.log('  No contacts and no phone numbers were sent.\n');
await pool.end();
