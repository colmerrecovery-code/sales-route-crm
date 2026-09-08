import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../services/api.js';
import { IconHome, IconPeople, IconMap, IconRoute, Lockup } from './Icons.jsx';

const links = [
  ['/', 'Today', IconHome], ['/customers', 'Customers', IconPeople], ['/map', 'Map', IconMap], ['/trips', 'Road trips', IconRoute],
];

export default function Layout({ user, onSignOut, onUserChange, children }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(user.home_address || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  /* Every trip is measured from here. With no home base the router quietly
     falls back to whichever customer happens to be first, so distances and
     times come out measured from the wrong place with nothing to say so —
     which is why this is editable right where it is displayed, rather than
     being something only a script could set. */
  async function save(e) {
    e.preventDefault();
    const home_address = text.trim();
    if (!home_address) return setErr('Type your address first.');
    setBusy(true); setErr(null);
    try {
      const updated = await api.setHome({ home_address });
      onUserChange?.(updated);
      setEditing(false);
    } catch (e2) {
      setErr(e2.message || 'Could not find that address. Try adding the city and province.');
    } finally { setBusy(false); }
  }

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><Lockup /></div>
        {links.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon />{label}</NavLink>
        ))}
        <div className="spacer" />
        <div className="who">
          <div className="avatar">{(user.full_name || '?')[0].toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <b>{user.full_name}</b>
            {editing ? (
              <form onSubmit={save} style={{ margin: '4px 0' }}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
                  placeholder="182 Royal Valley Dr, Caledon ON"
                  style={{ width: '100%', fontSize: 12, padding: '4px 6px' }} />
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <button type="submit" className="btn sm primary" disabled={busy}>{busy ? 'Looking up…' : 'Save'}</button>
                  <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setErr(null); setText(user.home_address || ''); }}>Cancel</button>
                </div>
                {err && <div className="small" style={{ color: 'var(--red)', marginTop: 4 }}>{err}</div>}
              </form>
            ) : (
              <>
                {user.home_address
                  ? <span title={user.home_address}>Starts from {user.home_address}</span>
                  : <span style={{ color: 'var(--amber)' }}>No home base set</span>}
                {' '}
                <button onClick={() => { setText(user.home_address || ''); setEditing(true); }}>
                  {user.home_address ? 'Change' : 'Set it'}
                </button>
              </>
            )}
            <br /><button onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
