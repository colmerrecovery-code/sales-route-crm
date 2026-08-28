import { NavLink } from 'react-router-dom';
import { IconHome, IconPeople, IconMap, IconRoute, Logo } from './Icons.jsx';

const links = [
  ['/', 'Today', IconHome], ['/customers', 'Customers', IconPeople], ['/map', 'Map', IconMap], ['/trips', 'Road trips', IconRoute],
];

export default function Layout({ user, onSignOut, children }) {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><Logo />Sales Route</div>
        {links.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon />{label}</NavLink>
        ))}
        <div className="spacer" />
        <div className="who">
          <div className="avatar">{(user.full_name || '?')[0].toUpperCase()}</div>
          <div><b>{user.full_name}</b>{user.home_address ? `Starts from ${user.home_address}` : 'No home base set'}<br /><button onClick={onSignOut}>Sign out</button></div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
