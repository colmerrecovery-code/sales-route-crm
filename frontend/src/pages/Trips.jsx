import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate, fmtKm, fmtDur } from '../services/api.js';
import { Field } from '../components/Badges.jsx';

export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [f, setF] = useState({ name: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', work_start: '08:30', work_end: '17:00', default_visit_min: 45 });
  const nav = useNavigate();
  useEffect(() => { api.trips().then(setTrips); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function create(e) {
    e.preventDefault();
    const t = await api.createTrip({ ...f, end_date: f.end_date || null, default_visit_min: Number(f.default_visit_min) });
    nav(`/trips/${t.id}`);
  }
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">{trips.length} trips</div><h1>Road trips</h1></div></div>
      <div className="trip-layout">
        <form className="card list" onSubmit={create}>
          <h3>New trip</h3>
          <Field label="Name"><input required placeholder="e.g. Peel Region – week of Sept 8" value={f.name} onChange={set('name')} /></Field>
          <div className="grid-2">
            <Field label="Starts"><input type="date" required value={f.start_date} onChange={set('start_date')} /></Field>
            <Field label="Ends (leave blank for open-ended)"><input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
          </div>
          <div className="grid-3">
            <Field label="Day starts"><input type="time" value={f.work_start} onChange={set('work_start')} /></Field>
            <Field label="Day ends"><input type="time" value={f.work_end} onChange={set('work_end')} /></Field>
            <Field label="Visit length (min)"><input type="number" min={5} value={f.default_visit_min} onChange={set('default_visit_min')} /></Field>
          </div>
          <button className="btn primary">Create trip</button>
        </form>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Trip</th><th>Dates</th><th>Status</th><th>Stops</th><th>Distance</th><th>Driving</th></tr></thead>
            <tbody>
              {trips.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No trips yet. Create one here, or pick customers on the map.</td></tr>}
              {trips.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => nav(`/trips/${t.id}`)}>
                  <td><b>{t.name}</b></td>
                  <td>{fmtDate(t.start_date)}{t.end_date ? ` – ${fmtDate(t.end_date)}` : ' →'}</td>
                  <td className="eyebrow">{t.status.replace('_', ' ')}</td>
                  <td className="num">{t.stop_count}</td>
                  <td className="num">{fmtKm(t.total_distance_m)}</td>
                  <td className="num">{fmtDur(t.total_duration_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
