import { NavLink } from 'react-router-dom';

const links = [
  ['/', 'Today'], ['/customers', 'Customers'], ['/map', 'Map'], ['/trips', 'Road trips'],
];

export default function Layout({ user, onSignOut, children }) {
  return (
    <div className="shell">
      <nav className="rail">
        <div className="brand">Sales <span>Route</span></div>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
        ))}
        <div className="spacer" />
        <div className="who">
          <b>{user.full_name}</b>
          {user.home_address ? `Starts from ${user.home_address}` : 'No home base set'}
          <br /><button onClick={onSignOut}>Sign out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
