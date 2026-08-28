import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, TIERS, fmtDate, daysAgo } from '../services/api.js';
import { Code, Tier, Temp, Field, Drawer, TouchPill } from '../components/Badges.jsx';
import { IconPlus, IconPhone, IconNav } from '../components/Icons.jsx';

const blank = { name: '', address: '', city: '', postal_code: '', province: 'ON', country: 'Canada', phone: '', tier: 'tier2', temperature: 'warm', notes: '' };

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const filters = { tier: params.get('tier') || '', temperature: params.get('temperature') || '', city: params.get('city') || '', postal_code: params.get('postal_code') || '', q: params.get('q') || '', due: params.get('due') || '' };

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
        <button className="btn primary hide-mobile" onClick={() => setEditing({ ...blank })}><IconPlus />Add company</button>
      </div>

      <div className="filters">
        <input placeholder="Search name or code" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
        <select value={filters.tier} onChange={(e) => setFilter('tier', e.target.value)}>
          <option value="">All tiers</option>{Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <select value={filters.temperature} onChange={(e) => setFilter('temperature', e.target.value)}>
          <option value="">Any temperature</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
        </select>
        <select value={filters.due} onChange={(e) => setFilter('due', e.target.value)}><option value="">Any status</option><option value="true">Overdue only</option></select>
        <input placeholder="City" value={filters.city} onChange={(e) => setFilter('city', e.target.value)} />
        <input placeholder="Postal code" value={filters.postal_code} onChange={(e) => setFilter('postal_code', e.target.value)} />
      </div>

      {rows.length === 0 && <div className="card muted">No companies match. Clear a filter or add your first company.</div>}

      <div className="cust-cards">
        {rows.map((c) => (
          <div key={c.id} className="list-item clickable" onClick={() => openCompany(c.id)}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}><Code>{c.company_code}</Code><Tier tier={c.tier} /><Temp t={c.temperature} /></div>
              <div className="name" style={{ marginTop: 6 }}>{c.name}</div>
              <div className="small muted">{c.city}{c.lat == null ? ' · not on map' : ''}{c.last_contact_at ? ` · ${daysAgo(c.last_contact_at)}d since contact` : ''}</div>
            </div>
            <TouchPill next_touch_due={c.next_touch_due} last_contact_at={c.last_contact_at} />
          </div>
        ))}
      </div>

      <div className="card cust-table" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Company</th><th>Location</th><th>Status</th><th>Last contact</th><th>Next touch</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => openCompany(c.id)}>
                  <td><Code>{c.company_code}</Code></td>
                  <td><b>{c.name}</b>{c.lat == null && <div className="small muted">Not on map yet</div>}</td>
                  <td>{c.city}{c.postal_code ? ` · ${c.postal_code}` : ''}</td>
                  <td><span className="row" style={{ gap: 6 }}><Tier tier={c.tier} /><Temp t={c.temperature} /></span></td>
                  <td className="num">{c.last_contact_at ? `${daysAgo(c.last_contact_at)}d ago` : '—'}</td>
                  <td><TouchPill next_touch_due={c.next_touch_due} last_contact_at={c.last_contact_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="fab" aria-label="Add company" onClick={() => setEditing({ ...blank })}><IconPlus /></button>

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
  const mapsUrl = c.lat != null ? `https://maps.apple.com/?daddr=${c.lat},${c.lng}` : null;
  const primary = c.clients.find((p) => p.is_primary) || c.clients[0];

  return (
    <Drawer title={c.name} sub={c.company_code} onClose={onClose}>
      <div className="row"><Tier tier={c.tier} /><Temp t={c.temperature} /><TouchPill next_touch_due={c.next_touch_due} last_contact_at={c.last_contact_at} />{c.inactive_365 && <span className="pill red">No purchase 365+ days</span>}</div>
      <p style={{ marginBottom: 2 }}>{[c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', ')}</p>
      <p className="small muted" style={{ marginTop: 0 }}>{c.website}{c.lat == null ? ' · Not on map — check the address' : ''}</p>
      <div className="row">
        {c.phone && <a className="btn good" href={`tel:${c.phone}`}><IconPhone />Call</a>}
        {mapsUrl && <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer"><IconNav />Directions</a>}
        <button className="btn" onClick={onEdit}>Edit</button>
        <button className="btn ghost danger" onClick={remove}>Delete</button>
      </div>
      <div className="grid-3 section" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="card" style={{ padding: 12 }}><div className="eyebrow">Last contact</div><b>{fmtDate(c.last_contact_at)}</b></div>
        <div className="card" style={{ padding: 12 }}><div className="eyebrow">Last purchase</div><b>{fmtDate(c.last_purchase_at)}</b></div>
        <div className="card" style={{ padding: 12 }}><div className="eyebrow">Next touch</div><b className={c.next_touch_due && new Date(c.next_touch_due) <= new Date() ? 'bad' : ''}>{fmtDate(c.next_touch_due)}</b></div>
      </div>

      <div className="section">
        <h3>Log an interaction</h3>
        <form className="card list" onSubmit={addLog}>
          <div className="row">
            <select value={log.kind} onChange={(e) => setLog({ ...log, kind: e.target.value })} style={{ width: 120 }}>
              <option value="visit">Visit</option><option value="call">Call</option><option value="email">Email</option><option value="note">Note</option>
            </select>
            <input placeholder="What happened?" value={log.summary} onChange={(e) => setLog({ ...log, summary: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
            <button className="btn primary">Log</button>
          </div>
        </form>
        <div className="list" style={{ marginTop: 10 }}>
          {c.interactions.map((i) => (
            <div key={i.id} className="list-item"><div><span className="pill cyan">{i.kind}</span> {i.summary}{i.client_name?.trim() ? <span className="small muted"> · {i.client_name}</span> : ''}</div><span className="small muted num">{fmtDate(i.occurred_at)}</span></div>
          ))}
          {c.interactions.length === 0 && <p className="muted small">No history yet. Logging a visit or call updates the last-contact date automatically.</p>}
        </div>
      </div>

      <div className="section">
        <h3>Contacts</h3>
        <div className="list">
          {c.clients.map((p) => (
            <div key={p.id} className="list-item">
              <div><b>{p.first_name} {p.last_name}</b> <span className="small muted">{p.client_code}{p.is_primary ? ' · primary' : ''}</span><div className="small muted">{[p.title, p.email, p.phone].filter(Boolean).join(' · ')}</div></div>
              <div className="row" style={{ gap: 6 }}>{p.phone && <a className="btn sm good" href={`tel:${p.phone}`}><IconPhone /></a>}<button className="btn sm ghost" onClick={() => api.deleteClient(c.id, p.id).then(refresh)}>Remove</button></div>
            </div>
          ))}
          {client ? (
            <form className="card list" onSubmit={addClient}>
              <div className="grid-2">
                <Field label="First name"><input required value={client.first_name} onChange={(e) => setClient({ ...client, first_name: e.target.value })} /></Field>
                <Field label="Last name"><input value={client.last_name} onChange={(e) => setClient({ ...client, last_name: e.target.value })} /></Field>
                <Field label="Title"><input value={client.title} onChange={(e) => setClient({ ...client, title: e.target.value })} /></Field>
                <Field label="Phone"><input type="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></Field>
              </div>
              <Field label="Email"><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value || null })} /></Field>
              <div className="row"><button className="btn primary">Save contact</button><button type="button" className="btn ghost" onClick={() => setClient(null)}>Cancel</button></div>
            </form>
          ) : <button className="btn" onClick={() => setClient({ first_name: '', last_name: '', title: '', email: '', phone: '', is_primary: c.clients.length === 0 })}><IconPlus />Add contact</button>}
        </div>
      </div>
      {c.notes && <div className="section"><h3>Notes</h3><div className="card" style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</div></div>}
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
        <div className="grid-2">
          <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
          <Field label="Postal code"><input value={f.postal_code} onChange={set('postal_code')} /></Field>
          <Field label="Province"><input value={f.province} onChange={set('province')} /></Field>
          <Field label="Country"><input value={f.country} onChange={set('country')} /></Field>
        </div>
        <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <div className="grid-2">
          <Field label="Tier"><select value={f.tier} onChange={set('tier')}>{Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.label} — {t.hint}</option>)}</select></Field>
          <Field label="Lead temperature"><select value={f.temperature || ''} onChange={set('temperature')} disabled={!['tier2', 'tier4'].includes(f.tier)}><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></Field>
        </div>
        <Field label="Notes"><textarea rows={3} value={f.notes || ''} onChange={set('notes')} /></Field>
        <div className="row"><button className="btn primary" disabled={busy}>{isNew ? 'Add company' : 'Save changes'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Drawer>
  );
}
