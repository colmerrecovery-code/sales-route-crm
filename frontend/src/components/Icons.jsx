const I = ({ children, ...p }) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>{children}</svg>;
export const IconHome = (p) => <I {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></I>;
export const IconPeople = (p) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3" /></I>;
export const IconMap = (p) => <I {...p}><path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z" /><path d="M9 4v14M15 6v14" /></I>;
export const IconRoute = (p) => <I {...p}><path d="M4 19c0-8 16-4 16-13" /><circle cx="4" cy="19" r="2" /><circle cx="20" cy="6" r="2" /></I>;
export const IconCheck = (p) => <I {...p}><path d="M20 6L9 17l-5-5" /></I>;
export const IconClock = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const IconFlame = (p) => <I {...p}><path d="M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 1-7 2-10z" /></I>;
export const IconRefresh = (p) => <I {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></I>;
export const IconPhone = (p) => <I {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></I>;
export const IconNav = (p) => <I {...p}><path d="M3 11l18-8-8 18-2-8z" /></I>;
export const IconPlus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const IconX = (p) => <I {...p}><path d="M6 6l12 12M18 6L6 18" /></I>;
export const Logo = () => (
  <div className="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#06121F" strokeWidth="2.4" strokeLinecap="round"><path d="M5 19c0-7 14-4 14-13" /><circle cx="5" cy="19" r="2" fill="#06121F" /><circle cx="19" cy="6" r="2" fill="#06121F" /></svg></div>
);
