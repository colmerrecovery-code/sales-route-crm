import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TIERS } from '../services/api.js';
import CrmMap from '../components/CrmMap.jsx';
import { Code, Tier } from '../components/Badges.jsx';

export default function MapView() {
  const [filters, setFilters] = useState({ tier: '', city: '', postal_code: '', due: '' });
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState('');
  const [msg, setMsg] = useState(null);
  const nav = useNavigate();

  useEffect(() => { api.companies(filters).then(setRows); }, [filters]);
  useEffect(() => { api.trips().then((t) => setTrips(t.filter((x) => x.status !== 'completed' && x.status !== 'cancelled'))); }, []);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  async function addToTrip() {
    setMsg(null);
    let id = tripId;
    if (!id) {
      const t = await api.createTrip({ name: `Trip ${new Date().toLocaleDateString('en-CA')}`, start_date: new Date().toISOString().slice(0, 10) });
      id = t.id;
    }
    await api.addStops(id, [...selected]);
    nav(`/trips/${id}`);
  }

  return (
    <div className="map-page">
      <aside className="map-side">
        <div className="eyebrow">{rows.filter((r) => r.lat != null).length} on map</div>
        <h1 style={{ marginBottom: 14 }}>Map</h1>
        <div className="list">
          <select value={filters.tier} onChange={set('tier')} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
            <option value="">All tiers</option>{Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.short} · {t.label}</option>)}
          </select>
          <input placeholder="City" value={filters.city} onChange={set('city')} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
          <input placeholder="Postal code prefix (e.g. L6S)" value={filters.postal_code} onChange={set('postal_code')} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
          <label className="row small"><input type="checkbox" checked={filters.due === 'true'} onChange={(e) => setFilters({ ...filters, due: e.target.checked ? 'true' : '' })} /> Only quarterly touches due</label>
        </div>

        <div className="section">
          <h3>Build a route</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Tick customers below or click pins, then add them to a trip. The trip builder orders them for you.</p>
          <div className="picker card" style={{ padding: 0 }}>
            {rows.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} disabled={c.lat == null} />
                <Code>{c.company_code}</Code>
                <span style={{ flex: 1 }}>{c.name}<div className="small muted">{c.city}{c.lat == null ? ' · not on map' : ''}</div></span>
                <Tier tier={c.tier} />
              </label>
            ))}
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
              <option value="">New trip</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.stop_count} stops)</option>)}
            </select>
            <button className="btn primary" disabled={selected.size === 0} onClick={addToTrip}>Add {selected.size || ''} to trip</button>
            {msg && <div className="alert">{msg}</div>}
          </div>
        </div>
      </aside>
      <div className="map-wrap"><CrmMap companies={rows} onSelect={(c) => toggle(c.id)} /></div>
    </div>
  );
}
