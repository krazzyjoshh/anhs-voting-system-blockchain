import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Icon, electionStatus, statusLabel } from "../admin";
const percent = (n, total) => total ? Math.round(n / total * 100) : 0;
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
const csvCell = (value) => `"${String(value ?? "").replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
export default function Dashboard() {
  const { stats: s, results: r, metadata, error, busy, lastUpdated, refresh } = useOutletContext();
  const [electionFilter, setElectionFilter] = useState("current");
  const [positionFilter, setPositionFilter] = useState("all");
  const selected = electionFilter === "current" ? r?.published ? r : null
    : r?.archivedElections?.find((e) => String(e.electionId) === electionFilter);
  const positions = selected?.positions?.filter((p) => positionFilter === "all" || String(p.index) === positionFilter) || [];
  const title = metadata?.title || r?.title || "Current election";
  const status = electionStatus(s, r);
  const metrics = [
    ["Active students", s?.activeStudents, "people", "Registered voters", s ? `${percent(s.activeStudents, s.students)}% active` : "—"],
    ["Voted", s?.voted, "check", "Voted in the system", s ? `${s.voted}/${s.activeStudents}` : "—"],
    ["Turnout", s ? `${s.turnout}%` : null, "turnout", "Share of active students", "Participation"],
    ["Positions", s?.positions, "ledger", "Positions on the ballot", "Ballot"],
    ["Candidates", s?.candidates, "candidate", "Current candidates", "Election"],
    ["Tokens", s?.tokens, "key", "Issued voting tokens", r?.published && s ? `${percent(r.tokensRegistered, s.tokens)}% registered` : "Registration"],
    ["Used tokens", s?.usedTokens, "shield", "Used to vote", s ? `${percent(s.usedTokens, s.tokens)}% used` : "—"],
  ];
  function download() {
    const rows = [["Election", "Position", "Candidate", "Votes", "Percentage"]];
    for (const p of positions) {
      const total = p.candidates.reduce((sum, c) => sum + c.votes, 0);
      for (const c of p.candidates) rows.push([selected.title || title, p.name, c.name, c.votes, `${percent(c.votes, total)}%`]);
    }
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "election-results.csv";
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="admin-dashboard">
    <div className="admin-page-heading">
      <div><div className="admin-heading-badges"><span className="admin-pill">Official Console</span><span className="admin-pill success">Blockchain data</span></div>
        <h1>Dashboard</h1><p>Election overview • <strong>{title}</strong>{metadata?.schoolYear ? ` · ${metadata.schoolYear}` : ""}</p></div>
      <div className="admin-heading-actions"><button className="admin-button secondary" onClick={refresh} disabled={busy}><Icon name="refresh" size={16} className={busy ? "is-spinning" : ""} />Refresh data</button>
        <button className="admin-button primary" onClick={download} disabled={!positions.length}><Icon name="download" size={16} />Export report</button></div>
    </div>
    {error && <div className="admin-error" role="alert">{error} {lastUpdated && "Showing the most recently retrieved data."}</div>}
    <div className="admin-metrics" aria-label="Election summary">{metrics.map(([label, value, icon, detail, badge], index) => <article className={`admin-metric metric-${index}`} key={label}>
      <div className="admin-metric-top"><Icon name={icon} size={22} /><span>{badge}</span></div>
      <strong className="admin-metric-value">{value ?? "—"}</strong><h2>{label}</h2><p>{detail}</p>
    </article>)}</div>
    <div className="admin-election-strip">
      <div><div className="admin-status-line"><span>Election status: <b className={`admin-pill ${status === "open" ? "success" : "neutral"}`}>{statusLabel(status)}</b></span>
        <span className="admin-strip-divider">•</span><span>Blockchain: <b className="admin-pill">{r ? r.published ? "Published" : "Not yet published" : "Checking…"}</b></span></div>
        <p>Tokens registered on the blockchain: <b className="admin-number-chip">{r?.published ? r.tokensRegistered : "—"}</b></p></div>
      <div className="admin-chain-summary">{r?.electionAddress && <a href={`https://explorer.solana.com/address/${r.electionAddress}?cluster=devnet`} target="_blank" rel="noreferrer"><Icon name="chain" size={14} />{r.electionAddress.slice(0, 7)}…{r.electionAddress.slice(-7)}<Icon name="external" size={12} /></a>}
        <span><i className={`admin-status-dot ${error ? "is-warning" : ""}`} />{error ? "Update error" : busy ? "Updating…" : "Automatic updates every 5 seconds"}</span>
        <small>Last updated: <strong>{lastUpdated?.toLocaleTimeString("en-PH") || "Waiting…"}</strong></small></div>
    </div>
    <section className="admin-report" aria-labelledby="admin-results-title">
      <div className="admin-report-heading"><div><div className="admin-report-eyebrow">ADMIN REPORT <span>• Blockchain results</span></div><h2 id="admin-results-title">Results from the blockchain</h2></div>
        <div className="admin-report-filters"><label><span id="admin-election-label">Election</span><select aria-labelledby="admin-election-label" value={electionFilter} onChange={(e) => { setElectionFilter(e.target.value); setPositionFilter("all"); }}>
          <option value="current">{title} (current)</option>{r?.archivedElections?.map((e) => <option key={e.electionId} value={e.electionId}>{e.title}{e.schoolYear ? ` · ${e.schoolYear}` : ""} (archive)</option>)}</select></label>
          <label><span id="admin-position-label">Position</span><select aria-labelledby="admin-position-label" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}><option value="all">All positions</option>{selected?.positions?.map((p) => <option key={p.index} value={p.index}>{p.name}</option>)}</select></label></div></div>
      {electionFilter !== "current" && selected && <p className="admin-archive-note">Archive: {selected.title} · Election #{selected.electionId} · Closed</p>}
      {!positions.length && <div className="admin-empty"><Icon name="ballot" size={36} /><h3>{busy && !r ? "Loading results…" : "No results to display yet"}</h3><p>{r?.published ? "Check the election and position filters." : "Publish the election on the Blockchain page first."}</p></div>}
      {positions.map((p) => {
        const total = p.candidates.reduce((sum, c) => sum + c.votes, 0);
        const maximum = Math.max(0, ...p.candidates.map((c) => c.votes));
        const tie = maximum > 0 && p.candidates.filter((c) => c.votes === maximum).length > 1;
        return <article className="admin-position-result" key={p.index}>
          <div className="admin-position-heading"><div><h3>{p.name}</h3><span className="admin-number-chip">{total} votes</span><span className="admin-number-chip subtle">1 Position</span></div>
            {maximum > 0 && <span className="admin-result-status"><Icon name={tie ? "tie" : "check"} size={15} />{tie ? "Tied votes" : "Leading candidate"}</span>}</div>
          {p.candidates.map((c, i) => { const pct = percent(c.votes, total), leader = maximum > 0 && c.votes === maximum;
            return <div className={`admin-candidate-result ${leader ? "is-leading" : ""}`} key={`${p.index}-${i}`}>
              <div className="admin-candidate-line"><div className="admin-candidate-name"><span className="admin-candidate-avatar">{initials(c.name)}</span><strong>{c.name}</strong><span className={`admin-candidate-badge ${leader && !tie ? "leading" : ""}`}>{leader ? tie ? `Tied (${pct}%)` : "Leading" : "Candidate"}</span></div>
                <span className="admin-vote-count"><b>{c.votes}</b><small>votes ({pct}%)</small></span></div>
              <div className="admin-result-bar" role="progressbar" aria-label={`${c.name}: ${c.votes} votes`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
            </div>; })}
        </article>;
      })}
    </section>
    <footer className="admin-ledger-footer"><span className="admin-footer-icon"><Icon name="lock" size={23} /></span><div><strong>Transactions recorded on Solana</strong><p>Check receipts and transaction signatures in the election ledger.</p></div><Link className="admin-button secondary" to="/admin/ledger">Verify in Ledger <Icon name="arrow" size={16} /></Link></footer>
  </div>;
}
