import { useState } from 'react';
import { api, auth } from '../services/api.js';
import { Field } from '../components/Badges.jsx';
import { Logo } from '../components/Icons.jsx';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = mode === 'login' ? await api.login(form.email, form.password) : await api.register(form);
      auth.set(res.token);
      onLogin(await api.me());
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <Logo />
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="muted" style={{ marginTop: 0 }}>Customers, routes, and follow-ups in one place.</p>
        {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="list">
          {mode === 'register' && <Field label="Your name"><input required value={form.full_name} onChange={set('full_name')} /></Field>}
          <Field label="Email"><input type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
          <Field label="Password"><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} value={form.password} onChange={set('password')} /></Field>
          <button className="btn primary block" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a href="#" className="link" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </a>
        </p>
      </form>
    </div>
  );
}
