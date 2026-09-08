import bcrypt from 'bcrypt';
import { z } from 'zod';
import * as Users from '../models/users.js';
import { signToken } from '../middleware/auth.js';
import { geocode } from '../services/geo.js';

export const registerSchema = z.object({
  email: z.string().email(), password: z.string().min(8), full_name: z.string().min(1),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string() });

export async function register(req, res) {
  const { email, password, full_name } = req.body;
  if (await Users.findByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });
  const user = await Users.create({ email, full_name, password_hash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user });
}

export async function login(req, res) {
  const user = await Users.findByEmail(req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
}

/**
 * Front-end configuration. The map token here is Mapbox's PUBLIC kind — meant
 * to be visible in a browser — but it is still served behind auth and at
 * runtime rather than baked into the built files, so rotating it is a restart
 * rather than a rebuild. Restrict it by URL in the Mapbox account as well.
 */
export const cadenceSchema = z.object({
  touch_days_tier1: z.number().int().min(1).max(1095).nullish(),
  touch_days_tier2: z.number().int().min(1).max(1095).nullish(),
  touch_days_tier3: z.number().int().min(1).max(1095).nullish(),
  touch_days_tier4: z.number().int().min(1).max(1095).nullish(),
});

/** Set how often each tier comes round. null for a tier = no cycle at all. */
export async function setCadence(req, res) {
  res.json(await Users.setCadence(req.user.id, req.body));
}

export async function config(req, res) {
  res.json({
    map_provider: process.env.MAPBOX_PUBLIC_TOKEN ? 'mapbox' : 'openstreetmap',
    mapbox_public_token: process.env.MAPBOX_PUBLIC_TOKEN || null,
    mapbox_style: process.env.MAPBOX_STYLE || 'mapbox/streets-v12',
  });
}

export async function me(req, res) {
  res.json(await Users.me(req.user.id));
}

export async function setHome(req, res) {
  const { home_address, lat, lng } = req.body;
  /* Bias the lookup to Canada unless the address names a country itself.
     Without it a bare street address happily matches the identically-named
     street in the US, and every distance in the app is then measured from
     several hundred kilometres away. */
  const named = /\b(canada|usa|united states)\b/i.test(home_address || '');
  let point = lat != null ? { lat, lng }
    : await geocode({ address: home_address, country: named ? undefined : 'Canada' });
  if (!point) {
    return res.status(400).json({
      error: `Couldn't place "${home_address}" on the map. Add the city and province (e.g. "182 Royal Valley Dr, Caledon, Ontario"), or use the nearest major intersection.`,
    });
  }
  res.json(await Users.setHome(req.user.id, { home_address, ...point }));
}
