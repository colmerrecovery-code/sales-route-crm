import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, fmtKm, fmtDur, fmtTime, fmtDate, fmtClock, provinceParam } from '../services/api.js';
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
  const [whereAmI, setWhereAmI] = useState(null); // day number, when we have to ask
  const [addToDay, setAddToDay] = useState(null);  // which day new stops land on
  const [findStop, setFindStop] = useState('');    // search box for the stop picker
  const [homeNightly, setHomeNightly] = useState(true); // out and back each day, vs one overnight loop
  const [visitMin, setVisitMin] = useState('');   // visit length being typed in the header
  const [durStop, setDurStop] = useState(null);   // one stop whose length is being overridden
  const [stayDay, setStayDay] = useState(null);   // which night's lodging is being edited
  const [stayText, setStayText] = useState('');
  const [hoursOpen, setHoursOpen] = useState(false); // the day's working hours being edited
  const [hours, setHours] = useState({ start: '', end: '' });

  const load = () => api.trip(id).then((t) => { setTrip(t); setVisitMin(String(t.default_visit_min)); return t; });
  /* Candidates for a stop come from the territory too -- picking a day's
     visits should never mean scrolling past Alberta. */
  useEffect(() => { load(); api.companiesForMap({ provinces: provinceParam('territory') }).then(setCandidates); }, [id]);

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
  const optimize = () => act(async () => {
    const r = await api.optimize(id, true, homeNightly);
    setRoute(r.geometry); setDirs(null);
    const shape = r.home_each_night ? 'home each night' : 'one continuous loop';
    const built = `Route built — ${r.days} day${r.days === 1 ? '' : 's'}, ${shape}.`;
    setMsg(r.unscheduled?.length
      ? { ok: false, text: `${built} ${r.unscheduled.length} stop${r.unscheduled.length === 1 ? '' : 's'} wouldn't fit and ${r.unscheduled.length === 1 ? 'is' : 'are'} parked at the end with no time: ${r.unscheduled.join(', ')}. Push them to another day, add a day, or take them off — nothing was deleted.` }
      : { ok: true, text: built });
  });
  const addPicked = () => act(async () => {
    await api.addStops(id, [...picked], undefined, addToDay || undefined);
    setPicked(new Set()); setPanel(null); setFindStop('');
    setMsg({ ok: true, text: addToDay
      ? `Added to day ${addToDay}, without times. Hit Recalculate on that day to slot them in.`
      : 'Added to the trip. Build the route to schedule them.' });
  });

  /* Rebuild one day from the start point at the start of hours, leaving every
     other day alone. This is the deliberate version of re-planning: you moved
     something, you removed something, now make the day make sense again. */
  const recalcDay = (day) => act(async () => {
    const r = await api.replan(id, { day });
    setRoute(r.geometry); setDirs(null);
    const bits = [`Day ${r.replanned_day} recalculated.`, `${r.rescheduled} stop${r.rescheduled === 1 ? '' : 's'} scheduled.`];
    if (r.dropped?.length) bits.push(`Won't fit in the day: ${r.dropped.join(', ')} — still listed, no time against them. Move them to another day or take them off.`);
    setMsg({ ok: !r.dropped?.length, text: bits.join(' ') });
  });

  const moveToDay = (stopId, day) => act(
    () => api.updateStop(id, stopId, { day_number: day }),
    `Moved to day ${day}, untimed. Recalculate that day when you're ready.`);

  /* Push a stop into a later day and immediately make that day make sense.
     Deliberately two existing calls chained: move it, then recalculate where it
     landed — so a bumped stop is never left sitting somewhere untimed and
     forgotten. If the target day is past the end of the trip, the trip grows to
     cover it rather than the stop falling off the end. */
  const pushToDay = (stop, toDay) => act(async () => {
    const lastDay = days.length ? days[days.length - 1][0] : 1;
    if (toDay > lastDay && trip.start_date) {
      const x = new Date(trip.start_date);
      x.setUTCDate(x.getUTCDate() + toDay - 1);
      const needed = x.toISOString().slice(0, 10);
      if (!trip.end_date || needed > trip.end_date) await api.updateTrip(id, { end_date: needed });
    }
    await api.updateStop(id, stop.id, { day_number: toDay });
    const r = await api.replan(id, { day: toDay });
    setRoute(r.geometry); setDirs(null);
    const stuck = (r.dropped || []).includes(stop.company_name);
    const others = (r.dropped || []).filter((n) => n !== stop.company_name);
    setMsg({
      ok: !stuck,
      text: stuck
        ? `${stop.company_name} moved to ${dayDate(toDay)}, but it doesn't fit that day either — it's listed there with no time. Push it on again, or take it off.`
        : `${stop.company_name} moved to ${dayDate(toDay)} and scheduled.`
          + (others.length ? ` Making room pushed out: ${others.join(', ')} — still on that day, no time.` : ''),
    });
  });
  /* Where each day begins and ends.
     The stored model is "day N's base is where you set out on the morning of
     day N", so the END of day N is the base of day N+1. That is precise but
     backwards from how anyone thinks about it, so the UI asks the natural
     question — "where do you stay tonight?" — and writes it to the next day. */
  const baseOf = (day) => (trip?.day_bases || []).find((b) => b.day_number === day) || null;

  /* "Home" is a label, not a fact. Name the actual place, because the silent
     fallback when no home base is set is "whichever customer happens to be
     first" — which measures the whole trip from the wrong doorstep and says
     nothing about it. */
  const homeName = trip?.start_lat != null ? 'the trip start point'
    : (user.home_address || null);
  const placeName = (day) =>
    baseOf(day)?.label || baseOf(day)?.address || homeName || 'the first stop';

  const setStay = (night) => act(async () => {
    const where = stayText.trim();
    if (!where) throw new Error('Type the hotel address first.');
    const r = await api.setDayBase(id, night + 1, { address: where });
    setStayDay(null); setStayText('');
    setMsg({ ok: true, text: `Night of day ${night} set to ${where}. Day ${night} now finishes there and day ${night + 1} sets out from it — hit Rebuild route to re-plan around it.` });
    return r;
  });

  const clearStay = (night) => act(
    () => api.clearDayBase(id, night + 1),
    `Night of day ${night} back to home. Rebuild the route to apply it.`);

  /* How long a visit takes, changed mid-trip. A cold-call drop-in is 15-20
     minutes, not the 45 a booked meeting needs, and that difference decides how
     many customers fit in a day. Applies to the trip AND to every stop not yet
     visited — changing only the trip default would leave today untouched, which
     looks broken. Visited stops keep what actually happened. */
  const applyVisitLength = () => act(async () => {
    const n = Number(visitMin);
    if (!Number.isInteger(n) || n < 5) throw new Error('Give a visit length of at least 5 minutes.');
    const r = await api.setVisitLength(id, n);
    setMsg({ ok: true, text: `Visits set to ${n} min on ${r.changed} stop${r.changed === 1 ? '' : 's'}. Hit Recalculate on each day to re-time it.` });
  });

  /* The day's working hours, changed mid-trip. Starting an hour earlier is how
     an extra stop fits, and the backend has accepted new hours all along
     (PATCH /trips) — there was just no way to say so from this screen. Same
     contract as the visit length: apply, then re-time — nothing is re-planned
     behind your back. */
  const applyHours = () => act(async () => {
    const { start, end } = hours;
    if (!start || !end) throw new Error('Give both a start and an end time.');
    if (end <= start) throw new Error('The day has to end after it starts.');
    await api.updateTrip(id, { work_start: start, work_end: end });
    setHoursOpen(false);
    setMsg({ ok: true, text: `Hours set to ${fmtClock(start)} – ${fmtClock(end)}. Hit ${trip.total_distance_m ? 'Rebuild route' : 'Build route'} to re-time the whole trip, or Recalculate on a single day.` });
  });

  /* One stop that doesn't match the rest — a real meeting among the drop-ins. */
  const setStopMinutes = (stop, mins) => act(async () => {
    const n = Number(mins);
    if (!Number.isInteger(n) || n < 5) throw new Error('At least 5 minutes.');
    await api.updateStop(id, stop.id, { duration_min: n });
    setDurStop(null);
    setMsg({ ok: true, text: `${stop.company_name} set to ${n} min. Recalculate the day to re-time it.` });
  });

  const showDirections = (day) => act(async () => { const d = await api.directions(id, day); setDirs({ day, ...d }); setRoute(d.geometry); setPanel('directions'); });
  const setStatus = (status) => act(() => api.updateTrip(id, { status }));

  /* Re-plan the rest of a day from where you are standing.
     Phone GPS only works over HTTPS, and this app is often reached over plain
     http on a private address — so when the browser won't give us a position we
     ask which stop you're at instead. In a moving vehicle that's arguably the
     better question anyway. */
  const todayNumber = () => {
    const start = new Date(trip.start_date);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const n = Math.round((today - start) / 86400000) + 1;
    return days.some(([d]) => d === n) ? n : (days[0]?.[0] || 1);
  };

  const runReplan = (day, coords) => act(async () => {
    const now = new Date();
    const r = await api.replan(id, {
      lat: coords.lat, lng: coords.lng, day,
      from_minutes: now.getHours() * 60 + now.getMinutes(),
    });
    setRoute(r.geometry); setDirs(null); setWhereAmI(null);
    const bits = [`Day ${r.replanned_day} rebuilt from ${r.from}.`];
    if (r.kept) bits.push(`${r.kept} already visited, left alone.`);
    bits.push(`${r.rescheduled} stop${r.rescheduled === 1 ? '' : 's'} re-timed.`);
    if (r.dropped?.length) bits.push(`No longer fits today: ${r.dropped.join(', ')} — still on the day, without a time.`);
    setMsg({ ok: !r.dropped?.length, text: bits.join(' ') });
  });

  const replanFromHere = () => {
    const day = todayNumber();
    if (!navigator.geolocation || !window.isSecureContext) return setWhereAmI(day);
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); runReplan(day, { lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { setBusy(false); setWhereAmI(day); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  if (!trip) return <div className="page muted">Loading trip…</div>;
  const dayDate = (d) => { const x = new Date(trip.start_date); x.setUTCDate(x.getUTCDate() + d - 1); return x.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link to="/trips" className="link">Road trips</Link> · {fmtDate(trip.start_date)}{trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ''} ·{' '}
            <button type="button" className="linklike" disabled={busy}
              title="Change what time the day starts and ends"
              onClick={() => {
                setHours({ start: (trip.work_start || '08:30').slice(0, 5), end: (trip.work_end || '17:00').slice(0, 5) });
                setHoursOpen((v) => !v);
              }}>
              {fmtClock(trip.work_start)} – {fmtClock(trip.work_end)} ✎
            </button>
          </div>
          <h1>{trip.name}</h1>
        </div>
        <div className="row">
          {trip.status === 'draft' || trip.status === 'planned' ? <button className="btn" onClick={() => setStatus('in_progress')}>Start trip</button> : null}
          {trip.status === 'in_progress' && <button className="btn good" onClick={() => setStatus('completed')}><IconCheck />Mark completed</button>}
          {customerStops.some((s) => !s.visited) && trip.total_distance_m != null && (
            <button className="btn good" disabled={busy} onClick={replanFromHere} title="Rebuild the rest of today from where you are now">
              <IconNav />{busy ? 'Working…' : 'Re-plan from here'}
            </button>
          )}
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title="How long you spend at each stop. Applies to every stop you haven't visited yet.">
            Visit
            <input type="number" min={5} max={480} value={visitMin} disabled={busy}
              onChange={(e) => setVisitMin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyVisitLength(); }}
              style={{ width: 62, padding: '4px 6px' }} />
            min
            <button className="btn sm" disabled={busy || String(trip.default_visit_min) === visitMin}
              onClick={applyVisitLength}>Apply</button>
          </label>
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title="On: every day starts and ends at your home base. Off: one continuous loop, for a trip with overnight stays.">
            <input type="checkbox" checked={homeNightly} onChange={(e) => setHomeNightly(e.target.checked)} />
            Home each night
          </label>
          <button className="btn primary" disabled={busy || customerStops.length < 1} onClick={optimize}><IconRefresh />{busy ? 'Working…' : (trip.total_distance_m ? 'Rebuild route' : 'Build route')}</button>
        </div>
      </div>
      {hoursOpen && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="small muted">The day runs from</span>
          <input type="time" value={hours.start} disabled={busy}
            onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))} />
          <span className="small muted">to</span>
          <input type="time" value={hours.end} disabled={busy}
            onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))} />
          <button className="btn sm primary" disabled={busy} onClick={applyHours}>Apply</button>
          <button className="btn sm" disabled={busy} onClick={() => setHoursOpen(false)}>Cancel</button>
        </div>
      )}
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {!start && (
        <div className="alert warn" style={{ marginBottom: 14 }}>
          <b>No home base set.</b> Every day is being measured from the first stop instead of
          your own front door, so distances and finish times are wrong. Set it under your name
          at the bottom of the menu, then rebuild the route.
        </div>
      )}

      {whereAmI != null && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Day {whereAmI}</div>
          <h2 style={{ marginBottom: 4 }}>Where are you now?</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Your phone won't share its location over a plain http address, so pick the
            last place you were and I'll plan the rest of the day from there.
          </p>
          <div className="list">
            {start && (
              <button className="btn block" onClick={() => runReplan(whereAmI, start)}>
                Still at my start point
              </button>
            )}
            {(trip.stops.filter((s) => s.day_number === whereAmI && s.kind === 'customer' && s.lat != null)).map((s) => (
              <button key={s.id} className="btn block" onClick={() => runReplan(whereAmI, { lat: s.lat, lng: s.lng })}>
                {s.visited ? '✓ ' : ''}{s.company_name}<span className="small muted"> · {s.city}</span>
              </button>
            ))}
          </div>
          <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setWhereAmI(null)}>Cancel</button>
        </div>
      )}

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
              <div className="row" style={{ marginBottom: 10, alignItems: 'center', gap: 8 }}>
                <span className="small muted">Add to</span>
                <select value={addToDay || ''} onChange={(e) => setAddToDay(e.target.value ? Number(e.target.value) : null)} style={{ width: 150 }}>
                  <option value="">End of the trip</option>
                  {days.map(([d]) => <option key={d} value={d}>Day {d} · {dayDate(d)}</option>)}
                </select>
              </div>
              <input
                placeholder="Search by name, city or code"
                value={findStop}
                onChange={(e) => setFindStop(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
                autoFocus
              />
              {(() => {
                const q = findStop.trim().toLowerCase();
                const pool = candidates.filter((c) => !inTrip.has(c.id));
                const hits = q
                  ? pool.filter((c) => `${c.name} ${c.city || ''} ${c.company_code}`.toLowerCase().includes(q))
                  : [];
                return (
                  <p className="small muted" style={{ margin: '0 0 8px' }}>
                    {!q ? `${pool.length} customers not already on this trip — start typing to find one.`
                        : hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}${hits.length > 40 ? ' — showing the first 40' : ''}`
                        : 'Nothing matches that.'}
                  </p>
                );
              })()}
              <div className="picker">
                {(() => {
                  const q = findStop.trim().toLowerCase();
                  if (!q) return [];
                  return candidates
                    .filter((c) => !inTrip.has(c.id))
                    .filter((c) => `${c.name} ${c.city || ''} ${c.company_code}`.toLowerCase().includes(q))
                    .slice(0, 40);
                })().map((c) => (
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
                <div key={b.id} className="li-row"><span className="pill grey">{b.kind.replace('_', ' ')}</span><div><b>{b.label || fmtClock(b.starts_at)}</b> <span className="small muted">{b.duration_min} min · {b.only_on_day ? `day ${b.only_on_day}` : 'every day'}</span></div><button className="btn sm ghost" onClick={() => act(() => api.removeBreak(id, b.id))}>Remove</button></div>
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
            const unsched = stops.filter((s) => s.kind === 'customer' && !s.planned_arrival).length;
            return (
              <div key={day}>
                <div className="day">
                  <h2>Day {day} <span className="muted" style={{ fontWeight: 500 }}>· {dayDate(day)}</span></h2>
                  <span className="meta">{stops.filter((s) => s.kind === 'customer').length} visits · {fmtKm(dist)} · {fmtDur(dur)}</span>
                  {unsched > 0 && <span className="meta" style={{ color: 'var(--amber)' }}>{unsched} unscheduled</span>}
                  <span style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => { setAddToDay(day); setPanel('add'); }}><IconPlus />Add stop</button>
                  <button className="btn sm" disabled={busy} onClick={() => recalcDay(day)}><IconRefresh />Recalculate</button>
                  <button className="btn sm" onClick={() => showDirections(day)}><IconNav />Directions</button>
                </div>

                {/* Reads left to right the way the day is actually driven. */}
                <div className="small muted" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '2px 0 10px' }}>
                  <span>From <b style={{ color: 'var(--text)' }}>{placeName(day)}</b></span>
                  <span>·</span>
                  <span>{baseOf(day + 1) ? 'stays at' : 'back to'} <b style={{ color: baseOf(day + 1) ? 'var(--amber)' : 'var(--text)' }}>{placeName(day + 1)}</b></span>
                  <button className="btn sm ghost" style={{ padding: '2px 8px' }}
                    onClick={() => { setStayDay(stayDay === day ? null : day); setStayText(baseOf(day + 1)?.address || ''); }}>
                    {baseOf(day + 1) ? 'Change' : 'Staying over?'}
                  </button>
                  {baseOf(day + 1) && (
                    <button className="btn sm ghost" style={{ padding: '2px 8px' }} disabled={busy}
                      onClick={() => clearStay(day)}>Home instead</button>
                  )}
                </div>

                {stayDay === day && (
                  <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input style={{ flex: 1, minWidth: 220 }} value={stayText} autoFocus
                      placeholder="Hotel address — e.g. 300 King St, London ON"
                      onChange={(e) => setStayText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setStay(day); }} />
                    <button className="btn sm primary" disabled={busy} onClick={() => setStay(day)}>Save</button>
                    <button className="btn sm ghost" onClick={() => setStayDay(null)}>Cancel</button>
                  </div>
                )}
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
                      <div className="sub">
                        {[s.address, s.city].filter(Boolean).join(', ')}
                        {' · '}
                        {durStop === s.id ? (
                          <input type="number" min={5} max={480} defaultValue={s.duration_min} autoFocus
                            style={{ width: 58, padding: '1px 4px' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') setStopMinutes(s, e.target.value); if (e.key === 'Escape') setDurStop(null); }}
                            onBlur={(e) => setStopMinutes(s, e.target.value)} />
                        ) : (
                          <button className="linklike" title="Change how long this one visit takes"
                            onClick={() => setDurStop(s.id)}>{s.duration_min} min</button>
                        )}
                      </div>
                      {s.leg_distance_m != null && <div className="leg">↳ {fmtKm(s.leg_distance_m)} · {fmtDur(s.leg_duration_s)} from previous</div>}
                    </div>
                    <div className="t">{fmtTime(s.planned_arrival) || <span className="small muted" title="Not scheduled — recalculate the day, or move it">no time</span>}</div>
                    <div className="actions">
                      <button className={`btn sm ${s.visited ? '' : 'good'}`} onClick={() => act(() => api.updateStop(id, s.id, { visited: !s.visited }))}><IconCheck />{s.visited ? 'Undo' : 'Visited'}</button>
                      {s.lat != null && <a className="btn sm" href={`https://maps.apple.com/?daddr=${s.lat},${s.lng}`} target="_blank" rel="noreferrer"><IconNav />Go</a>}
                      {!s.planned_arrival && (
                        <button className="btn sm" disabled={busy} onClick={() => pushToDay(s, day + 1)}
                          title={`Move to ${dayDate(day + 1)} and reschedule that day`}>→ {dayDate(day + 1).split(',')[0]}</button>
                      )}
                      {!s.planned_arrival && days.length > 1 && (
                        <select className="btn sm" defaultValue="" style={{ padding: '4px 6px' }}
                          onChange={(e) => { if (e.target.value) moveToDay(s.id, Number(e.target.value)); }}>
                          <option value="">Move to…</option>
                          {days.filter(([d]) => d !== day).map(([d]) => <option key={d} value={d}>Day {d} · {dayDate(d)}</option>)}
                        </select>
                      )}
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
