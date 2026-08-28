import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TIERS } from '../services/api.js';
import CrmMap from '../components/CrmMap.jsx';
import { Code, Tier } from '../components/Badges.jsx';
import { IconRoute } from '../components/Icons.jsx';

export default function MapView() {
  const [filters, setFilters] = useState({ tier: '', city: '', postal_code: '', due: '' });
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState('');
  const [showList, setShowList] = useState(false);
  const nav = useNavigate();

  useEffect(() => { api.companies(filters).then(setRows); }, [filters]);
  useEffect(() => { api.trips().then((t) => setTrips(t.filter((x) => x.status !== 'completed' && x.status !== 'cancelled'))); }, []);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  async function addToTrip() {
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
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div><div className="eyebrow">{rows.filter((r) => r.lat != null).length} on map · {selected.size} picked</div><h2>Build a route</h2></div>
          <button className="btn sm ghost" onClick={() => setShowList(!showList)}>{showList ? 'Hide list' : 'Show list'}</button>
        </div>
        <div className="filters">
          <select value={filters.tier} onChange={set('tier')}><option value="">All tiers</option>{Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
          <select value={filters.due} onChange={set('due')}><option value="">Any status</option><option value="true">Overdue only</option></select>
          <input placeholder="City" value={filters.city} onChange={set('city')} />
          <input placeholder="Postal prefix" value={filters.postal_code} onChange={set('postal_code')} />
        </div>
        <p className="small muted" style={{ margin: '0 0 8px' }}>Tap pins on the map to pick customers, then add them to a trip.</p>
        {showList && (
          <div className="picker card" style={{ padding: '0 8px', marginBottom: 10 }}>
            {rows.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} disabled={c.lat == null} />
                <Code>{c.company_code}</Code>
                <span style={{ flex: 1 }}>{c.name}<div className="small muted">{c.city}{c.lat == null ? ' · not on map' : ''}</div></span>
                <Tier tier={c.tier} />
              </label>
            ))}
          </div>
        )}
        <div className="row">
          <select value={tripId} onChange={(e) => setTripId(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            <option value="">New trip</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.stop_count} stops)</option>)}
          </select>
          <button className="btn primary" disabled={selected.size === 0} onClick={addToTrip}><IconRoute />Add {selected.size || ''} to trip</button>
        </div>
      </aside>
      <div className="map-wrap"><CrmMap companies={rows} selected={selected} onSelect={(c) => toggle(c.id)} /></div>
    </div>
  );
}
