import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, TIERS, fmtDate, daysAgo } from '../services/api.js';
import { Code, Tier } from '../components/Badges.jsx';

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [due, setDue] = useState([]);
  const [trips, setTrips] = useState([]);
  useEffect(() => {
    api.companyStats().then(setStats);
    api.companies({ due: 'true' }).then(setDue);
    api.trips().then((t) => setTrips(t.filter((x) => ['planned', 'in_progress'].includes(x.status)).slice(0, 3)));
  }, []);
  const byTier = Object.fromEntries(stats.map((s) => [s.tier, s]));

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>Today</h1></div>
        <Link className="btn primary" to="/trips">Plan a road trip</Link>
      </div>

      <div className="stats">
        {Object.entries(TIERS).map(([k, t]) => (
          <Link to={`/customers?tier=${k}`} key={k} className={`stat ${k}`} style={{ textDecoration: 'none' }}>
            <div className="eyebrow">{t.short} · {t.label}</div>
            <div className="big num">{byTier[k]?.count ?? 0}</div>
            <div className="small muted">{k === 'tier1' && byTier[k]?.due ? <span className="due">{byTier[k].due} due for a touch</span> : t.hint}</div>
          </Link>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <div className="card">
          <h3>Quarterly touches due</h3>
          {due.length === 0 ? <p className="muted">Nobody is overdue. Nice.</p> : (
            <table><tbody>
              {due.map((c) => (
                <tr key={c.id}>
                  <td><Code>{c.company_code}</Code></td>
                  <td><Link to={`/customers?open=${c.id}`}>{c.name}</Link><div className="small muted">{c.city}</div></td>
                  <td className="num due">{daysAgo(c.last_contact_at)} days</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <h3>Upcoming trips</h3>
          {trips.length === 0 ? <p className="muted">No trips planned. <Link to="/trips">Build one</Link> from your customers on the map.</p> : (
            <table><tbody>
              {trips.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/trips/${t.id}`}>{t.name}</Link><div className="small muted">{fmtDate(t.start_date)}{t.end_date ? ` – ${fmtDate(t.end_date)}` : ' · open-ended'}</div></td>
                  <td className="num">{t.stop_count} stops</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
