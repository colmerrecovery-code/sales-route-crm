import { z } from 'zod';
import * as Companies from '../models/companies.js';
import * as Clients from '../models/clients.js';
import * as Interactions from '../models/interactions.js';
import { geocode } from '../services/geo.js';

const tier = z.enum(['tier1', 'tier2', 'tier3', 'tier4']);
const temp = z.enum(['hot', 'warm', 'cold']).nullable();
const str = z.string().trim().nullish();

export const companySchema = z.object({
  company_code: str, name: z.string().trim().min(1), address: str, city: str, postal_code: str, province: str,
  country: str, phone: str, website: str, notes: str, tier: tier.optional(), temperature: temp.optional(),
  last_contact_at: z.string().datetime().nullish(), last_purchase_at: z.string().datetime().nullish(),
  annual_value: z.number().nullish(), lat: z.number().optional(), lng: z.number().optional(),
});
export const companyPatchSchema = companySchema.partial();

const addressChanged = (d) => ['address', 'city', 'postal_code', 'province', 'country'].some(k => k in d);

export async function list(req, res) { res.json(await Companies.list(req.user.id, req.query)); }
export async function stats(req, res) { res.json(await Companies.stats(req.user.id)); }

export async function get(req, res) {
  const company = await Companies.get(req.user.id, req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const [clients, interactions] = await Promise.all([
    Clients.listForCompany(req.user.id, company.id), Interactions.listForCompany(req.user.id, company.id)]);
  res.json({ ...company, clients, interactions });
}

export async function create(req, res) {
  const d = req.body;
  const geo = d.lat != null ? { lat: d.lat, lng: d.lng } : await geocode(d).catch(() => null);
  const company = await Companies.create(req.user.id, d, geo);
  res.status(201).json({ ...company, geocoded: !!geo });
}

export async function update(req, res) {
  const d = req.body;
  let geo = d.lat != null ? { lat: d.lat, lng: d.lng } : null;
  if (!geo && addressChanged(d)) {
    const current = await Companies.get(req.user.id, req.params.id);
    if (!current) return res.status(404).json({ error: 'Company not found' });
    geo = await geocode({ ...current, ...d }).catch(() => null);
  }
  const company = await Companies.update(req.user.id, req.params.id, d, geo);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json(company);
}

export async function remove(req, res) {
  if (!(await Companies.remove(req.user.id, req.params.id))) return res.status(404).json({ error: 'Company not found' });
  res.status(204).end();
}

// Clients ----------------------------------------------------------------
export const clientSchema = z.object({
  first_name: z.string().trim().min(1), last_name: str, title: str, email: z.string().email().nullish(),
  phone: str, is_primary: z.boolean().optional(), notes: str,
});
export async function createClient(req, res) {
  const client = await Clients.create(req.user.id, req.params.id, req.body);
  if (!client) return res.status(404).json({ error: 'Company not found' });
  res.status(201).json(client);
}
export async function updateClient(req, res) {
  const client = await Clients.update(req.user.id, req.params.clientId, req.body);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
}
export async function removeClient(req, res) {
  if (!(await Clients.remove(req.user.id, req.params.clientId))) return res.status(404).json({ error: 'Client not found' });
  res.status(204).end();
}

// Interactions -----------------------------------------------------------
export const interactionSchema = z.object({
  client_id: z.string().uuid().nullish(), kind: z.enum(['visit', 'call', 'email', 'note']),
  occurred_at: z.string().datetime().nullish(), summary: str, outcome: str,
});
export async function createInteraction(req, res) {
  const row = await Interactions.create(req.user.id, { ...req.body, company_id: req.params.id });
  if (!row) return res.status(404).json({ error: 'Company not found' });
  res.status(201).json(row);
}
