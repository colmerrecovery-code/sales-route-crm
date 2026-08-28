import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, fmtKm, fmtDur, fmtTime, fmtDate } from '../services/api.js';
import CrmMap from '../components/CrmMap.jsx';
import { Code, Tier, Field } from '../components/Badges.jsx';

export default function TripBuilder({ user }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [trip, setTrip] = useState(null);
  const [route, setRoute] = useState(null);
  const [dirs, setDirs] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [brk, setBrk] = useState({ kind: 'lunch', starts_at: '12:00', duration_min: 60 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('stops');

  const load = () => api.trip(id).then(setTrip);
  useEffect(() => { load(); api.companies().then(setCandidates); }, [id]);

  const customerStops = useMemo(() => trip?.stops.filter((s) => s.kind === 'customer') || [], [trip]);
  const days = useMemo(() => {
    const m = new Map();
    for (const s of trip?.stops || []) { if (!m.has(s.day_number)) m.set(s.day_number, []); m.get(s.day_number).push(s); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [trip]);
  const start = trip?.start_lat != null ? { lat: trip.start_lat, lng: trip.start_lng } : (user.home_lat != null ? { lat: user.home_lat, lng: user.home_lng } : null);
  const inTrip = new Set(customerStops.map((s) => s.company_id));

  async function act(fn, okMsg) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); if (okMsg) setMsg({ ok: true, text: okMsg }); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const optimize = () => act(async () => { const r = await api.optimize(id, true); setRoute(r.geometry); setDirs(null);
    if (r.unscheduled?.length) throw new Error(`Route built, but ${r.unscheduled.length} stop(s) didn't fit before the end date: ${r.unscheduled.join(', ')}. Extend the trip or shorten visits.`); }, 'Route built and scheduled.');
  const addPicked = () => act(async () => { await api.addStops(id, [...picked]); setPicked(new Set()); setRoute(null); });
  const showDirections = (day) => act(async () => { const d = await api.directions(id, day); setDirs({ day, ...d }); setRoute(d.geometry); setTab('directions'); });
  const setStatus = (status) => act(() => api.updateTrip(id, { status }));

  if (!trip) return <div className="page muted">Loading trip…</div>;

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link to="/trips">Road trips</Link> · {fmtDate(trip.start_date)}{trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ' · open-ended'} · {trip.work_start.slice(0, 5)}–{trip.work_end.slice(0, 5)} · {trip.status.replace('_', ' ')}</div>
          <h1>{trip.name}</h1>
        </div>
        <div className="row">
          {trip.status === 'planned' && <button className="btn" onClick={() => setStatus('in_progress')}>Start trip</button>}
          {trip.status === 'in_progress' && <button className="btn" onClick={() => setStatus('completed')}>Mark completed</button>}
          <button className="btn ghost danger sm" onClick={() => { if (confirm('Delete this trip?')) api.deleteTrip(id).then(() => nav('/trips')); }}>Delete</button>
          <button className="btn primary" disabled={busy || customerStops.length < 1} onClick={optimize}>{busy ? 'Working…' : 'Build route'}</button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {!start && <div className="alert" style={{ marginBottom: 14 }}>No start point set — routes will begin at the first stop. Set a home base in your profile for door-to-door planning.</div>}

      <div className="trip-layout">
        <div className="list">
          <div className="strip">
            {days.length === 0 && <div className="empty">No stops yet. Add customers on the right, then build the route.</div>}
            {days.map(([day, stops]) => {
              const dist = stops.reduce((a, s) => a + (s.leg_distance_m || 0), 0);
              const dur = stops.reduce((a, s) => a + (s.leg_duration_s || 0), 0);
              return (
                <div key={day} className="day-block">
                  <div className="day">
                    <h2>Day {day}</h2>
                    <span className="meta">{stops.filter((s) => s.kind === 'customer').length} visits · {fmtKm(dist)} · {fmtDur(dur)} driving</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn sm" style={{ background: 'transparent', color: '#C9CDC8', borderColor: '#4A5055' }} onClick={() => showDirections(day)}>Directions</button>
                  </div>
                  <div className="lane">
                    {stops.map((s, i) => s.kind === 'break' ? (
                      <div key={s.id} className="stop break">
                        <div className="t">{fmtTime(s.planned_arrival)}</div>
                        <div className="marker">◦</div>
                        <div><div className="name">{s.break_label || s.break_kind?.replace('_', ' ')}</div><div className="sub">{s.duration_min} min</div></div>
                        <div />
                      </div>
                    ) : (
                      <div key={s.id} className={`stop ${s.visited ? 'visited' : ''}`}>
                        <div className="t">{fmtTime(s.planned_arrival) || '—'}</div>
                        <div className="marker">{s.visited ? '✓' : stops.slice(0, i).filter((x) => x.kind === 'customer').length + 1}</div>
                        <div>
                          <div className="name">{s.company_name} <span className="sub">{s.company_code}</span></div>
                          <div className="sub">{[s.address, s.city].filter(Boolean).join(', ')} · {s.duration_min} min</div>
                          {s.leg_distance_m != null && <div className="leg">↳ {fmtKm(s.leg_distance_m)} · {fmtDur(s.leg_duration_s)} from previous</div>}
                        </div>
                        <div className="actions">
                          <button onClick={() => act(() => api.updateStop(id, s.id, { visited: !s.visited }))}>{s.visited ? 'Undo' : 'Visited'}</button>
                          <button onClick={() => act(() => api.removeStop(id, s.id))}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {trip.total_distance_m != null && (
              <div className="totals"><span>Total <b>{fmtKm(trip.total_distance_m)}</b></span><span>Driving <b>{fmtDur(trip.total_duration_s)}</b></span><span>Days <b>{days.length}</b></span></div>
            )}
          </div>

          <div className="card">
            <h3>Breaks &amp; off-duty time</h3>
            <div className="list">
              {trip.breaks.map((b) => (
                <div key={b.id} className="list-item"><div><b>{b.label || b.kind.replace('_', ' ')}</b> <span className="small muted">{b.starts_at.slice(0, 5)} · {b.duration_min} min · {b.only_on_day ? `day ${b.only_on_day}` : 'every day'}</span></div><button className="btn sm ghost" onClick={() => act(() => api.removeBreak(id, b.id))}>Remove</button></div>
              ))}
              <div className="row">
                <select value={brk.kind} onChange={(e) => setBrk({ ...brk, kind: e.target.value })} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}>
                  <option value="lunch">Lunch</option><option value="meeting">Meeting</option><option value="off_duty">Off duty</option><option value="other">Other</option>
                </select>
                <input type="time" value={brk.starts_at} onChange={(e) => setBrk({ ...brk, starts_at: e.target.value })} style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
                <input type="number" min={5} value={brk.duration_min} onChange={(e) => setBrk({ ...brk, duration_min: Number(e.target.value) })} style={{ width: 80, padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
                <button className="btn sm" onClick={() => act(() => api.addBreak(id, brk))}>Add</button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Breaks repeat every day of the trip. Rebuild the route after changing them.</p>
            </div>
          </div>
        </div>

        <div className="list">
          <div className="card" style={{ height: 420, padding: 0, overflow: 'hidden' }}>
            <CrmMap companies={customerStops.map((s) => ({ ...s, id: s.id, name: s.company_name }))} numbered route={route} start={start} />
          </div>
          <div className="row">
            <button className={`btn sm ${tab === 'stops' ? 'primary' : ''}`} onClick={() => setTab('stops')}>Add customers</button>
            <button className={`btn sm ${tab === 'directions' ? 'primary' : ''}`} onClick={() => setTab('directions')} disabled={!dirs}>Turn-by-turn{dirs ? ` · day ${dirs.day}` : ''}</button>
          </div>
          {tab === 'stops' ? (
            <div className="card">
              <div className="picker">
                {candidates.filter((c) => !inTrip.has(c.id)).map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={picked.has(c.id)} disabled={c.lat == null} onChange={() => setPicked((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                    <Code>{c.company_code}</Code><span style={{ flex: 1 }}>{c.name}<div className="small muted">{c.city}{c.lat == null ? ' · not on map' : ''}</div></span><Tier tier={c.tier} />
                  </label>
                ))}
              </div>
              <button className="btn primary sm" style={{ marginTop: 10 }} disabled={picked.size === 0 || busy} onClick={addPicked}>Add {picked.size || ''} to trip</button>
            </div>
          ) : dirs && (
            <div className="card">
              <div className="eyebrow">Day {dirs.day} · {fmtKm(dirs.distance_m)} · {fmtDur(dirs.duration_s)}</div>
              {dirs.legs.map((leg, i) => (
                <div key={i} className="section" style={{ marginTop: 14 }}>
                  <h3>To {dirs.stops[i]?.company_name || 'end point'} · {fmtKm(leg.distance_m)}</h3>
                  <ol className="directions" style={{ margin: 0, paddingLeft: 18 }}>
                    {leg.steps.map((st, j) => <li key={j}><span>{st.instruction}</span><span className="num muted small">{fmtKm(st.distance_m)}</span></li>)}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
