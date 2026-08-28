import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtKm } from '../services/api.js';
import { Code, Ring, TouchPill } from '../components/Badges.jsx';
import { IconCheck, IconClock, IconFlame, IconRefresh, IconRoute } from '../components/Icons.jsx';

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [due, setDue] = useState([]);
  const [leads, setLeads] = useState([]);
  const [trips, setTrips] = useState([]);
  useEffect(() => {
    api.companyStats().then(setStats);
    api.companies({ due: 'true' }).then(setDue);
    api.companies({ tier: 'tier2' }).then(setLeads);
    api.trips().then((t) => setTrips(t.filter((x) => ['draft', 'planned', 'in_progress'].includes(x.status)).slice(0, 3)));
  }, []);
  const by = Object.fromEntries(stats.map((s) => [s.tier, s]));
  const t1 = by.tier1?.count ?? 0, overdue = by.tier1?.due ?? 0, good = t1 - overdue;
  const nLeads = (by.tier2?.count ?? 0) + (by.tier4?.count ?? 0);
  const hot = leads.filter((l) => l.temperature === 'hot').length, warm = leads.filter((l) => l.temperature === 'warm').length;
  const inactive = by.tier3?.count ?? 0, total = stats.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>Today</h1></div>
        <Link className="btn primary" to="/trips"><IconRoute />Plan a road trip</Link>
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
          {trips.length === 0 ? <p className="muted" style={{ margin: 0 }}>No trips planned. <Link className="link" to="/map">Pick customers on the map</Link> to build one.</p> : trips.map((t) => (
            <Link key={t.id} to={`/trips/${t.id}`} className="li-row" style={{ textDecoration: 'none' }}>
              <span className="pill cyan">{new Date(t.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
              <div><div className="name">{t.name}</div><div className="small muted">{t.stop_count} stops{t.total_distance_m ? ` · ${fmtKm(t.total_distance_m)}` : ' · not routed yet'}</div></div>
              <span className="small muted">{t.status.replace('_', ' ')}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
