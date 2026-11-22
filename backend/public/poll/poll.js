{
const { TOOLS, Q, esc } = window.POLL;
const KEY = 'road_poll_v1';
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let S = { i: -1, a: { rank: [] }, id: newId(), sent: false };
try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.a && x.id) S = x; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const card = document.getElementById('card'), route = document.getElementById('route');
const sub = document.getElementById('sub'), foot = document.getElementById('foot');
let sending = false, error = '';

function drawRoute() {
  route.innerHTML = Q.map((q, k) => `<span class="stop${k <= S.i ? ' on' : ''}"></span>`).join('');
  route.style.display = S.i >= 0 && S.i < Q.length ? 'flex' : 'none';
}

function intro() {
  sub.textContent = '11 quick taps · about 2 minutes · completely anonymous';
  card.innerHTML = `<h2>What would make life on the road easier?</h2>
  <p class="body">If you visit clients and spend your days in the car, this one's for you. Rank the tools that would help you sell more and stress less, then see how other salespeople voted.</p>
  <p class="body">No name, no email, no phone number. Just your honest opinion.</p>
  <div class="nav"><button class="btn" id="go">${S.i >= 0 && S.i < Q.length ? 'Pick up where I left off' : 'Start the poll'}</button></div>`;
  document.getElementById('go').onclick = () => { S.i = S.i >= 0 && S.i < Q.length ? S.i : 0; render(true); };
  foot.textContent = 'Anonymous. Nothing that identifies you is collected.';
}

function rankQ(q, last) {
  const r = S.a.rank || [];
  card.innerHTML = `<p class="qn">Question ${S.i + 1} of ${Q.length}</p><h2 id="qh" tabindex="-1">${esc(q.t)}</h2><p class="hint">${esc(q.h)}</p>
  <div class="rank">${TOOLS.map((t, k) => { const pos = r.indexOf(k); return `<button class="rk${pos >= 0 ? ' on' : ''}" data-k="${k}" aria-pressed="${pos >= 0}" aria-label="${esc(t)}${pos >= 0 ? `, ranked ${pos + 1}` : ''}"><span class="num">${pos >= 0 ? pos + 1 : ''}</span><span>${esc(t)}</span></button>`; }).join('')}</div>
  <div class="tools"><span class="small">${r.length < 3 ? `Pick ${3 - r.length} more` : `${r.length} ranked`}</span>${r.length ? '<button class="link" id="clr">Start over</button>' : ''}</div>
  <div class="nav"><button class="btn" id="next" ${r.length >= 3 ? '' : 'disabled'}>Next</button></div>`;
  card.querySelectorAll('.rk').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; let arr = (S.a.rank || []).slice();
    arr = arr.includes(k) ? arr.filter(x => x !== k) : arr.concat(k);
    S.a.rank = arr; save(); rankQ(q, last);
  });
  const clr = document.getElementById('clr'); if (clr) clr.onclick = () => { S.a.rank = []; save(); rankQ(q, last); };
  document.getElementById('next').onclick = () => { S.i++; render(true); };
}

function question() {
  const q = Q[S.i], v = S.a[q.id], last = S.i === Q.length - 1;
  sub.textContent = `Question ${S.i + 1} of ${Q.length}`;
  foot.textContent = '';
  if (q.rank) return rankQ(q, last);
  const body = q.text
    ? `<textarea id="tx" maxlength="500" aria-label="${esc(q.t)}">${esc(v || '')}</textarea>`
    : `<div class="opts">${q.o.map((o, k) => `<button class="opt" data-k="${k}" aria-pressed="${v === k}"><span class="box"></span><span>${esc(o)}</span></button>`).join('')}</div>`;
  const canNext = q.text || v !== undefined;
  const label = last ? (sending ? 'Sending…' : 'Submit my answers') : 'Next';
  card.innerHTML = `<p class="qn">Question ${S.i + 1} of ${Q.length}</p><h2 id="qh" tabindex="-1">${esc(q.t)}</h2>${q.h ? `<p class="hint">${esc(q.h)}</p>` : ''}${body}
  ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
  <div class="nav"><button class="btn ghost" id="back">Back</button><button class="btn${last ? ' submit' : ''}" id="next" ${canNext && !sending ? '' : 'disabled'}>${label}</button></div>`;
  card.querySelectorAll('.opt').forEach(b => b.onclick = () => { S.a[q.id] = +b.dataset.k; save(); question(); setTimeout(() => { S.i++; render(true); }, 180); });
  const tx = document.getElementById('tx'); if (tx) tx.oninput = () => { S.a[q.id] = tx.value; save(); };
  document.getElementById('back').onclick = () => { error = ''; S.i--; render(true); };
  document.getElementById('next').onclick = () => { if (last) submit(); else { S.i++; render(true); } };
}

async function submit() {
  sending = true; error = ''; question();
  const answers = { rank: S.a.rank };
  for (const q of Q) { if (q.rank) continue; const v = S.a[q.id];
    if (q.text) { if (v && v.trim()) answers[q.id] = v.trim(); } else if (v !== undefined) answers[q.id] = v; }
  try {
    const res = await fetch('/api/survey/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: S.id, answers }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Something went wrong.'); }
    S.sent = true; S.i = Q.length; sending = false; save(); render(true);
  } catch (e) {
    sending = false; error = `Your answers didn't send. Check your connection and press Submit again. Nothing is lost. (${e.message})`; question();
  }
}

async function result() {
  sub.textContent = 'Thanks for voting!';
  const mine = (S.a.rank || []).slice(0, 3).map(k => TOOLS[k]);
  card.innerHTML = `<div class="sent" role="status"><span class="tick" aria-hidden="true">✓</span><span>Your vote is in. Thank you!</span></div>
  <p class="qn">Your top 3</p><ol>${mine.map(m => `<li>${esc(m)}</li>`).join('')}</ol>
  <div class="crowd" id="crowd"><p class="hint">Loading how everyone else voted…</p></div>
  <div class="nav"><button class="btn ghost" id="edit">Change my answers</button></div>`;
  document.getElementById('edit').onclick = () => { S.i = 0; render(true); };
  foot.textContent = 'Know other salespeople on the road? Pass the poll along.';
  const crowd = document.getElementById('crowd');
  try {
    const d = await (await fetch('/api/survey/poll/summary')).json();
    const max = Math.max(1, ...d.points), order = TOOLS.map((_, k) => k).sort((x, y) => d.points[y] - d.points[x]);
    crowd.innerHTML = `<h3 style="margin-top:0">How ${d.n} ${d.n === 1 ? 'salesperson' : 'salespeople'} ranked them so far</h3>
    <div class="bars">${order.map((k, i) => `<div class="bar"><span>${i + 1}. ${esc(TOOLS[k])}</span><em></em><i><s style="width:${d.points[k] / max * 100}%"></s></i></div>`).join('')}</div>`;
  } catch (e) { crowd.innerHTML = ''; }
}

function render(scroll) {
  drawRoute();
  if (S.i < 0) intro(); else if (S.i >= Q.length) result(); else question();
  save();
  if (scroll) { window.scrollTo({ top: 0 }); const h = document.getElementById('qh'); if (h) h.focus({ preventScroll: true }); }
}
render(false);
}
