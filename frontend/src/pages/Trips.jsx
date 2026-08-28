import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDate, fmtKm, fmtDur } from '../services/api.js';
import { Field } from '../components/Badges.jsx';
import { IconPlus } from '../components/Icons.jsx';

const statusPill = { draft: 'grey', planned: 'cyan', in_progress: 'amber', completed: 'green', cancelled: 'red' };

export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [creating, setCreating] = useState(false);
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
      <div className="page-head">
        <div><div className="eyebrow">{trips.length} trips</div><h1>Road trips</h1></div>
        <button className="btn primary" onClick={() => setCreating(!creating)}><IconPlus />New trip</button>
      </div>
      {creating && (
        <form className="card list" onSubmit={create} style={{ marginBottom: 14 }}>
          <Field label="Name"><input required placeholder="e.g. Peel Region – week of Sept 8" value={f.name} onChange={set('name')} /></Field>
          <div className="grid-2">
            <Field label="Starts"><input type="date" required value={f.start_date} onChange={set('start_date')} /></Field>
            <Field label="Ends (blank = open-ended)"><input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
            <Field label="Day starts"><input type="time" value={f.work_start} onChange={set('work_start')} /></Field>
            <Field label="Day ends"><input type="time" value={f.work_end} onChange={set('work_end')} /></Field>
          </div>
          <Field label="Visit length (minutes)"><input type="number" min={5} value={f.default_visit_min} onChange={set('default_visit_min')} /></Field>
          <div className="row"><button className="btn primary">Create trip</button><button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button></div>
        </form>
      )}
      <div className="list">
        {trips.length === 0 && <div className="card muted">No trips yet. Create one here, or pick customers on the map.</div>}
        {trips.map((t) => (
          <div key={t.id} className="list-item clickable" onClick={() => nav(`/trips/${t.id}`)}>
            <div>
              <div className="row" style={{ gap: 8 }}><span className={`pill ${statusPill[t.status]}`}>{t.status.replace('_', ' ')}</span><span className="small muted">{fmtDate(t.start_date)}{t.end_date ? ` – ${fmtDate(t.end_date)}` : ' · open-ended'}</span></div>
              <div className="name" style={{ marginTop: 6 }}>{t.name}</div>
              <div className="small muted num">{t.stop_count} stops{t.total_distance_m ? ` · ${fmtKm(t.total_distance_m)} · ${fmtDur(t.total_duration_s)} driving` : ' · not routed yet'}</div>
            </div>
            <span className="muted">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}
