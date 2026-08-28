import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, fmtKm, fmtDur, fmtTime, fmtDate } from '../services/api.js';
import CrmMap from '../components/CrmMap.jsx';
import { Code, Tier } from '../components/Badges.jsx';
import { IconRefresh, IconNav, IconCheck, IconPlus, IconPhone } from '../components/Icons.jsx';

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
  const [panel, setPanel] = useState(null); // null | 'add' | 'breaks' | 'directions'

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
  const visited = customerStops.filter((s) => s.visited).length;

  async function act(fn, okMsg) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); if (okMsg) setMsg({ ok: true, text: okMsg }); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const optimize = () => act(async () => { const r = await api.optimize(id, true); setRoute(r.geometry); setDirs(null);
    if (r.unscheduled?.length) throw new Error(`Route built, but ${r.unscheduled.length} stop(s) didn't fit before the end date: ${r.unscheduled.join(', ')}. Extend the trip or shorten visits.`); }, 'Route built and scheduled.');
  const addPicked = () => act(async () => { await api.addStops(id, [...picked]); setPicked(new Set()); setRoute(null); setPanel(null); });
  const showDirections = (day) => act(async () => { const d = await api.directions(id, day); setDirs({ day, ...d }); setRoute(d.geometry); setPanel('directions'); });
  const setStatus = (status) => act(() => api.updateTrip(id, { status }));

  if (!trip) return <div className="page muted">Loading trip…</div>;
  const dayDate = (d) => { const x = new Date(trip.start_date); x.setUTCDate(x.getUTCDate() + d - 1); return x.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link to="/trips" className="link">Road trips</Link> · {fmtDate(trip.start_date)}{trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ''} · {trip.work_start.slice(0, 5)}–{trip.work_end.slice(0, 5)}</div>
          <h1>{trip.name}</h1>
        </div>
        <div className="row">
          {trip.status === 'draft' || trip.status === 'planned' ? <button className="btn" onClick={() => setStatus('in_progress')}>Start trip</button> : null}
          {trip.status === 'in_progress' && <button className="btn good" onClick={() => setStatus('completed')}><IconCheck />Mark completed</button>}
          <button className="btn primary" disabled={busy || customerStops.length < 1} onClick={optimize}><IconRefresh />{busy ? 'Working…' : (trip.total_distance_m ? 'Rebuild route' : 'Build route')}</button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {!start && <div className="alert warn" style={{ marginBottom: 14 }}>No start point set — routes begin at the first stop. Set a home base for door-to-door planning.</div>}

      <div className="trip-layout">
        <div className="list">
          <div className="card trip-map">
            <CrmMap companies={customerStops.map((s) => ({ ...s, id: s.id, name: s.company_name }))} numbered route={route} start={start} />
            {trip.total_distance_m != null && <div className="badge"><span>Distance <b>{fmtKm(trip.total_distance_m)}</b></span><span>Driving <b>{fmtDur(trip.total_duration_s)}</b></span><span>Done <b className="good">{visited} / {customerStops.length}</b></span></div>}
          </div>
          <div className="tabs">
            <button className={`btn sm ${panel === 'add' ? 'primary' : ''}`} onClick={() => setPanel(panel === 'add' ? null : 'add')}><IconPlus />Add stops</button>
            <button className={`btn sm ${panel === 'breaks' ? 'primary' : ''}`} onClick={() => setPanel(panel === 'breaks' ? null : 'breaks')}>Breaks ({trip.breaks.length})</button>
            <button className={`btn sm ${panel === 'directions' ? 'primary' : ''}`} disabled={!dirs} onClick={() => setPanel('directions')}>Turn-by-turn</button>
          </div>

          {panel === 'add' && (
            <div className="card">
              <div className="picker">
                {candidates.filter((c) => !inTrip.has(c.id)).map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={picked.has(c.id)} disabled={c.lat == null} onChange={() => setPicked((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                    <Code>{c.company_code}</Code><span style={{ flex: 1 }}>{c.name}<div className="small muted">{c.city}{c.lat == null ? ' · not on map' : ''}</div></span><Tier tier={c.tier} />
                  </label>
                ))}
              </div>
              <button className="btn primary block" style={{ marginTop: 10 }} disabled={picked.size === 0 || busy} onClick={addPicked}>Add {picked.size || ''} to trip</button>
            </div>
          )}
          {panel === 'breaks' && (
            <div className="card list">
              {trip.breaks.map((b) => (
                <div key={b.id} className="li-row"><span className="pill grey">{b.kind.replace('_', ' ')}</span><div><b>{b.label || b.starts_at.slice(0, 5)}</b> <span className="small muted">{b.duration_min} min · {b.only_on_day ? `day ${b.only_on_day}` : 'every day'}</span></div><button className="btn sm ghost" onClick={() => act(() => api.removeBreak(id, b.id))}>Remove</button></div>
              ))}
              <div className="row">
                <select value={brk.kind} onChange={(e) => setBrk({ ...brk, kind: e.target.value })} style={{ width: 120 }}>
                  <option value="lunch">Lunch</option><option value="meeting">Meeting</option><option value="off_duty">Off duty</option><option value="other">Other</option>
                </select>
                <input type="time" value={brk.starts_at} onChange={(e) => setBrk({ ...brk, starts_at: e.target.value })} style={{ width: 120 }} />
                <input type="number" min={5} value={brk.duration_min} onChange={(e) => setBrk({ ...brk, duration_min: Number(e.target.value) })} style={{ width: 80 }} />
                <button className="btn" onClick={() => act(() => api.addBreak(id, brk))}>Add</button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Breaks repeat every day. Rebuild the route after changing them.</p>
            </div>
          )}
          {panel === 'directions' && dirs && (
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

        <div className="card">
          {days.length === 0 && <div className="muted">No stops yet. Tap <b>Add stops</b>, then <b>Build route</b>.</div>}
          {days.map(([day, stops]) => {
            const dist = stops.reduce((a, s) => a + (s.leg_distance_m || 0), 0);
            const dur = stops.reduce((a, s) => a + (s.leg_duration_s || 0), 0);
            return (
              <div key={day}>
                <div className="day">
                  <h2>Day {day} <span className="muted" style={{ fontWeight: 500 }}>· {dayDate(day)}</span></h2>
                  <span className="meta">{stops.filter((s) => s.kind === 'customer').length} visits · {fmtKm(dist)} · {fmtDur(dur)}</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => showDirections(day)}><IconNav />Directions</button>
                </div>
                {stops.map((s, i) => s.kind === 'break' ? (
                  <div key={s.id} className="stop break">
                    <div className="marker">◦</div>
                    <div><div className="name muted">{s.break_label || s.break_kind?.replace('_', ' ')}</div><div className="sub">{s.duration_min} min</div></div>
                    <div className="t">{fmtTime(s.planned_arrival)}</div>
                  </div>
                ) : (
                  <div key={s.id} className={`stop ${s.visited ? 'visited' : ''}`}>
                    <div className="marker">{s.visited ? '✓' : stops.slice(0, i).filter((x) => x.kind === 'customer').length + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{s.company_name} <span className="code" style={{ fontSize: 10, padding: '2px 6px' }}>{s.company_code}</span></div>
                      <div className="sub">{[s.address, s.city].filter(Boolean).join(', ')} · {s.duration_min} min</div>
                      {s.leg_distance_m != null && <div className="leg">↳ {fmtKm(s.leg_distance_m)} · {fmtDur(s.leg_duration_s)} from previous</div>}
                    </div>
                    <div className="t">{fmtTime(s.planned_arrival) || '—'}</div>
                    <div className="actions">
                      <button className={`btn sm ${s.visited ? '' : 'good'}`} onClick={() => act(() => api.updateStop(id, s.id, { visited: !s.visited }))}><IconCheck />{s.visited ? 'Undo' : 'Visited'}</button>
                      {s.lat != null && <a className="btn sm" href={`https://maps.apple.com/?daddr=${s.lat},${s.lng}`} target="_blank" rel="noreferrer"><IconNav />Go</a>}
                      <button className="btn sm ghost" onClick={() => act(() => api.removeStop(id, s.id))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {trip.total_distance_m != null && (
            <div className="totals"><span>Total <b>{fmtKm(trip.total_distance_m)}</b></span><span>Driving <b>{fmtDur(trip.total_duration_s)}</b></span><span>Days <b>{days.length}</b></span><span>Done <b className="good">{visited}/{customerStops.length}</b></span></div>
          )}
          <div className="row" style={{ marginTop: 16 }}><button className="btn sm ghost danger" onClick={() => { if (confirm('Delete this trip?')) api.deleteTrip(id).then(() => nav('/trips')); }}>Delete trip</button></div>
        </div>
      </div>
    </div>
  );
}
