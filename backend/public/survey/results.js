{
const { report, esc } = window.SURVEY;
const TOKEN_KEY = 'srcrm_token';   // the same key GoMichi itself uses
const tok = { get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
  set: (t) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} } };
const card = document.getElementById('card');
let rows = [], msg = '';

const fmt = (iso) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function signIn() {
  card.innerHTML = `<h2>Sign in to see the answers</h2>
  <p class="hint">Use your GoMichi email and password.</p>
  <form id="f">
    <label class="f" for="em">Email<input type="email" id="em" autocomplete="username" required></label>
    <label class="f" for="pw">Password<input type="password" id="pw" autocomplete="current-password" required></label>
    ${msg ? `<div class="err" role="alert">${esc(msg)}</div>` : ''}
    <div class="nav"><button class="btn" type="submit" id="sb">Sign in</button></div>
  </form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const b = document.getElementById('sb'); b.disabled = true; b.textContent = 'Signing in…';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Sign-in failed');
      tok.set(d.token); msg = ''; load();
    } catch (err) { msg = err.message; signIn(); }
  };
}

async function load() {
  if (!tok.get()) return signIn();
  card.innerHTML = '<p class="hint">Loading answers…</p>';
  try {
    const r = await fetch('/api/survey/responses', { headers: { Authorization: `Bearer ${tok.get()}` } });
    if (r.status === 401) { tok.clear(); msg = 'Please sign in again.'; return signIn(); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not load the answers');
    rows = d; show();
  } catch (e) { card.innerHTML = `<div class="err" role="alert">${esc(e.message)}</div><div class="nav"><button class="btn" id="rt">Try again</button></div>`; document.getElementById('rt').onclick = load; }
}

function show() {
  const answers = rows.map(r => r.answers);
  card.innerHTML = `<div class="nav" style="margin-top:0"><button class="btn" id="rf">Refresh</button><button class="btn ghost" id="so">Sign out</button></div>
  ${rows.length ? report(answers) : '<p class="body">No answers yet. Send people the survey link, then come back and press Refresh.</p>'}
  ${rows.length ? `<h3>Every reply</h3><p class="small">Newest first. Remove a test reply or a duplicate here.</p>
  <div class="rows">${rows.map(r => `<div class="row"><span>${esc(r.answers.name || 'No name given')} · ${fmt(r.created_at)}</span><button class="del" data-id="${r.id}">Remove</button></div>`).join('')}</div>` : ''}`;
  document.getElementById('rf').onclick = load;
  document.getElementById('so').onclick = () => { tok.clear(); msg = ''; signIn(); };
  card.querySelectorAll('.del').forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return; }
    b.disabled = true;
    const r = await fetch(`/api/survey/responses/${b.dataset.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.get()}` } });
    if (r.ok || r.status === 204) { rows = rows.filter(x => String(x.id) !== b.dataset.id); show(); } else { b.textContent = 'Could not remove'; }
  });
}
load();
}
