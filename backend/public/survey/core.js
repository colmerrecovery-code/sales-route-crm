/* Shared by the survey and its results page: the questions, how one person's
   answers are scored, and the Go / Tweak / No-go report. */
window.SURVEY = (() => {
  const Q = [
    { id: 'role', t: 'What kind of selling do you do most?', o: ['Outside / field sales', 'Inside sales (phone, email)', 'Account manager with a set list of customers', 'A mix of these'] },
    { id: 'book', t: 'How many active customers do you personally look after?', o: ['Fewer than 50', '50 to 150', '150 to 300', 'More than 300'] },
    { id: 'admin', t: 'In a normal week, how many hours go to admin?', h: 'Quotes, entering notes, emails, planning your route.', o: ['Under 3 hours', '3 to 6 hours', '6 to 10 hours', 'More than 10 hours'] },
    { id: 'notes', t: 'Where do you keep your own customer notes and contacts today?', o: ["Only in the company's CRM", 'My own spreadsheet or phone contacts', 'Paper notebook or business cards', 'A personal app I chose', 'All over the place'] },
    { id: 'route', t: 'How do you plan which customers to visit, and in what order?', o: ['I wing it each morning', 'I map it myself in Google Maps', 'A company tool does it', 'An app I pay for', "I don't visit in person"] },
    { id: 'slip', t: 'How often does a follow-up slip through the cracks?', o: ['Rarely', 'About once a month', 'About once a week', 'Most days'] },
    { id: 'feat', multi: 3, t: 'Pick the 3 tools you would use most.', h: 'Tap up to 3.', o: ['Route planning that builds my day', 'AI reminders and follow-up emails written for me', 'Fast quotes with product pictures', 'Personal video messages to customers', 'Customer needs-assessment sheets', 'Pitch and objection coach', 'A private contact book that is mine'] },
    { id: 'spent', t: 'In the last year, have you paid for a sales tool with your own money?', o: ['Yes', 'No'] },
    { id: 'price', t: 'If one app did your 3 picks really well, what would you pay each month yourself?', o: ['Nothing, it would have to be free', 'Under $20', '$20 to $49', '$50 to $99', '$100 or more'] },
    { id: 'co', t: 'Would your company pay for it instead?', o: ['Likely yes', 'Maybe', 'No', "I don't know"] },
    { id: 'beta', t: 'Would you try an early version free for 30 days and tell me honestly what you think?', o: ['Yes, count me in', 'Maybe', 'No thanks'] },
    { id: 'pain', text: 1, t: "What's the biggest headache in your selling week?", h: 'Optional. A sentence is plenty.' },
    { id: 'name', text: 1, short: 1, t: 'Your name', h: 'Optional, so I know who to thank.' },
  ];
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Strong yes: would pay $20+ a month, will test it, and has real pain
     (admin hours + missed follow-ups + routes planned by hand). */
  function score(a) {
    const pain = (a.admin ?? 0) + (a.slip ?? 0) + ((a.route === 0 || a.route === 1) ? 1 : 0);
    const pay = a.price ?? 0, beta = a.beta === 0 ? 2 : a.beta === 1 ? 1 : 0;
    const strong = pay >= 2 && beta === 2 && pain >= 3;
    const warm = !strong && ((pay >= 1 && beta >= 1) || pain >= 4);
    return { tier: strong ? 'strong' : warm ? 'warm' : 'cold' };
  }

  function bars(labels, counts, n) {
    const order = labels.map((_, k) => k).sort((x, y) => counts[y] - counts[x]);
    return `<div class="bars">${order.map(k => `<div class="bar"><span>${esc(labels[k])}</span><em>${counts[k]} of ${n}</em><i><s style="width:${n ? counts[k] / n * 100 : 0}%"></s></i></div>`).join('')}</div>`;
  }

  function report(rs) {
    const n = rs.length, sc = rs.map(score);
    const st = sc.filter(s => s.tier === 'strong').length, wm = sc.filter(s => s.tier === 'warm').length, cd = n - st - wm;
    const ps = n ? st / n : 0, pw = n ? (st + wm) / n : 0;
    const cnt = (id) => { const c = Array(byId[id].o.length).fill(0); rs.forEach(r => { const v = r[id]; if (Array.isArray(v)) v.forEach(k => c[k] != null && c[k]++); else if (v != null && c[v] != null) c[v]++; }); return c; };
    const feat = cnt('feat'), price = cnt('price'), co = cnt('co'), beta = cnt('beta');
    let v, cls, why;
    if (n < 5) { v = 'Wait'; cls = 'v-wait'; why = `${n} ${n === 1 ? 'reply' : 'replies'} so far. Aim for 10 or more before you decide.`; }
    else if (ps >= 0.4) { v = 'Go'; cls = 'v-go'; why = `${st} of ${n} would pay $20 or more a month, will test it, and feel the pain. That's a real signal.`; }
    else if (pw >= 0.5 && ps >= 0.15) { v = 'Tweak it'; cls = 'v-tweak'; why = `Interest is there (${st + wm} of ${n} are strong or warm), but not enough people would pay and test it yet.`; }
    else { v = 'No-go for now'; cls = 'v-no'; why = `Only ${st} of ${n} would pay and test it. Rethink the offer before building more.`; }
    const tips = [];
    if (n >= 5) {
      const topF = feat.indexOf(Math.max(...feat));
      tips.push(`Lead with “${byId.feat.o[topF]}”. It's the most-picked tool (${feat[topF]} of ${n}).`);
      if (price[0] + price[1] > n / 2) tips.push('Most would pay under $20 or nothing. Think about a free starter version with a paid upgrade.');
      if (co[0] >= n / 3) tips.push(`${co[0]} of ${n} think their company would pay. A team plan sold to sales managers may be worth testing.`);
      if (beta[0] > 0) tips.push(`${beta[0]} said yes to a 30-day test. Contact them first.`);
    }
    const quotes = rs.filter(r => r.pain).map(r => `<li>${esc(r.pain)}<small>${esc(r.name || 'No name given')}</small></li>`).join('');
    const testers = rs.filter(r => r.beta === 0).map(r => esc(r.name || 'No name given')).join(', ');
    return `<div class="verdict ${cls}"><h2>${v}</h2><p>${why}</p></div>
    <div class="figs"><div class="fig2"><b>${n}</b><span>replies</span></div><div class="fig2"><b>${st}</b><span>strong yes</span></div><div class="fig2"><b>${wm}</b><span>warm</span></div><div class="fig2"><b>${cd}</b><span>not a fit</span></div></div>
    ${tips.length ? `<h3>What to do next</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${n ? `<h3>Tools they'd use most</h3>${bars(byId.feat.o, feat, n)}
    <h3>What they'd pay each month</h3>${bars(byId.price.o, price, n)}
    <h3>Would their company pay?</h3>${bars(byId.co.o, co, n)}` : ''}
    ${testers ? `<h3>Said yes to a 30-day test</h3><p>${testers}</p>` : ''}
    ${quotes ? `<h3>Their biggest headaches</h3><ul class="quotes">${quotes}</ul>` : ''}
    <p class="small" style="margin-top:20px">How it's scored: “strong yes” means they'd pay $20 or more a month, said yes to testing, and report real pain (admin hours, missed follow-ups, routes they plan by hand). Go needs 40% strong. Tweak needs half strong or warm with at least 15% strong.</p>`;
  }

  return { Q, byId, esc, score, report };
})();
