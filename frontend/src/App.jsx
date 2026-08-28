import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api, auth } from './services/api.js';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import MapView from './pages/MapView.jsx';
import Trips from './pages/Trips.jsx';
import TripBuilder from './pages/TripBuilder.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!auth.token()) return setUser(null);
    api.me().then(setUser).catch(() => setUser(null));
  }, []);
  useEffect(() => {
    const onUnauth = () => { setUser(null); navigate('/login'); };
    window.addEventListener('srcrm:unauthorized', onUnauth);
    return () => window.removeEventListener('srcrm:unauthorized', onUnauth);
  }, [navigate]);

  if (user === undefined) return null;
  if (!user) return <Routes><Route path="*" element={<Login onLogin={setUser} />} /></Routes>;

  const signOut = () => { auth.clear(); setUser(null); };
  return (
    <Layout user={user} onSignOut={signOut} onUserChange={setUser}>
      <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripBuilder user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
