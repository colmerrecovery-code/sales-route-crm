/**
 * Apply any migration SQL the database has not seen yet.
 *
 * `database/schema.sql` only ever runs on a BRAND NEW postgres volume, via the
 * image's init hook. An existing database — anyone already using the app — will
 * never see a schema change through that route. This is how they get one.
 *
 * Exported so the server can run it at boot; still runnable on its own with
 * `npm run db:migrate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.js';

// Present in the migrations folder but not a schema change — a job run on a timer.
const NOT_A_MIGRATION = new Set(['002_demote_inactive.sql']);

// The same DDL as database/schema.sql, which the postgres image runs on a new volume.
const INITIAL = '001_initial_schema.sql';

export async function runMigrations({ log = () => {} } = {}) {
  const dir = path.resolve(process.env.DB_SQL_DIR || '../database', 'migrations');
  if (!fs.existsSync(dir)) return { applied: [], note: `no migrations directory at ${dir}` };

  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map(r => r.name));

  /* Baseline an existing database.
     A database created before this file existed was built by the postgres
     image running database/schema.sql on an empty volume — so it HAS the
     initial schema but has never recorded a migration. Left alone, the loop
     below would try to apply 001 to it, hit "relation already exists" on the
     first CREATE TABLE, and abort — taking every later migration with it, so
     new features would quietly not work. If nothing is recorded but the core
     tables are plainly there, record the initial schema without running it. */
  if (!done.size) {
    const { rows: [chk] } = await pool.query("SELECT to_regclass('public.road_trips') IS NOT NULL AS present");
    if (chk?.present) {
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [INITIAL]);
      done.add(INITIAL);
      log(`baseline: schema already present, recorded ${INITIAL} without running it\n`);
    }
  }

  const applied = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file) || NOT_A_MIGRATION.has(file)) continue;
    log(`applying ${file}... `);
    /* One transaction per migration: a half-applied schema change is far worse
       than one that did not run, because the second attempt then fails too. */
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await c.query('COMMIT');
      applied.push(file);
      log('ok\n');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw Object.assign(new Error(`migration ${file} failed: ${e.message}`), { file });
    } finally {
      c.release();
    }
  }
  return { applied };
}

// Only when run directly (npm run db:migrate), not when imported by the server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { applied } = await runMigrations({ log: (m) => process.stdout.write(m) });
  console.log(applied.length ? `\n${applied.length} migration(s) applied.` : 'Database already up to date.');
  await pool.end();
}
