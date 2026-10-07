import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, logout } from "../api";
import { AdminBrand, AdminSession, Icon, electionStatus, statusLabel } from "../admin";
const links = [["/admin", "Dashboard", "dashboard"], ["/admin/students", "Students", "people"], ["/admin/candidates", "Candidates", "candidate"],
  ["/admin/tokens", "Tokens", "key"], ["/admin/blockchain", "Blockchain", "chain"], ["/admin/ledger", "Ledger", "ledger"]];
export default function AdminShell() {
  const admin = useContext(AdminSession);
  const nav = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [notices, setNotices] = useState(false);
  const mounted = useRef(false);
  const inflight = useRef(null);
  const refresh = useCallback(() => {
    if (inflight.current) return inflight.current;
    setBusy(true);
    const request = Promise.allSettled([api("/admin/stats"), api("/admin/results"), api("/admin/election/settings")])
      .then((updates) => {
        if (!mounted.current) return;
        [setStats, setResults, setMetadata].forEach((setter, i) => { if (updates[i].status === "fulfilled") setter(updates[i].value); });
        setError(updates.find((update) => update.status === "rejected")?.reason.message || "");
        if (updates[0].status === "fulfilled" && updates[1].status === "fulfilled") setLastUpdated(new Date());
      }).finally(() => { inflight.current = null; if (mounted.current) setBusy(false); });
    inflight.current = request;
    return request;
  }, []);
  useEffect(() => {
    mounted.current = true; refresh();
    const timer = setInterval(refresh, 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { setMenu(false); setNotices(false); }, [location.pathname]);
  const status = electionStatus(stats, results);
  const mismatch = stats && results?.published && results.tokensRegistered !== stats.tokens;
  const time = lastUpdated?.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function signOut() { logout(); nav("/admin/login", { replace: true }); }
  return <div className="admin-shell">
    {menu && <button className="admin-mobile-overlay" aria-label="Close menu" onClick={() => setMenu(false)} />}
    <aside className={`admin-sidebar ${menu ? "is-open" : ""}`}>
      <Link className="admin-brand-link" to="/admin"><AdminBrand /></Link>
      <span className="admin-nav-section">Civic core</span>
      <nav className="admin-nav" aria-label="Admin navigation">{links.map(([to, label, icon]) =>
        <NavLink key={to} to={to} end={to === "/admin"} className={({ isActive }) =>
          `admin-nav-link ${isActive || to === "/admin" && location.pathname === "/admin/dashboard" ? "active" : ""}`}>
          <Icon name={icon} /><span>{label}</span>
        </NavLink>)}</nav>
      <div className="admin-account-card">
        <div className="admin-account-info"><span className="admin-avatar"><Icon name="person" size={18} /></span>
          <div><strong>Election Admin</strong><small title={admin.email}>{admin.email}</small></div>
        </div>
        <button className="admin-signout" onClick={signOut}><Icon name="logout" size={18} />Logout</button>
      </div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar">
        <div className="admin-topbar-left"><button className="admin-icon-button admin-menu-button" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="menu" /></button>
          <div className="admin-breadcrumb"><Link to="/admin"><Icon name="home" size={17} /><span>Portal</span></Link><Icon name="chevron" size={13} /><strong title="Agusan National High School">Agusan National High School</strong></div>
          <span className={`admin-pill ${status === "open" ? "success" : "neutral"}`}><span className="admin-status-dot" />{status === "open" ? "Live Election Active" : `Election ${statusLabel(status)}`}</span>
        </div>
        <div className="admin-topbar-right">
          <span className={`admin-sync-pill ${error ? "warning" : ""}`}><Icon name="refresh" size={15} className={busy ? "is-spinning" : ""} />{error ? "Unable to update" : busy ? "Updating…" : `Updated ${time || "—"}`}</span>
          <form className="admin-search" role="search" onSubmit={(e) => { e.preventDefault(); if (search.trim()) nav(`/admin/students?search=${encodeURIComponent(search.trim())}`); }}>
            <Icon name="search" size={17} /><input aria-label="Search students" placeholder="Search by name or LRN…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="admin-notice-wrap"><button className="admin-icon-button" aria-label="Election notifications" aria-expanded={notices} onClick={() => setNotices(!notices)}><Icon name="bell" />{(mismatch || error) && <span className="admin-notice-dot" />}</button>
            {notices && <div className="admin-notice-panel"><strong>Election updates</strong>
              <p>Status: {statusLabel(status)}</p>
              {error ? <p>{error}</p> : mismatch ? <p>{results.tokensRegistered} of {stats?.tokens} tokens are registered on the blockchain.</p> : <p>No new warnings in the current data.</p>}
              <Link to="/admin/blockchain">View blockchain setup <Icon name="arrow" size={15} /></Link>
            </div>}
          </div>
          <span className="admin-avatar admin-top-avatar" title={admin.email}><Icon name="person" size={18} /></span>
        </div>
      </header>
      <main className="admin-main"><Outlet context={{ stats, results, metadata, error, busy, lastUpdated, refresh }} /></main>
    </div>
  </div>;
}
