const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
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

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (d) => request('POST', '/auth/register', d),
  me: () => request('GET', '/auth/me'),
  setHome: (d) => request('PUT', '/auth/me/home', d),

  companies: (filters) => request('GET', `/companies${qs(filters)}`),
  companyStats: () => request('GET', '/companies/stats'),
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
  addStops: (id, company_ids, duration_min) => request('POST', `/trips/${id}/stops`, { company_ids, duration_min }),
  updateStop: (id, stopId, d) => request('PATCH', `/trips/${id}/stops/${stopId}`, d),
  removeStop: (id, stopId) => request('DELETE', `/trips/${id}/stops/${stopId}`),
  addBreak: (id, d) => request('POST', `/trips/${id}/breaks`, d),
  removeBreak: (id, breakId) => request('DELETE', `/trips/${id}/breaks/${breakId}`),
  optimize: (id, round_trip = true) => request('POST', `/trips/${id}/optimize`, { round_trip }),
  directions: (id, day) => request('GET', `/trips/${id}/directions${qs({ day })}`),
};

export const TIERS = {
  tier1: { label: 'Current', short: 'T1', hint: 'Buys regularly · quarterly touch' },
  tier2: { label: 'Lead', short: 'T2', hint: 'Warm or hot prospect' },
  tier3: { label: 'Inactive', short: 'T3', hint: 'No purchase in 365+ days' },
  tier4: { label: 'Cold', short: 'T4', hint: 'Met cold-calling · low priority' },
};
export const fmtKm = (m) => m == null ? '—' : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
export const fmtDur = (s) => { if (s == null) return '—'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
export const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';
export const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const daysAgo = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null;
