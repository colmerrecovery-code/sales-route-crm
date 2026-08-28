import { TIERS, daysAgo } from '../services/api.js';
import { IconX } from './Icons.jsx';

export const Code = ({ children }) => <span className="code">{children}</span>;
export const Tier = ({ tier }) => tier ? <span className={`tier ${tier}`} title={TIERS[tier]?.hint}>{TIERS[tier]?.label}</span> : null;
export const Temp = ({ t }) => t ? <span className={`temp ${t}`}>{t}</span> : null;

/** Status pill: red = overdue, amber = due soon, green = recently touched. */
export function TouchPill({ next_touch_due, last_contact_at }) {
  if (!next_touch_due) return null;
  const due = new Date(next_touch_due), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return <span className="pill red">{daysAgo(last_contact_at)} days</span>;
  if (days <= 7) return <span className="pill amber">Due {days === 0 ? 'today' : `in ${days}d`}</span>;
  return <span className="pill green">On track</span>;
}

export function Field({ label, error, children }) {
  return <div className="field"><label>{label}</label>{children}{error && <span className="err">{error[0]}</span>}</div>;
}

export function Drawer({ title, sub, onClose, children }) {
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <div>{sub && <div className="eyebrow">{sub}</div>}<h1 style={{ fontSize: 22 }}>{title}</h1></div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        {children}
      </aside>
    </>
  );
}

/** Ring gauge for stat cards. value 0..1 */
export function Ring({ value = 0, color = 'var(--cyan)', children }) {
  const C = 2 * Math.PI * 22;
  return (
    <div className="ring" style={{ '--c': color }}>
      <svg viewBox="0 0 58 58"><circle className="track" cx="29" cy="29" r="22" /><circle className="val" cx="29" cy="29" r="22" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, value)))} /></svg>
      <div className="icon">{children}</div>
    </div>
  );
}
