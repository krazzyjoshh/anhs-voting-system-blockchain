import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../admin";
import { PageHeading, SummaryCards, PanelHeading, EmptyState } from "../components/PageUI";
export default function Ledger() {
  const [ledger, setLedger] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api("/admin/ledger").then(setLedger);
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function verify() {
    setBusy(true); setError(""); setReport(null);
    try { setReport(await api("/admin/ledger/verify", { method: "POST" })); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="admin-content ledger-page">
    <PageHeading title="On-chain Ledger" subtitle="Check receipts and transaction evidence for the current election." icon="ledger"><button disabled={busy} onClick={verify}><Icon name="shield" size={16} />{busy ? "Checking…" : "Verify"}</button></PageHeading>
    <div className="page-info-banner warning"><Icon name="shield" size={22} /><span>The current voting design is not anonymous. Anyone with access to sensitive records may link the token owner to the transaction and selected candidate.</span></div>
    {error && <p className="msg err" role="alert">{error}</p>}
    <SummaryCards items={[
      {label:"Election", value:ledger ? `#${ledger.electionId}` : null, detail:ledger?.status || "Loading status", icon:"ballot"},
      {label:"Registered tokens", value:ledger?.tokensRegistered, detail:"Registered on the blockchain", icon:"key"},
      {label:"Recorded receipts", value:ledger?.receipts.length, detail:"Current election", icon:"ledger"},
    ]} />
    {ledger && <section className="card"><PanelHeading title="Election record" description="Vote counts from the blockchain." icon="chain" />
      {ledger.address && <a className="page-address-link" href={`https://explorer.solana.com/address/${ledger.address}?cluster=devnet`} target="_blank" rel="noreferrer"><Icon name="external" size={16} />{ledger.address}</a>}
      {!!ledger.legacyReceipts && <p className="page-helper">{ledger.legacyReceipts} legacy receipts have no election ID.</p>}
      <div className="page-tally-grid">{ledger.positions.map((p) => <div key={p.index}><span>{p.name}</span><strong>{p.totalVotes} <small>votes</small></strong></div>)}</div>
    </section>}
    {report && <section className="card" aria-live="polite"><PanelHeading title="Verification report" description={report.note} icon="shield" />
      <div className="page-table-scroll"><table><thead><tr><th>Status</th><th>Explanation</th></tr></thead><tbody>{report.checks.map((check) => <tr key={check.id}><td><span className={`check-status ${check.status.toLowerCase()}`}>{check.status}</span></td><td>{check.explanation}</td></tr>)}</tbody></table></div>
    </section>}
    <section className="card page-table-panel"><PanelHeading title="Receipts" description="Receipts and related transaction signatures." icon="ledger" />
      <div className="page-table-scroll"><table><thead><tr><th>Receipt code</th><th>Transactions</th><th>Recorded (UTC)</th></tr></thead><tbody>{ledger?.receipts.map((r) => <tr key={r.receipt_code}><td className="mono">{r.receipt_code}</td><td>{r.transactions.length ? r.transactions.map((t, i) => <p key={t.signature}><a href={t.explorer} target="_blank" rel="noreferrer">Transaction {i + 1} <Icon name="external" size={13} /></a></p>) : r.kind === "abstain" ? "All-abstain; N/A" : "Missing evidence"}</td><td>{r.created_at}</td></tr>)}</tbody></table></div>
      {ledger && !ledger.receipts.length && <EmptyState title="No receipts yet" description="Completed submissions will appear here." icon="ledger" />}
    </section>
  </div>;
}
