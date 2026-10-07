import { createContext } from "react";
export const AdminSession = createContext(null);

const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 4v2" /></>,
  ballot: <><path d="M4 12h4m8 0h4M5 12l-2 8h18l-2-8M9 4l5-1 3 7-5 2-3-8Z" /><path d="m11 6 2 2 2-3M8 16h8" /></>,
  candidate: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 3h6v3H9zM8 17c1-3 7-3 8 0" /><circle cx="12" cy="11" r="2" /></>,
  key: <><circle cx="8" cy="9" r="4" /><path d="m11 12 8 8m-4-4 2-2m0 4 2-2" /></>,
  chain: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="17" r="2" /><path d="m11 7-5 8m7-8 5 8M7 17h10" /></>,
  ledger: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6m-6 4h6m-6 4h3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  person: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  logout: <><path d="M9 4H4v16h5m5-8H8m8-4 4 4-4 4m4-4h-6" /></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9m-10 12v-7h6v7" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3Zm5 4h4" /></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
  turnout: <><path d="M12 3v9h9A9 9 0 1 1 9 3.5M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: <><path d="M14 3h7v7m0-7L11 13M10 5H3v16h16v-7" /></>,
  trend: <path d="m3 17 6-6 4 4 8-10m-6 0h6v6" />,
  tie: <path d="M5 9h14M5 15h14" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
};
export function Icon({ name, size = 20, className = "" }) {
  return <svg className={`admin-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.dashboard}</svg>;
}
export function AdminBrand() {
  return <div className="admin-brand"><span className="admin-brand-logos">
    <img src="/branding/deped-seal.png" alt="Department of Education seal" width="44" height="44" />
    <img src="/branding/agusan-national-high-school.png" alt="Agusan National High School logo" width="44" height="44" />
  </span><div className="admin-brand-text"><div className="admin-brand-name">ANHS Vote <span>SSLG</span></div><small>Agusan National High School</small></div>
  </div>;
}
export const electionStatus = (stats, results) => results?.published
  ? ["pending", "open", "closed"][results.status] || "pending"
  : stats?.status === "published" ? "pending" : stats?.status || "pending";
export const statusLabel = (status) => ({ pending: "Pending", open: "Open", closed: "Closed" }[status] || "Pending");
