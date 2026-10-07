import { Icon } from "../admin";
export function PageHeading({ title, subtitle, icon = "dashboard", badge = "Official Console", children }) {
  return <header className="admin-page-heading"><div><div className="admin-heading-badges"><span className="admin-pill"><Icon name={icon} size={12} />{badge}</span><span className="admin-pill success">ANHS • SSLG</span></div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="admin-heading-actions">{children}</div>}</header>;
}
export function SummaryCards({ items }) {
  return <div className="page-summary">{items.map(({ label, value, detail, icon = "dashboard" }) => <article className="admin-metric" key={label}><div className="admin-metric-top"><Icon name={icon} size={22} /><span>Election overview</span></div><strong className="admin-metric-value">{value ?? "—"}</strong><h2>{label}</h2><p>{detail}</p></article>)}</div>;
}
export function PanelHeading({ title, description, icon = "ledger", children }) {
  return <div className="page-panel-heading"><div className="page-panel-title"><span className="page-panel-icon"><Icon name={icon} size={19} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{children}</div>;
}
export function EmptyState({ title, description, icon = "ledger" }) {
  return <div className="admin-empty"><Icon name={icon} size={32} /><h3>{title}</h3>{description && <p>{description}</p>}</div>;
}
export function NameAvatar({ name }) {
  return <span className="page-name-avatar" aria-hidden="true">{name?.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "—"}</span>;
}
