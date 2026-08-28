import { TIERS } from '../services/api.js';

export const Code = ({ children }) => <span className="code">{children}</span>;
export const Tier = ({ tier }) => tier ? <span className={`tier ${tier}`} title={TIERS[tier]?.hint}>{TIERS[tier]?.short} {TIERS[tier]?.label}</span> : null;
export const Temp = ({ t }) => t ? <span className={`temp ${t}`}>{t}</span> : null;

export function Field({ label, error, children }) {
  return <div className="field"><label>{label}</label>{children}{error && <span className="err">{error[0]}</span>}</div>;
}

export function Drawer({ title, sub, onClose, children }) {
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <div>{sub && <div className="eyebrow">{sub}</div>}<h2>{title}</h2></div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </aside>
    </>
  );
}
