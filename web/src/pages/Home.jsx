import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../public";
import { Icon } from "../admin";
import PublicHeader from "../components/PublicHeader";
import { PageHeading, SummaryCards, PanelHeading, EmptyState, NameAvatar } from "../components/PageUI";
const LABELS = { pending: "Pending", open: "Open", closed: "Closed" };
const addr = (address) => `https://explorer.solana.com/address/${address}?cluster=devnet`;
export default function Home() {
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [position, setPosition] = useState("all");
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      setBusy(true);
      const updates = await Promise.allSettled([publicApi("/status"), publicApi("/results"), publicApi("/election")]);
      if (stopped) return;
      const setters = [setStatus, setResults, setMetadata];
      updates.forEach((update, i) => { if (update.status === "fulfilled") setters[i](update.value); });
      setError(updates.find((update) => update.status === "rejected")?.reason.message || "");
      if (updates.every((update) => update.status === "fulfilled")) setUpdated(new Date());
      setBusy(false);
    };
    refresh(); const timer = setInterval(refresh, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [refreshVersion]);
  const positions = results?.positions?.filter((p) => position === "all" || String(p.index) === position) || [];
  return <div className="public-dashboard-shell public-live-board"><main className="public-page admin-content">
    <PublicHeader />
    <div className="public-dashboard-content"><PageHeading title={status?.title || "ANHS School Election"} subtitle={`Agusan National High School • ${metadata?.schoolYear || "Official election updates"}`} icon="globe" badge="Public Election Page"><button className="admin-button secondary" disabled={busy} onClick={() => setRefreshVersion((v) => v + 1)}><Icon name="refresh" size={16} className={busy ? "is-spinning" : ""} />Refresh data</button></PageHeading>
    {error && <p className="public-alert" role="alert">{error}</p>}
    <SummaryCards items={[
      {label:"Registered tokens", value:status?.tokensRegistered, detail:"Tokens on the blockchain", icon:"key"},
      {label:"Completed submissions", value:status?.votesCast, detail:"Includes all-abstain", icon:"check"},
      {label:"Turnout", value:status ? `${status.turnoutPercent}%` : null, detail:"Share of registered tokens", icon:"turnout"},
    ]} />
    <div className="admin-election-strip"><div className="admin-status-line"><span>Election status:</span><span className={`status-pill ${status?.status || "pending"}`}>{status ? LABELS[status.status] : "Loading status…"}</span><span>Blockchain: <b className="admin-pill">{status ? status.published ? "Published" : "Not yet published" : "Checking…"}</b></span></div><div className="admin-chain-summary"><span><i className={`admin-status-dot ${error ? "is-warning" : ""}`} />{error ? "Unable to update data" : "Automatic updates every 5 seconds"}</span><small>Last updated: {updated?.toLocaleTimeString("en-PH") || "Waiting…"}</small></div></div>
    <div className="public-board-body"><section className="admin-report public-results"><div className="admin-report-heading"><div><div className="admin-report-eyebrow">PUBLIC REPORT <span>• Blockchain results</span></div><h2>{status?.status === "closed" ? "Results" : "Live results"}</h2></div><div className="admin-report-filters"><label><span id="public-position-label">Position</span><select aria-labelledby="public-position-label" value={position} onChange={(e) => setPosition(e.target.value)}><option value="all">All positions</option>{results?.positions?.map((p) => <option key={p.index} value={p.index}>{p.name}</option>)}</select></label></div></div>
      {!status?.published && <EmptyState title="The election has not been published yet." description="The ballot and results will appear here when the election is ready." icon="ballot" />}
      {status?.published && results && !results.resultsVisible && <div className="page-info-banner"><Icon name="lock" size={20} /><span>Vote counts will be shown once the election is closed.</span></div>}
      <div className="public-board-result-grid">{positions.map((p) => {
        const total = p.candidates.reduce((n,c) => n+(c.votes ?? 0),0);
        const maximum = results.resultsVisible ? Math.max(0, ...p.candidates.map(c => c.votes ?? 0)) : 0;
        const tied = maximum > 0 && p.candidates.filter(c => c.votes === maximum).length > 1;
        return <article className="admin-position-result" key={p.index}>
          <div className="admin-position-heading"><div><span className="public-position-icon"><Icon name="ballot" size={18} /></span><h3>{p.name}</h3></div><span className="admin-number-chip">{results.resultsVisible ? `${total} votes` : `${p.candidates.length} candidates`}</span></div>
          {p.candidates.map((c,i) => {
            const pct = total ? Math.round((c.votes ?? 0)/total*100) : 0;
            const leading = maximum > 0 && c.votes === maximum;
            return <div className={`admin-candidate-result ${leading ? "is-leading" : ""}`} key={i}>
              <div className="admin-candidate-line"><div className="admin-candidate-name"><NameAvatar name={c.name} /><div className="public-candidate-details"><strong>{c.name}</strong><span className={`admin-candidate-badge ${leading && !tied ? "leading" : ""}`}>{leading ? tied ? "Tied votes" : "Leading" : "Candidate"}</span></div></div>
                {results.resultsVisible && <span className="admin-vote-count"><b>{c.votes}</b><small>votes ({pct}%)</small></span>}</div>
              {results.resultsVisible && <div className="admin-result-bar" role="progressbar" aria-label={`${c.name}: ${c.votes} votes`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{width:`${pct}%`}} /></div>}
            </div>;
          })}
        </article>;
      })}</div>
      {status?.published && !positions.length && <EmptyState title={busy ? "Loading results…" : "No results to display yet"} description="Results for the current election will appear here." icon="ballot" />}
    </section>
    <aside className="public-board-aside" aria-label="Election information"><article className="card"><PanelHeading title="Participation overview" description="Completed submissions for the current election." icon="turnout" /><div className="page-participation"><strong>{status?.turnoutPercent ?? "—"}<small>%</small></strong><p><b>{status?.votesCast ?? "—"}</b> completed submissions / <b>{status?.tokensRegistered ?? "—"}</b> registered tokens</p></div><progress aria-label="Turnout" max={100} value={Math.min(100, status?.turnoutPercent ?? 0)} /><p className="page-helper">Includes all-abstain submissions.</p></article>
      <article className="card announcement"><PanelHeading title="COMELEC announcements" description="Election announcements and schedule." icon="bell" /><p>{metadata?.announcement || "No new announcements yet."}</p>{metadata?.periodStart && <p className="page-schedule">Start: <strong>{new Date(metadata.periodStart).toLocaleString("en-PH")}</strong></p>}{metadata?.periodEnd && <p className="page-schedule">End: <strong>{new Date(metadata.periodEnd).toLocaleString("en-PH")}</strong></p>}</article></aside>
    </div>
    <div className="admin-ledger-footer"><span className="admin-footer-icon"><Icon name="chain" size={22} /></span><div><strong>Public blockchain records</strong><p>View the election and program on Solana Explorer.</p></div><div className="public-explorer-links">{results?.electionAddress && <a className="admin-button secondary" href={addr(results.electionAddress)} target="_blank" rel="noreferrer">Election on Explorer <Icon name="external" size={14} /></a>}{results?.programId && <a className="admin-button secondary" href={addr(results.programId)} target="_blank" rel="noreferrer">Program on Explorer <Icon name="external" size={14} /></a>}</div></div>
    <footer className="public-footer"><span>Agusan National High School • ANHS Vote</span><Link to="/verify">Verify receipt</Link></footer>
    </div>
  </main></div>;
}
