{
const { TOOLS, byId, esc, points, PRICE_MID } = window.POLL;
const TOKEN_KEY = 'srcrm_token';
const tok = { get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
  set: (t) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} } };
const card = document.getElementById('card');
let rows = [], msg = '';
const fmt = (iso) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function signIn() {
  card.innerHTML = `<h2>Sign in to see the votes</h2><p class="hint">Use your GoMichi email and password.</p>
  <form id="f"><label class="f" for="em">Email<input type="email" id="em" autocomplete="username" required></label>
  <label class="f" for="pw">Password<input type="password" id="pw" autocomplete="current-password" required></label>
  ${msg ? `<div class="err" role="alert">${esc(msg)}</div>` : ''}<div class="nav"><button class="btn" type="submit" id="sb">Sign in</button></div></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); const b = document.getElementById('sb'); b.disabled = true; b.textContent = 'Signing in…';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Sign-in failed');
      tok.set(d.token); msg = ''; load();
    } catch (err) { msg = err.message; signIn(); }
  };
}

async function load() {
  if (!tok.get()) return signIn();
  card.innerHTML = '<p class="hint">Loading votes…</p>';
  try {
    const r = await fetch('/api/survey/poll/responses', { headers: { Authorization: `Bearer ${tok.get()}` } });
    if (r.status === 401) { tok.clear(); msg = 'Please sign in again.'; return signIn(); }
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load the votes');
    rows = d; show();
  } catch (e) { card.innerHTML = `<div class="err" role="alert">${esc(e.message)}</div><div class="nav"><button class="btn" id="rt">Try again</button></div>`; document.getElementById('rt').onclick = load; }
}

const count = (rs, id) => { const c = Array(byId[id].o.length).fill(0); rs.forEach(r => { const v = r[id]; if (v != null && c[v] != null) c[v]++; }); return c; };
function bars(labels, counts, n, keepOrder) {
  const order = labels.map((_, k) => k); if (!keepOrder) order.sort((x, y) => counts[y] - counts[x]);
  return `<div class="bars">${order.map(k => `<div class="bar"><span>${esc(labels[k])}</span><em>${counts[k]} of ${n}</em><i><s style="width:${n ? counts[k] / n * 100 : 0}%"></s></i></div>`).join('')}</div>`;
}

function report(rs) {
  const n = rs.length, pts = points(rs), max = Math.max(1, ...pts);
  const first = Array(TOOLS.length).fill(0), top3 = Array(TOOLS.length).fill(0);
  rs.forEach(r => (r.rank || []).forEach((k, i) => { if (i === 0) first[k]++; if (i < 3) top3[k]++; }));
  const order = TOOLS.map((_, k) => k).sort((x, y) => pts[y] - pts[x]);
  const price = count(rs, 'price'), priced = rs.filter(r => r.price != null);
  const avg = priced.length ? Math.round(priced.reduce((s, r) => s + PRICE_MID[r.price], 0) / priced.length) : 0;
  const paying = price[2] + price[3] + price[4];
  const quotes = rs.filter(r => r.pain).map(r => `<li>${esc(r.pain)}</li>`).join('');
  return `<div class="verdict v-go"><h2>#1: ${esc(TOOLS[order[0]])}</h2><p>The most valued tool across ${n} ${n === 1 ? 'vote' : 'votes'}. ${first[order[0]]} put it first, and ${top3[order[0]]} had it in their top 3.</p></div>
  <div class="figs"><div class="fig2"><b>${n}</b><span>votes</span></div><div class="fig2"><b>about $${avg}</b><span>average value a month</span></div><div class="fig2"><b>${paying}</b><span>would pay $20 or more</span></div><div class="fig2"><b>${price[0]}</b><span>want it free</span></div></div>
  <h3>How they ranked the tools</h3><p class="small">A #1 pick earns 7 points, #2 earns 6, down to 1.</p>
  <div class="bars">${order.map((k, i) => `<div class="bar"><span>${i + 1}. ${esc(TOOLS[k])}</span><em>${pts[k]} pts · ${top3[k]} top-3</em><i><s style="width:${pts[k] / max * 100}%"></s></i></div>`).join('')}</div>
  <h3>What it's worth to them each month</h3>${bars(byId.price.o, price, n, true)}
  <h3>Would their company pay?</h3>${bars(byId.co.o, count(rs, 'co'), n)}
  <h3>Paid for a sales tool with their own money</h3>${bars(byId.spent.o, count(rs, 'spent'), n, true)}
  <h3>Kind of selling</h3>${bars(byId.role.o, count(rs, 'role'), n)}
  <h3>Hours a week on admin</h3>${bars(byId.admin.o, count(rs, 'admin'), n, true)}
  <h3>How they plan routes</h3>${bars(byId.route.o, count(rs, 'route'), n)}
  <h3>How often follow-ups slip</h3>${bars(byId.slip.o, count(rs, 'slip'), n, true)}
  <h3>Where they keep their notes</h3>${bars(byId.notes.o, count(rs, 'notes'), n)}
  ${quotes ? `<h3>Their biggest headaches</h3><ul class="quotes">${quotes}</ul>` : ''}
  <p class="small" style="margin-top:20px">The monthly average is rough: it uses the middle of each price band ($0, $10, $35, $75, $125).</p>`;
}

function show() {
  const a = rows.map(r => r.answers);
  card.innerHTML = `<div class="nav" style="margin-top:0"><button class="btn" id="rf">Refresh</button><button class="btn ghost" id="so">Sign out</button></div>
  ${rows.length ? report(a) : '<p class="body">No votes yet. Share the poll link, then come back and press Refresh.</p>'}
  ${rows.length ? `<h3>Every vote</h3><p class="small">Newest first. Remove a test vote here.</p>
  <div class="rows">${rows.map(r => `<div class="row"><span>Vote · ${fmt(r.created_at)}</span><button class="del" data-id="${r.id}">Remove</button></div>`).join('')}</div>` : ''}`;
  document.getElementById('rf').onclick = load;
  document.getElementById('so').onclick = () => { tok.clear(); msg = ''; signIn(); };
  card.querySelectorAll('.del').forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return; }
    b.disabled = true;
    const r = await fetch(`/api/survey/responses/${b.dataset.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.get()}` } });
    if (r.ok || r.status === 204) { rows = rows.filter(x => String(x.id) !== b.dataset.id); show(); } else b.textContent = 'Could not remove';
  });
}
load();
}
