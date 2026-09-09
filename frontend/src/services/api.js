/* Work out where the API lives at RUN time, not build time.
   A production build bakes in whatever it can see when it is compiled, so a
   hard-coded localhost would break the moment the page is opened from a phone.

   Three situations, and the app has to get all three right from one build:
     hosted      - the server serves the app AND the API, so /api is same-origin
     local dev   - Vite serves the app on 5173, the API is a separate 4000
     override    - VITE_API_URL, if anyone ever splits them apart again
   The dev case is the odd one out, so it is the one that gets detected. */
const DEV_PORT = '5173';
const API_PORT = import.meta.env.VITE_API_PORT || '4000';
const BASE = import.meta.env.VITE_API_URL || (() => {
  if (typeof window === 'undefined') return 'http://localhost:4000/api';
  const { protocol, hostname, port } = window.location;
  if (port === DEV_PORT) return `${protocol}//${hostname}:${API_PORT}/api`;
  return '/api';   // served by the same server that serves this page
})();
const TOKEN_KEY = 'srcrm_token';

export const auth = {
  token: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth.token() ? { Authorization: `Bearer ${auth.token()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { auth.clear(); window.dispatchEvent(new Event('srcrm:unauthorized')); }
    throw Object.assign(new Error(data.error || 'Request failed'), { issues: data.issues, status: res.status });
  }
  return data;
}

const qs = (o = {}) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)); const s = p.toString(); return s ? `?${s}` : ''; };

let cfgOnce = null;   // map settings don't change mid-session; fetch once

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (d) => request('POST', '/auth/register', d),
  me: () => request('GET', '/auth/me'),
  config: () => (cfgOnce ||= request('GET', '/auth/config')),
  setHome: (d) => request('PUT', '/auth/me/home', d),
  setCadence: (d) => request('PUT', '/auth/me/cadence', d),

  companies: (filters) => request('GET', `/companies${qs(filters)}`),
  companiesPage: (filters, limit, offset) => request('GET', `/companies${qs({ ...filters, limit, offset })}`),
  companiesForMap: (filters) => request('GET', `/companies${qs({ ...filters, fields: 'map' })}`),
  companyStats: (filters) => request('GET', `/companies/stats${qs(filters || {})}`),
  company: (id) => request('GET', `/companies/${id}`),
  createCompany: (d) => request('POST', '/companies', d),
  updateCompany: (id, d) => request('PATCH', `/companies/${id}`, d),
  deleteCompany: (id) => request('DELETE', `/companies/${id}`),
  createClient: (companyId, d) => request('POST', `/companies/${companyId}/clients`, d),
  deleteClient: (companyId, id) => request('DELETE', `/companies/${companyId}/clients/${id}`),
  logInteraction: (companyId, d) => request('POST', `/companies/${companyId}/interactions`, d),

  trips: () => request('GET', '/trips'),
  trip: (id) => request('GET', `/trips/${id}`),
  createTrip: (d) => request('POST', '/trips', d),
  updateTrip: (id, d) => request('PATCH', `/trips/${id}`, d),
  deleteTrip: (id) => request('DELETE', `/trips/${id}`),
  addStops: (id, company_ids, duration_min, day) => request('POST', `/trips/${id}/stops`, { company_ids, duration_min, day }),
  updateStop: (id, stopId, d) => request('PATCH', `/trips/${id}/stops/${stopId}`, d),
  removeStop: (id, stopId) => request('DELETE', `/trips/${id}/stops/${stopId}`),
  addBreak: (id, d) => request('POST', `/trips/${id}/breaks`, d),
  removeBreak: (id, breakId) => request('DELETE', `/trips/${id}/breaks/${breakId}`),
  optimize: (id, round_trip = true, home_each_night = true) => request('POST', `/trips/${id}/optimize`, { round_trip, home_each_night }),
  replan: (id, body) => request('POST', `/trips/${id}/replan`, body),
  setVisitLength: (id, minutes) => request('PATCH', `/trips/${id}/visit-length`, { minutes }),
  // Where a day starts. Day N's base is also where day N-1 finishes.
  setDayBase: (id, day, d) => request('PUT', `/trips/${id}/days/${day}/base`, d),
  clearDayBase: (id, day) => request('DELETE', `/trips/${id}/days/${day}/base`),
  directions: (id, day) => request('GET', `/trips/${id}/directions${qs({ day })}`),
};

export const TIERS = {
  tier1: { label: 'Current', short: 'T1', hint: 'Buys regularly' },
  tier2: { label: 'Lead', short: 'T2', hint: 'Warm or hot prospect' },
  tier3: { label: 'Inactive', short: 'T3', hint: 'No purchase in 365+ days' },
  tier4: { label: 'Cold lead', short: 'T4', hint: 'Met cold-calling · low priority' },
};
/* The rep's territory.
 *
 * The customer list is national -- 956 locations from Victoria to St John's --
 * but a rep is responsible for a slice of it. Everything defaults to that
 * slice so the screens show the customers he can actually visit; "All
 * provinces" is always one tap away for the times somebody asks about an
 * account out west.
 *
 * Hard-coded for now because there is one rep using this. When GoMichi is
 * sold to somebody else this belongs on the user record, set once when they
 * sign up -- the API already takes any list of provinces.
 */
export const TERRITORY = ['Ontario', 'Quebec', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 'Newfoundland and Labrador'];

export const PROVINCES = [
  'Ontario', 'Quebec', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 'Newfoundland and Labrador',
  'Manitoba', 'Saskatchewan', 'Alberta', 'British Columbia', 'Yukon', 'Northwest Territories', 'Nunavut',
];

/* What the filter sends to the API for a given choice. */
export const provinceParam = (choice) =>
  choice === 'all' ? 'all' : choice === 'territory' ? TERRITORY.join(',') : choice;

export const fmtKm = (m) => m == null ? '—' : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
export const fmtDur = (s) => { if (s == null) return '—'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
/* 12-hour everywhere, by preference. Built by hand rather than left to
   toLocaleTimeString: en-CA renders "03:34 p.m." — zero-padded, with periods —
   and the padding reads wrong after noon. Times are stored as UTC wall-clock,
   so read them with the UTC getters, exactly as the old formatter did. */
const ampm = (h, m) => `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;

export const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return ampm(d.getUTCHours(), d.getUTCMinutes()); };

/** A bare "HH:MM" or "HH:MM:SS" straight from the database — work hours, breaks. */
export const fmtClock = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) ? ampm(h, m || 0) : '';
};
/* Trip dates are calendar dates, stored at midnight UTC. Formatting them in
   local time renders Sep 8 as "Sep 7" anywhere west of Greenwich, which is why
   the trip header disagreed with its own day labels. Read them as UTC. */
export const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
export const daysAgo = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null;
