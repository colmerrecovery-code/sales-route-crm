/* The public survey: anyone with the link can submit; only the owner reads.
 *
 * Submitting needs no account, because the people answering are salespeople
 * Troy knows, not GoMichi users. Reading the answers needs a GoMichi sign-in
 * AND an email on the survey owner list - sign-up is open, so "signed in"
 * alone would let any new account read everyone's answers.
 *
 * The owner list comes from SURVEY_ADMIN_EMAILS (comma-separated) when it is
 * set. Otherwise it falls back to the SHA-256 of the owner's address, so the
 * address itself never sits in this public repo.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const OWNER_HASHES = ['20bc4f082c930113e0b90009671544fa396d66eeb2a369f3d6c59f1a849f49af'];
const sha = (s) => crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');

function isOwner(email) {
  const listed = (process.env.SURVEY_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (listed.length) return listed.includes(String(email).toLowerCase());
  return OWNER_HASHES.includes(sha(email));
}

/* A light brake on abuse: 20 submissions an hour from one address is far more
   than any honest respondent sends. In memory, so it resets on a restart. */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (recent.length >= 20) return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  next();
}

const pick = (n) => z.number().int().min(0).max(n - 1).optional();
const submitSchema = z.object({
  client_id: z.string().min(8).max(64),
  answers: z.object({
    role: pick(4), book: pick(4), admin: pick(4), notes: pick(5), route: pick(5), slip: pick(4),
    feat: z.array(z.number().int().min(0).max(6)).max(3).optional(),
    spent: pick(2), price: pick(5), co: pick(4), beta: pick(3),
    pain: z.string().max(500).optional(),
    name: z.string().max(80).optional(),
  }),
});

/* The anonymous LinkedIn poll at /poll. No name, email or phone is asked for,
   and nothing identifying is stored with the answers. */
const POLL = 'road-poll-v1';
const pollSchema = z.object({
  client_id: z.string().min(8).max(64),
  answers: z.object({
    rank: z.array(z.number().int().min(0).max(6)).min(3).max(7)
      .refine(a => new Set(a).size === a.length, 'Each tool can only be ranked once'),
    role: pick(4), book: pick(4), admin: pick(4), notes: pick(5), route: pick(5), slip: pick(4),
    spent: pick(2), price: pick(5), co: pick(4),
    pain: z.string().max(500).optional(),
  }),
});

const r = Router();

r.post('/poll', rateLimit, validate(pollSchema), async (req, res) => {
  const { client_id, answers } = req.body;
  await query(
    `INSERT INTO survey_responses (survey, client_id, answers) VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET answers = EXCLUDED.answers`,
    [POLL, client_id, answers]);
  res.status(201).json({ ok: true });
});

/* What everyone sees after voting: how the crowd ranked the tools so far.
   Counts only, never anyone's typed answer. */
r.get('/poll/summary', async (_req, res) => {
  const { rows } = await query(`SELECT answers->'rank' AS rank FROM survey_responses WHERE survey = $1`, [POLL]);
  const points = Array(7).fill(0);
  for (const { rank } of rows) (rank || []).forEach((k, i) => { if (k >= 0 && k < 7) points[k] += 7 - i; });
  res.json({ n: rows.length, points });
});

r.get('/poll/responses', requireAuth, async (req, res) => {
  if (!isOwner(req.user.email)) return res.status(403).json({ error: 'Only the poll owner can see the answers.' });
  const { rows } = await query(
    `SELECT id, answers, created_at FROM survey_responses WHERE survey = $1 ORDER BY created_at DESC LIMIT 5000`, [POLL]);
  res.json(rows);
});

r.post('/', rateLimit, validate(submitSchema), async (req, res) => {
  const { client_id, answers } = req.body;
  await query(
    `INSERT INTO survey_responses (client_id, answers) VALUES ($1, $2)
     ON CONFLICT (client_id) DO UPDATE SET answers = EXCLUDED.answers`,
    [client_id, answers]);
  res.status(201).json({ ok: true });
});

r.get('/responses', requireAuth, async (req, res) => {
  if (!isOwner(req.user.email)) return res.status(403).json({ error: 'Only the survey owner can see the answers.' });
  const { rows } = await query(
    `SELECT id, answers, created_at FROM survey_responses
     WHERE survey = 'rep-app-v1' ORDER BY created_at DESC LIMIT 2000`);
  res.json(rows);
});

r.delete('/responses/:id', requireAuth, async (req, res) => {
  if (!isOwner(req.user.email)) return res.status(403).json({ error: 'Only the survey owner can remove answers.' });
  await query('DELETE FROM survey_responses WHERE id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

export default r;
