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

export async function me(req, res) {
  res.json(await Users.me(req.user.id));
}

export async function setHome(req, res) {
  const { home_address, lat, lng } = req.body;
  let point = lat != null ? { lat, lng } : await geocode({ address: home_address });
  if (!point) return res.status(400).json({ error: "Couldn't find that address on the map" });
  res.json(await Users.setHome(req.user.id, { home_address, ...point }));
}
