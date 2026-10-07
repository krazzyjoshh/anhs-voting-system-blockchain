import { useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../public";
import { Icon } from "../admin";
import PublicHeader from "../components/PublicHeader";
import { PageHeading, PanelHeading } from "../components/PageUI";
export default function Verify() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify(event) {
    event.preventDefault(); setBusy(true); setResult(null); setError("");
    try { setResult(await publicApi(`/receipt/${encodeURIComponent(code.trim())}`)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="public-dashboard-shell"><main className="public-page admin-content"><PublicHeader /><div className="public-dashboard-content receipt-verify-page"><PageHeading title="Verify receipt" subtitle="Look up your receipt and related transactions." icon="shield" badge="Public Receipt Verification"><Link className="admin-button secondary" to="/">← Public page</Link></PageHeading>
    <form className="card grid receipt-verify-form" onSubmit={verify}><PanelHeading title="Receipt lookup" description="Enter the 12-character code from your voting receipt." icon="ledger" />
      <label htmlFor="receipt-code">Receipt code</label>
      <input id="receipt-code" className="mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" required />
      <button disabled={busy || code.trim().length !== 12}><Icon name="shield" size={16} />{busy ? "Checking…" : "Verify"}</button>
    </form>
    {error && <p className="msg err" role="alert">{error}</p>}
    {result && <section className="card" aria-live="polite"><h2>{result.valid ? "Valid receipt code" : "Receipt code not found"}</h2>
      {result.valid && <><p>Recorded: {result.createdAt} UTC</p>
        {result.explorers.map((url, i) => <p key={url}><a href={url} target="_blank" rel="noreferrer">Transaction {i + 1} on Explorer</a></p>)}
        {!result.explorers.length && <p>{result.kind === "abstain" ? "All-abstain submission; no on-chain transaction." : "This older receipt has no saved transaction evidence."}</p>}
        <p className="muted">This confirms that the receipt exists in the system. Blockchain confirmation requires a separate check.</p>
        {!!result.explorers.length && <p className="muted">Selected candidates may be visible in the transaction details. Share your receipt carefully.</p>}
      </>}
    </section>}
  </div></main></div>;
}
