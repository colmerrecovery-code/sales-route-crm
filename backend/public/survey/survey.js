{
const { Q, esc } = window.SURVEY;
const ADMIN_H = [1.5, 4.5, 8, 12];
const KEY = 'gomichi_survey_v1';
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let S = { i: -1, a: {}, id: newId(), sent: false };
try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.a && x.id) S = x; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const card = document.getElementById('card'), route = document.getElementById('route');
const ttl = document.getElementById('ttl'), sub = document.getElementById('sub'), foot = document.getElementById('foot');
let sending = false, error = '';

function drawRoute() {
  route.innerHTML = Q.map((q, k) => `<span class="stop${k <= S.i ? ' on' : ''}"></span>`).join('');
  route.style.display = S.i >= 0 && S.i < Q.length ? 'flex' : 'none';
}

function intro() {
  ttl.textContent = 'Would you use this app?'; sub.textContent = '13 quick questions · about 3 minutes';
  const resume = Object.keys(S.a).length > 0;
  card.innerHTML = `<h2>I need your honest opinion</h2>
  <p class="body">I've spent 30 years in sales. Now I'm building GoMichi, an app just for salespeople: route planning, follow-ups, quotes, customer assessments and an AI assistant, all in one place.</p>
  <p class="body">Before I build more, I want to know if it's worth it. If it's a bad idea, please say so. That helps me just as much.</p>
  <div class="nav"><button class="btn" id="go">${resume ? 'Pick up where I left off' : 'Start the survey'}</button></div>
  <p class="hint">Tap your answers, then press Submit at the end. Your answers come straight to me.</p>`;
  document.getElementById('go').onclick = () => { S.i = S.i >= 0 && S.i < Q.length ? S.i : 0; render(true); };
  foot.textContent = 'Troy Colmer · GoMichi';
}

function question() {
  const q = Q[S.i], v = S.a[q.id], last = S.i === Q.length - 1;
  ttl.textContent = 'Would you use this app?'; sub.textContent = `Question ${S.i + 1} of ${Q.length}`;
  let body;
  if (q.text) {
    body = q.short
      ? `<input type="text" id="tx" maxlength="80" autocomplete="name" value="${esc(v || '')}" aria-label="${esc(q.t)}">`
      : `<textarea id="tx" maxlength="500" aria-label="${esc(q.t)}">${esc(v || '')}</textarea>`;
  } else {
    const sel = k => q.multi ? (v || []).includes(k) : v === k;
    body = `<div class="opts${q.multi ? ' multi' : ''}">${q.o.map((o, k) => `<button class="opt" data-k="${k}" aria-pressed="${sel(k)}"><span class="box"></span><span>${esc(o)}</span></button>`).join('')}</div>`;
  }
  const canNext = q.text || (q.multi ? (v || []).length > 0 : v !== undefined);
  const nextLabel = last ? (sending ? 'Sending…' : 'Submit my answers') : (q.text && !v ? 'Skip' : 'Next');
  card.innerHTML = `<p class="qn">Question ${S.i + 1} of ${Q.length}</p><h2 id="qh" tabindex="-1">${esc(q.t)}</h2>${q.h ? `<p class="hint">${esc(q.h)}</p>` : ''}${body}
  ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
  <div class="nav"><button class="btn ghost" id="back">Back</button><button class="btn${last ? ' submit' : ''}" id="next" ${canNext && !sending ? '' : 'disabled'}>${nextLabel}</button></div>`;
  card.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = +b.dataset.k;
    if (q.multi) {
      let arr = (S.a[q.id] || []).slice();
      if (arr.includes(k)) arr = arr.filter(x => x !== k); else { if (arr.length >= q.multi) arr.shift(); arr.push(k); }
      S.a[q.id] = arr; save(); question();
    } else { S.a[q.id] = k; save(); question(); setTimeout(() => { S.i++; render(true); }, 180); }
  });
  const tx = document.getElementById('tx');
  if (tx) tx.oninput = () => { S.a[q.id] = tx.value; save(); if (!last) document.getElementById('next').textContent = tx.value ? 'Next' : 'Skip'; };
  document.getElementById('back').onclick = () => { error = ''; S.i--; render(true); };
  document.getElementById('next').onclick = () => { if (last) submit(); else { S.i++; render(true); } };
  foot.textContent = '';
}

async function submit() {
  sending = true; error = ''; question();
  const answers = {};
  for (const q of Q) {
    const v = S.a[q.id];
    if (q.text) { if (v && v.trim()) answers[q.id] = v.trim(); }
    else if (q.multi) { if (v && v.length) answers[q.id] = v; }
    else if (v !== undefined) answers[q.id] = v;
  }
  try {
    const res = await fetch('/api/survey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: S.id, answers }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Something went wrong.'); }
    S.sent = true; S.i = Q.length; sending = false; save(); render(true);
  } catch (e) {
    sending = false;
    error = `Your answers didn't send. Check your connection and press Submit again. Nothing is lost. (${e.message})`;
    question();
  }
}

function result() {
  const a = S.a, hrs = ADMIN_H[a.admin ?? 0], yr = Math.round(hrs * 46), days = Math.round(yr / 8);
  ttl.textContent = 'Thank you!'; sub.textContent = 'Your answers are on their way to Troy';
  const slip = ['rarely', 'about once a month', 'about once a week', 'most days'][a.slip ?? 0];
  const picks = (a.feat || []).map(k => Q[6].o[k]);
  card.innerHTML = `<div class="sent" role="status"><span class="tick" aria-hidden="true">✓</span><span>Sent. Thanks for helping me build this right.</span></div>
  <div class="res"><p class="qn">Your selling week, in one number</p>
  <div class="big">${yr} hours a year</div>
  <p>That's about <b>${days} working days</b> a year on admin instead of selling, at roughly ${hrs} hours a week over 46 working weeks.</p>
  <p>You said a follow-up slips through the cracks <b>${slip}</b>.${(a.slip ?? 0) >= 2 ? ' Each one can be a lost order or a customer who feels forgotten.' : ''}</p>
  ${picks.length ? `<p>The tools you'd use most:</p><ul>${picks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="nav"><button class="btn ghost" id="edit">Change an answer</button></div>`;
  document.getElementById('edit').onclick = () => { S.i = 0; render(true); };
  foot.textContent = 'If you change an answer, press Submit again and I get the updated version.';
}

function render(scroll) {
  drawRoute();
  if (S.i < 0) intro(); else if (S.i >= Q.length) result(); else question();
  save();
  if (scroll) { window.scrollTo({ top: 0 }); const h = document.getElementById('qh'); if (h) h.focus({ preventScroll: true }); }
}
render(false);
}
