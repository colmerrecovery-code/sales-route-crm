/* Shared by the poll and its results page: the questions and the scoring. */
window.POLL = (() => {
  const TOOLS = [
    'Route planning that builds my day for me',
    'Reminders and follow-up emails written for me',
    'Fast quotes with product pictures',
    'Personal video messages to customers',
    'Customer needs-assessment sheets',
    'A pitch and objection-handling coach',
    'My own private contact book',
  ];
  const Q = [
    { id: 'rank', rank: 1, t: 'In a perfect world, which tools would help you most on the road?', h: 'Tap them in order, most helpful first. Rank at least 3. Tap again to undo.' },
    { id: 'role', t: 'What kind of selling do you do most?', o: ['Outside / field sales', 'Inside sales (phone, email)', 'Account manager with a set list of customers', 'A mix of these'] },
    { id: 'book', t: 'How many active customers do you look after?', o: ['Fewer than 50', '50 to 150', '150 to 300', 'More than 300'] },
    { id: 'admin', t: 'In a normal week, how many hours go to admin?', h: 'Quotes, notes, emails, planning your route.', o: ['Under 3 hours', '3 to 6 hours', '6 to 10 hours', 'More than 10 hours'] },
    { id: 'route', t: 'How do you plan which customers to visit, and in what order?', o: ['I wing it each morning', 'I map it myself in Google Maps', 'A company tool does it', 'An app I pay for', "I don't visit in person"] },
    { id: 'slip', t: 'Be honest: how often does a follow-up slip through the cracks?', o: ['Rarely', 'About once a month', 'About once a week', 'Most days'] },
    { id: 'notes', t: 'Where do you keep your own customer notes and contacts?', o: ["Only in the company's CRM", 'My own spreadsheet or phone contacts', 'Paper notebook or business cards', 'A personal app I chose', 'All over the place'] },
    { id: 'spent', t: 'In the last year, have you paid for a sales tool with your own money?', o: ['Yes', 'No'] },
    { id: 'price', t: 'If one app did your top 3 tools really well, what would it be worth to you each month?', o: ['Nothing, it would have to be free', 'Under $20', '$20 to $49', '$50 to $99', '$100 or more'] },
    { id: 'co', t: 'Would your company pay for a tool like that?', o: ['Likely yes', 'Maybe', 'No', "I don't know"] },
    { id: 'pain', text: 1, t: "Last one: what's the biggest headache in your selling week?", h: 'Optional. A sentence is plenty.' },
  ];
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* A #1 pick earns 7 points, #2 earns 6, and so on down to 1. */
  const points = (rows) => { const p = Array(TOOLS.length).fill(0); rows.forEach(r => (r.rank || []).forEach((k, i) => { if (p[k] != null) p[k] += TOOLS.length - i; })); return p; };
  /* Rough monthly value from each price band's midpoint. */
  const PRICE_MID = [0, 10, 35, 75, 125];
  return { TOOLS, Q, byId, esc, points, PRICE_MID };
})();
