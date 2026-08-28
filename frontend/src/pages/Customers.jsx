import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, TIERS, fmtDate, daysAgo } from '../services/api.js';
import { Code, Tier, Temp, Field, Drawer } from '../components/Badges.jsx';

const blank = { name: '', address: '', city: '', postal_code: '', province: 'ON', country: 'Canada', phone: '', tier: 'tier2', temperature: 'warm', notes: '' };

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);      // company detail
  const [editing, setEditing] = useState(null); // form data (new or edit)
  const filters = { tier: params.get('tier') || '', temperature: params.get('temperature') || '', city: params.get('city') || '', postal_code: params.get('postal_code') || '', q: params.get('q') || '' };

  const load = useCallback(() => api.companies(filters).then(setRows), [params]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = params.get('open'); if (id) api.company(id).then(setOpen); }, [params]);

  const setFilter = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); p.delete('open'); setParams(p); };
  const openCompany = (id) => api.company(id).then(setOpen);
  const closeAll = () => { setOpen(null); setEditing(null); const p = new URLSearchParams(params); p.delete('open'); setParams(p); };

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">{rows.length} companies</div><h1>Customers</h1></div>
        <button className="btn primary" onClick={() => setEditing({ ...blank })}>Add company</button>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search name or code" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6, minWidth: 220 }} />
        <select value={filters.tier} onChange={(e) => setFilter('tier', e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
          <option value="">All tiers</option>
          {Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.short} · {t.label}</option>)}
        </select>
        <select value={filters.temperature} onChange={(e) => setFilter('temperature', e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
          <option value="">Any temperature</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
        </select>
        <input placeholder="City" value={filters.city} onChange={(e) => setFilter('city', e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6, width: 140 }} />
        <input placeholder="Postal code" value={filters.postal_code} onChange={(e) => setFilter('postal_code', e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6, width: 120 }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Company</th><th>Location</th><th>Status</th><th>Last contact</th><th>Next touch</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No companies match. Clear a filter or add your first company.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => openCompany(c.id)}>
                <td><Code>{c.company_code}</Code></td>
                <td><b>{c.name}</b>{c.lat == null && <div className="small muted">Not on map yet</div>}</td>
                <td>{c.city}{c.postal_code ? ` · ${c.postal_code}` : ''}</td>
                <td><Tier tier={c.tier} /> <Temp t={c.temperature} /></td>
                <td className="num">{c.last_contact_at ? `${daysAgo(c.last_contact_at)}d ago` : '—'}</td>
                <td className={`num ${c.next_touch_due && new Date(c.next_touch_due) <= new Date() ? 'due' : ''}`}>{c.next_touch_due ? fmtDate(c.next_touch_due) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && !editing && <CompanyDetail company={open} onClose={closeAll} onEdit={() => setEditing(open)} onChange={(c) => { setOpen(c); load(); }} />}
      {editing && <CompanyForm initial={editing} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); setOpen(c); load(); }} />}
    </div>
  );
}

function CompanyDetail({ company: c, onClose, onEdit, onChange }) {
  const [log, setLog] = useState({ kind: 'visit', summary: '', outcome: '' });
  const [client, setClient] = useState(null);
  const refresh = () => api.company(c.id).then(onChange);
  async function addLog(e) { e.preventDefault(); await api.logInteraction(c.id, log); setLog({ kind: 'visit', summary: '', outcome: '' }); refresh(); }
  async function addClient(e) { e.preventDefault(); await api.createClient(c.id, client); setClient(null); refresh(); }
  async function remove() { if (confirm(`Delete ${c.name} and all its contacts and history?`)) { await api.deleteCompany(c.id); onClose(); onChange(null); } }

  return (
    <Drawer title={c.name} sub={c.company_code} onClose={onClose}>
      <div className="row"><Tier tier={c.tier} /><Temp t={c.temperature} />{c.inactive_365 && <span className="due small">No purchase in 365+ days</span>}</div>
      <p style={{ marginBottom: 4 }}>{[c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', ')}</p>
      <p className="small muted" style={{ marginTop: 0 }}>{c.phone}{c.website ? ` · ${c.website}` : ''}{c.lat == null ? ' · Not on map — check the address' : ''}</p>
      <div className="row"><button className="btn sm" onClick={onEdit}>Edit</button><button className="btn sm ghost danger" onClick={remove}>Delete</button></div>
      <div className="grid-3 section">
        <div className="card"><div className="eyebrow">Last contact</div><b>{fmtDate(c.last_contact_at)}</b></div>
        <div className="card"><div className="eyebrow">Last purchase</div><b>{fmtDate(c.last_purchase_at)}</b></div>
        <div className="card"><div className="eyebrow">Next touch</div><b className={c.next_touch_due && new Date(c.next_touch_due) <= new Date() ? 'due' : ''}>{fmtDate(c.next_touch_due)}</b></div>
      </div>

      <div className="section">
        <h3>Contacts</h3>
        <div className="list">
          {c.clients.map((p) => (
            <div key={p.id} className="list-item">
              <div><b>{p.first_name} {p.last_name}</b> <span className="small muted">{p.client_code}{p.is_primary ? ' · primary' : ''}</span><div className="small muted">{[p.title, p.email, p.phone].filter(Boolean).join(' · ')}</div></div>
              <button className="btn sm ghost" onClick={() => api.deleteClient(c.id, p.id).then(refresh)}>Remove</button>
            </div>
          ))}
          {client ? (
            <form className="card list" onSubmit={addClient}>
              <div className="grid-2">
                <Field label="First name"><input required value={client.first_name} onChange={(e) => setClient({ ...client, first_name: e.target.value })} /></Field>
                <Field label="Last name"><input value={client.last_name} onChange={(e) => setClient({ ...client, last_name: e.target.value })} /></Field>
                <Field label="Title"><input value={client.title} onChange={(e) => setClient({ ...client, title: e.target.value })} /></Field>
                <Field label="Phone"><input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></Field>
              </div>
              <Field label="Email"><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value || null })} /></Field>
              <div className="row"><button className="btn primary sm">Save contact</button><button type="button" className="btn sm ghost" onClick={() => setClient(null)}>Cancel</button></div>
            </form>
          ) : <button className="btn sm" onClick={() => setClient({ first_name: '', last_name: '', title: '', email: '', phone: '', is_primary: c.clients.length === 0 })}>Add contact</button>}
        </div>
      </div>

      <div className="section">
        <h3>Log an interaction</h3>
        <form className="card list" onSubmit={addLog}>
          <div className="row">
            <select value={log.kind} onChange={(e) => setLog({ ...log, kind: e.target.value })} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
              <option value="visit">Visit</option><option value="call">Call</option><option value="email">Email</option><option value="note">Note</option>
            </select>
            <input placeholder="What happened?" value={log.summary} onChange={(e) => setLog({ ...log, summary: e.target.value })} style={{ flex: 1, padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
            <button className="btn primary sm">Log</button>
          </div>
        </form>
        <div className="list" style={{ marginTop: 10 }}>
          {c.interactions.map((i) => (
            <div key={i.id} className="list-item"><div><span className="eyebrow">{i.kind}</span> {i.summary}{i.client_name?.trim() ? <span className="small muted"> · {i.client_name}</span> : ''}</div><span className="small muted num">{fmtDate(i.occurred_at)}</span></div>
          ))}
          {c.interactions.length === 0 && <p className="muted small">No history yet. Logging a visit or call updates the last-contact date automatically.</p>}
        </div>
      </div>
    </Drawer>
  );
}

function CompanyForm({ initial, onClose, onSaved }) {
  const isNew = !initial.id;
  const [f, setF] = useState(() => Object.fromEntries(Object.keys(blank).map((k) => [k, initial[k] ?? blank[k]])));
  const [issues, setIssues] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    const payload = { ...f, temperature: ['tier2', 'tier4'].includes(f.tier) ? f.temperature : null };
    try {
      const saved = isNew ? await api.createCompany(payload) : await api.updateCompany(initial.id, payload);
      if (isNew && !saved.geocoded) setError("Saved, but the address couldn't be placed on the map. Check it and edit to retry.");
      onSaved(saved.clients ? saved : await api.company(saved.id));
    } catch (err) { setError(err.message); setIssues(err.issues || {}); } finally { setBusy(false); }
  }
  return (
    <Drawer title={isNew ? 'New company' : `Edit ${initial.name}`} sub={initial.company_code || 'Code assigned on save'} onClose={onClose}>
      <form className="list" onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <Field label="Company name" error={issues.name}><input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Street address"><input value={f.address} onChange={set('address')} /></Field>
        <div className="grid-3">
          <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
          <Field label="Province"><input value={f.province} onChange={set('province')} /></Field>
          <Field label="Postal code"><input value={f.postal_code} onChange={set('postal_code')} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Country"><input value={f.country} onChange={set('country')} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Tier"><select value={f.tier} onChange={set('tier')}>{Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.short} · {t.label} — {t.hint}</option>)}</select></Field>
          <Field label="Lead temperature"><select value={f.temperature || ''} onChange={set('temperature')} disabled={!['tier2', 'tier4'].includes(f.tier)}><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></Field>
        </div>
        <Field label="Notes"><textarea rows={3} value={f.notes || ''} onChange={set('notes')} /></Field>
        <div className="row"><button className="btn primary" disabled={busy}>{isNew ? 'Add company' : 'Save changes'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Drawer>
  );
}
