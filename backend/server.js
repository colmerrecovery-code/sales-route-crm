import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import companyRoutes from './routes/companies.js';
import tripRoutes from './routes/trips.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { pool } from './config/db.js';
import { runMigrations } from './scripts/migrate.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',') }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, error: 'Database unreachable' }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/companies', requireAuth, companyRoutes);
app.use('/api/trips', requireAuth, tripRoutes);

/* In production the API also serves the built front end, so the whole app lives
   at one address. That removes the cross-origin setup entirely and gives a
   single URL to hand someone — worth more than the few dollars a second service
   would cost. Locally this directory does not exist and the block is skipped,
   leaving the Vite dev server in charge as before. */
const CLIENT = path.resolve(process.env.CLIENT_DIR || '../frontend/dist');
if (fs.existsSync(CLIENT)) {
  app.use(express.static(CLIENT));
  // Anything that is not an API call is a front-end route: hand back index.html
  // and let the browser router work out the rest.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT, 'index.html')));
  console.log(`Serving the app from ${CLIENT}`);
}

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 4000;

/* Bring the schema up to date before serving. schema.sql only runs on a brand
   new volume, so without this an existing database never sees a new table.
   A failure here is logged, not fatal: a missing table breaks one feature,
   whereas refusing to boot breaks somebody's working day. */
try {
  const { applied } = await runMigrations({ log: (m) => process.stdout.write(m) });
  if (applied.length) console.log(`Schema updated: ${applied.join(', ')}`);
} catch (e) {
  console.error(`WARNING: could not apply migrations - ${e.message}`);
  console.error('The app is starting anyway. Features needing the new schema will fail.');
}

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
