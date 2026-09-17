import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtKm, fmtDur, fmtTime, provinceParam } from '../services/api.js';
import { Code, Ring, TouchPill } from '../components/Badges.jsx';
import { IconCheck, IconClock, IconFlame, IconNav, IconPhone, IconRefresh, IconRoute } from '../components/Icons.jsx';

/* Today, as the calendar on the wall has it. Trip dates are plain dates stored
   at midnight UTC, so they are compared as YYYY-MM-DD strings rather than as
   moments in time -- a Date built from "now" is an instant, and west of
   Greenwich that instant belongs to yesterday in UTC. */
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayOnly = (iso) => (iso ? String(iso).slice(0, 10) : null);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayGap = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [due, setDue] = useState([]);
  const [leads, setLeads] = useState([]);
  const [trips, setTrips] = useState([]);
  const [todayRoute, setTodayRoute] = useState(null); // { trip, day, stops } when a trip covers today
  const [busyStop, setBusyStop] = useState(null);
  /* Logging a touch from this page. Nothing on the Today page counts until
     touches actually get logged, and they only get logged if it takes seconds:
     type three letters, tap the name, tap Call. */
  const [pool, setPool] = useState(null);      // customers to search, loaded on first use
  const [loadingPool, setLoadingPool] = useState(false);
  const [find, setFind] = useState('');
  const [who, setWho] = useState(null);        // the company picked
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(null);
  const [cold, setCold] = useState(null);      // { rows, total } never contacted

  /* Which trip, if any, is today's.
     Prefer one already under way, then the earliest that covers today. An
     open-ended trip has no end date to test against, so it is given a
     fortnight's benefit of the doubt and then judged on whether the day it
     lands on actually has stops -- which is the real question anyway. */
  const findToday = async (all) => {
    const today = todayISO();
    const candidates = all
      .filter((t) => ['draft', 'planned', 'in_progress'].includes(t.status))
      .filter((t) => {
        const from = dayOnly(t.start_date);
        const to = dayOnly(t.end_date) || addDays(from, 13);
        return from <= today && today <= to;
      })
      .sort((a, b) => (a.status === 'in_progress' ? -1 : b.status === 'in_progress' ? 1 : 0)
        || dayOnly(a.start_date).localeCompare(dayOnly(b.start_date)))
      .slice(0, 3);

    for (const c of candidates) {
      const trip = await api.trip(c.id);
      const day = dayGap(dayOnly(trip.start_date), today) + 1;
      const stops = trip.stops.filter((x) => x.day_number === day);
      if (stops.length) return { trip, day, stops };
    }
    return null;
  };

  const loadTrips = () => api.trips().then(async (all) => {
    setTrips(all.filter((x) => ['draft', 'planned', 'in_progress'].includes(x.status)).slice(0, 4));
    setTodayRoute(await findToday(all));
  });

  useEffect(() => {
    const inTerritory = { provinces: provinceParam('territory') };
    api.companyStats(inTerritory).then(setStats);
    api.companies({ ...inTerritory, due: 'true' }).then(setDue);
    api.companies({ ...inTerritory, tier: 'tier2' }).then(setLeads);
    api.companiesPage({ ...inTerritory, untouched: 'true', order: 'value' }, 6, 0).then(setCold);
    loadTrips();
  }, []);

  const refreshTouchNumbers = () => {
    const inTerritory = { provinces: provinceParam('territory') };
    api.companyStats(inTerritory).then(setStats);
    api.companies({ ...inTerritory, due: 'true' }).then(setDue);
    /* Biggest accounts first, and only the first handful: the count matters
       more than the tail, and logging one touch moves an account off this list
       and onto its visit cycle. */
    api.companiesPage({ ...inTerritory, untouched: 'true', order: 'value' }, 6, 0).then(setCold);
  };

  /* The search list is the territory, fetched once on first use rather than on
     every visit to this page. */
  const loadPool = () => {
    if (pool || loadingPool) return;
    setLoadingPool(true);
    api.companiesForMap({ provinces: provinceParam('territory') })
      .then((p) => setPool(p))
      .finally(() => setLoadingPool(false));
  };

  const matches = (() => {
    const q = find.trim().toLowerCase();
    if (!q || !pool) return [];
    return pool.filter((c) => `${c.name} ${c.city || ''} ${c.company_code || ''}`.toLowerCase().includes(q)).slice(0, 6);
  })();

  /* One tap saves it. The database trigger on interactions moves the account's
     last-contact date and its next touch date, so the tiles above are stale the
     moment this returns - hence the refresh. */
  const saveTouch = async (kind) => {
    setSaving(true);
    try {
      await api.logInteraction(who.id, { kind, summary: note.trim() || null });
      setLogged(`${kind === 'visit' ? 'Visit' : kind === 'call' ? 'Call' : 'Email'} logged for ${who.name}.`);
      setWho(null); setNote(''); setFind('');
      refreshTouchNumbers();
    } catch (e) {
      setLogged(`Couldn't log that: ${e.message}`);
    } finally { setSaving(false); }
  };

  /* From "who have I never called" straight into logging the call: the logger
     is on this same page, so picking one fills it in and scrolls up to it. */
  const logThis = (c) => {
    setWho(c); setNote(''); setLogged(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Ticking a stop off from here, rather than making him open the trip to do
     it. Same call the trip page makes. */
  const markVisited = async (stop) => {
    setBusyStop(stop.id);
    try { await api.updateStop(todayRoute.trip.id, stop.id, { visited: true }); await loadTrips(); }
    finally { setBusyStop(null); }
  };
  const by = Object.fromEntries(stats.map((s) => [s.tier, s]));
  const t1 = by.tier1?.count ?? 0, overdue = by.tier1?.due ?? 0, good = t1 - overdue;
  const nLeads = (by.tier2?.count ?? 0) + (by.tier4?.count ?? 0);
  const hot = leads.filter((l) => l.temperature === 'hot').length, warm = leads.filter((l) => l.temperature === 'warm').length;
  const inactive = by.tier3?.count ?? 0, total = stats.reduce((a, s) => a + s.count, 0) || 1;

  /* Today's visits, and the one he is driving to next: the first stop of the
     day that isn't ticked off. Breaks are shown but are never "next". */
  const dayStops = todayRoute?.stops.filter((s) => s.kind === 'customer') || [];
  const nextStop = dayStops.find((s) => !s.visited) || null;
  const doneToday = dayStops.filter((s) => s.visited).length;
  const kmToday = (todayRoute?.stops || []).reduce((a, s) => a + (s.leg_distance_m || 0), 0);
  const secToday = (todayRoute?.stops || []).reduce((a, s) => a + (s.leg_duration_s || 0), 0);
  const laterTrips = trips.filter((t) => t.id !== todayRoute?.trip.id).slice(0, 3);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>Today</h1></div>
        <Link className="btn primary" to="/trips"><IconRoute />Plan a road trip</Link>
      </div>

      {todayRoute && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h2>Today&rsquo;s route</h2>
            <Link className="link" to={`/trips/${todayRoute.trip.id}`}>Open the trip &rarr;</Link>
          </div>
          <div className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>
            Day {todayRoute.day} of {todayRoute.trip.name} &middot;{' '}
            <b className={doneToday === dayStops.length ? 'good' : ''}>{doneToday} of {dayStops.length} visited</b>
            {kmToday ? ` \u00b7 ${fmtKm(kmToday)} \u00b7 ${fmtDur(secToday)} driving` : ''}
          </div>

          {nextStop ? (
            <div className="li-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: '3px solid var(--cyan)', paddingLeft: 10 }}>
              <span className="pill cyan">{fmtTime(nextStop.planned_arrival) || 'no time'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name">Next &middot; {nextStop.company_name}</div>
                <div className="small muted">{[nextStop.address, nextStop.city].filter(Boolean).join(', ')}</div>
              </div>
              {nextStop.lat != null && (
                <a className="btn sm" href={`https://maps.apple.com/?daddr=${nextStop.lat},${nextStop.lng}`}
                   target="_blank" rel="noreferrer"><IconNav />Go</a>
              )}
              <button className="btn sm good" disabled={busyStop === nextStop.id} onClick={() => markVisited(nextStop)}>
                <IconCheck />{busyStop === nextStop.id ? 'Saving\u2026' : 'Visited'}
              </button>
            </div>
          ) : (
            <p className="good" style={{ margin: '0 0 6px' }}>
              <IconCheck /> Day done &mdash; all {dayStops.length} visited.
            </p>
          )}

          {/* The rest of the day, so he can see what is coming without leaving this page. */}
          {todayRoute.stops.filter((s) => s.id !== nextStop?.id).map((s) => s.kind === 'break' ? (
            <div key={s.id} className="li-row" style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: 0.6 }}>
              <span className="small muted" style={{ width: 62 }}>{fmtTime(s.planned_arrival)}</span>
              <div className="small muted">{s.break_label || s.break_kind?.replace('_', ' ')} &middot; {s.duration_min} min</div>
            </div>
          ) : (
            <div key={s.id} className="li-row" style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: s.visited ? 0.55 : 1 }}>
              <span className="small muted num" style={{ width: 62 }}>{s.visited ? '\u2713 ' : ''}{fmtTime(s.planned_arrival) || '\u2014'}</span>
              <Code>{s.company_code}</Code>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name" style={{ textDecoration: s.visited ? 'line-through' : 'none' }}>{s.company_name}</div>
                <div className="small muted">{s.city}</div>
              </div>
              {!s.visited && (
                <button className="btn sm ghost" disabled={busyStop === s.id} onClick={() => markVisited(s)}>
                  <IconCheck />{busyStop === s.id ? '\u2026' : 'Visited'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log a touch. Deliberately the first thing under the route: it is the
          only thing on this page that puts data IN, and everything else here is
          computed from it. */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2>Log a call or visit</h2>
          <Link className="link" to="/customers">All customers &rarr;</Link>
        </div>

        {who ? (
          <div>
            <div className="li-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Code>{who.company_code}</Code>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name">{who.name}</div>
                <div className="small muted">{who.city}</div>
              </div>
              <button className="btn sm ghost" disabled={saving} onClick={() => { setWho(null); setNote(''); }}>Change</button>
            </div>
            <input
              placeholder="What happened? (optional one-liner)"
              value={note} disabled={saving}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', margin: '10px 0' }} />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={saving} onClick={() => saveTouch('visit')}><IconCheck />Visit</button>
              <button className="btn" disabled={saving} onClick={() => saveTouch('call')}><IconPhone />Call</button>
              <button className="btn" disabled={saving} onClick={() => saveTouch('email')}>Email</button>
              <span className="small muted">{saving ? 'Saving\u2026' : 'One tap saves it and sets the next touch date.'}</span>
            </div>
          </div>
        ) : (
          <div>
            <input
              placeholder="Search a customer by name, city or code"
              value={find}
              onFocus={loadPool}
              onChange={(e) => { loadPool(); setFind(e.target.value); setLogged(null); }}
              style={{ width: '100%' }} />
            {find.trim() && (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                {loadingPool ? 'Loading your customers\u2026'
                  : matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
                  : 'Nothing matches that.'}
              </p>
            )}
            {matches.map((c) => (
              <button key={c.id} className="li-row" onClick={() => setWho(c)}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', background: 'none', border: 0,
                         borderTop: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                <Code>{c.company_code}</Code>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="name">{c.name}</div>
                  <div className="small muted">{c.city}</div>
                </div>
                <span className="muted">&rsaquo;</span>
              </button>
            ))}
          </div>
        )}

        {logged && <p className={logged.startsWith("Couldn't") ? 'small bad' : 'small good'} style={{ margin: '10px 0 0' }}>{logged}</p>}
      </div>

      <div className="stats">
        <Link to="/customers?tier=tier1" className="stat">
          <div><div className="label">Current customers</div><div className="big num">{t1}</div><div className="sub good">● {good} in good standing</div></div>
          <Ring value={t1 ? good / t1 : 0} color="var(--green)"><IconCheck /></Ring>
        </Link>
        <Link to="/customers?tier=tier1&due=true" className="stat">
          <div><div className="label">Touches overdue</div><div className="big num" style={{ color: overdue ? 'var(--red)' : 'var(--text)' }}>{overdue}</div><div className={`sub ${overdue ? 'bad' : ''}`}>{overdue ? '● Past 90 days — call or visit' : 'Nobody overdue'}</div></div>
          <Ring value={t1 ? overdue / t1 : 0} color="var(--red)"><IconClock /></Ring>
        </Link>
        <Link to="/customers?tier=tier2" className="stat">
          <div><div className="label">Leads</div><div className="big num">{nLeads}</div><div className="sub"><span className="dot" style={{ background: 'var(--orange)' }} />{hot} hot · <span className="dot" style={{ background: 'var(--amber)' }} />{warm} warm</div></div>
          <Ring value={nLeads / total} color="var(--orange)"><IconFlame /></Ring>
        </Link>
        <Link to="/customers?tier=tier3" className="stat">
          <div><div className="label">Inactive 365+</div><div className="big num">{inactive}</div><div className="sub">Worth a win-back call</div></div>
          <Ring value={inactive / total} color="var(--muted)"><IconRefresh /></Ring>
        </Link>
      </div>

      <div className="dash section">
        <div className="card">
          <div className="card-head"><h2>Touches due</h2><Link className="link" to="/customers?due=true">See all →</Link></div>
          {due.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nobody is overdue. Nice.</p> : due.slice(0, 6).map((c) => (
            <Link key={c.id} to={`/customers?open=${c.id}`} className="li-row" style={{ textDecoration: 'none' }}>
              <Code>{c.company_code}</Code>
              <div><div className="name">{c.name}</div><div className="small muted">{c.city}</div></div>
              <TouchPill next_touch_due={c.next_touch_due} last_contact_at={c.last_contact_at} />
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h2>Upcoming trips</h2><Link className="link" to="/trips">All trips →</Link></div>
          {laterTrips.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {todayRoute ? 'Nothing after today\u2019s trip.' : <>No trips planned. <Link className="link" to="/map">Pick customers on the map</Link> to build one.</>}
            </p>
          ) : laterTrips.map((t) => (
            <Link key={t.id} to={`/trips/${t.id}`} className="li-row" style={{ textDecoration: 'none' }}>
              <span className="pill cyan">{new Date(t.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
              <div><div className="name">{t.name}</div><div className="small muted">{t.stop_count} stops{t.total_distance_m ? ` · ${fmtKm(t.total_distance_m)}` : ' · not routed yet'}</div></div>
              <span className="small muted">{t.status.replace('_', ' ')}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Never contacted.
          The overdue tile can only ever count accounts that have a last-contact
          date, so an account nobody has called is not "in good standing" - it is
          unmeasured, and it never appears anywhere. This is that list. */}
      {cold && cold.total > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>No contact logged yet</h2>
            <Link className="link" to="/customers?untouched=true">See all {cold.total} &rarr;</Link>
          </div>
          <p className="small muted" style={{ margin: '-6px 0 4px' }}>
            {cold.total} account{cold.total === 1 ? '' : 's'} in your territory have no contact date, so they never
            come up as due. Biggest first. Log one touch and it joins its visit cycle.
          </p>
          {cold.rows.map((c) => (
            <div key={c.id} className="li-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Code>{c.company_code}</Code>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name">{c.name}</div>
                <div className="small muted">
                  {c.city}
                  {c.annual_value ? ` \u00b7 $${Number(c.annual_value).toLocaleString('en-CA')}/yr` : ''}
                  {c.last_purchase_at ? ` \u00b7 last bought ${fmtDate(c.last_purchase_at)}` : ''}
                </div>
              </div>
              <button className="btn sm" onClick={() => logThis(c)}><IconPhone />Log a touch</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
