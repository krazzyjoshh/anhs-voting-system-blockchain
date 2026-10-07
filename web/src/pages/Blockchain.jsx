import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";
import { Icon } from "../admin";
import { PageHeading, SummaryCards, PanelHeading } from "../components/PageUI";

const NAMES = ["Pending", "Open", "Closed"];
const addr = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const short = (s) => (s ? s.slice(0, 6) + "…" + s.slice(-6) : "");

export default function Blockchain() {
  const [d, setD] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setD(await api("/admin/blockchain")), []);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
  }, [load]);

  useEffect(() => {
    api("/admin/election/settings")
      .then(setMetadata)
      .catch((e) => setM({ type: "err", text: e.message }));
  }, []);

  const running = d?.job?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => load().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [running, load]);

  async function publish() {
    if (!confirm("Publish to the blockchain? Positions, candidates, and tokens cannot be changed afterward.")) return;
    try {
      await api("/admin/blockchain/publish", { method: "POST" });
      setM(null);
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  async function setStatus(status) {
    if (status === "closed" && !confirm("Close voting? This election cannot be reopened.")) return;
    setBusy(true);
    try {
      await api("/admin/status", { method: "POST", body: { status } });
      setM({ type: "ok", text: `Status: ${status}` });
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function startNewElection() {
    if (!confirm("Archive the closed election results and start a new election? Previous results will remain on the blockchain. Token usage and student voting status will be reset so students can vote in the new election.")) return;
    setBusy(true);
    try {
      const result = await api("/admin/blockchain/new-election", { method: "POST" });
      setM({ type: "ok", text: `Election #${result.archivedElectionId} archived. Prepare and publish the new election.` });
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata(event) {
    event.preventDefault();
    try {
      await api("/admin/election/settings", { method: "PUT", body: metadata });
      setM({ type: "ok", text: "Election information saved." });
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  if (!d) return <div className="admin-content"><PageHeading title="Blockchain" subtitle="Election setup and transactions on Solana Devnet." icon="chain" /><Msg m={m} /><div className="card page-loading" role="status">Loading blockchain information…</div></div>;
  const j = d.job;
  const low = d.balance < d.estimate.publish;

  return (
    <div className="admin-content blockchain-page">
      <PageHeading title="Blockchain" subtitle="Election setup and transactions on Solana Devnet." icon="chain"><a className="admin-button secondary" href={addr(d.programId)} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Solana Explorer</a></PageHeading>
      <SummaryCards items={[
        {label:"Wallet balance", value:`${d.balance} SOL`, detail:"Relayer wallet on Devnet", icon:"key"},
        {label:"Election status", value:d.published ? NAMES[d.chainStatus] : "Pending", detail:d.published ? "Published on the blockchain" : "Not yet published", icon:"ballot"},
        {label:"Registered tokens", value:d.published ? d.tokensRegistered : "—", detail:d.published ? `${d.totalTokens} local voting tokens` : "Publish the election first", icon:"check"},
      ]} />
      <Msg m={m} />

      <div className="card">
        <PanelHeading title="Wallet and Program (Solana Devnet)" description="Public addresses and wallet balance for the election setup." icon="chain" />
        <p>Wallet: <a href={addr(d.wallet)} target="_blank" rel="noreferrer" className="mono">{short(d.wallet)}</a> · Balance: <b>{d.balance} SOL</b></p>
        <p>Program: <a href={addr(d.programId)} target="_blank" rel="noreferrer" className="mono">{short(d.programId)}</a></p>
      </div>

      {metadata && (
        <form className="card grid election-settings" onSubmit={saveMetadata}>
          <div>
            <div className="eyebrow">PUBLIC ELECTION PAGE</div>
            <PanelHeading title="Election information" icon="ledger" />
            <p className="muted">Information visible to the public. These dates do not automatically open or close voting.</p>
          </div>
          <div className="form-grid">
            <label>Election title
              <input required maxLength={64} value={metadata.title} disabled={metadata.published} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} />
            </label>
            <label>School year
              <input required maxLength={32} placeholder="SY 2026-2027" value={metadata.schoolYear} disabled={metadata.published} onChange={(e) => setMetadata({ ...metadata, schoolYear: e.target.value })} />
            </label>
            <label>Election period start
              <input type="datetime-local" value={metadata.periodStart} onChange={(e) => setMetadata({ ...metadata, periodStart: e.target.value })} />
            </label>
            <label>Election period end
              <input type="datetime-local" value={metadata.periodEnd} onChange={(e) => setMetadata({ ...metadata, periodEnd: e.target.value })} />
            </label>
          </div>
          <label>Announcement / school update
            <textarea rows={3} maxLength={500} placeholder="Enter an announcement or update from COMELEC…" value={metadata.announcement} onChange={(e) => setMetadata({ ...metadata, announcement: e.target.value })} />
          </label>
          {metadata.published && <small className="muted">The title and school year are locked because the election has been published to the blockchain.</small>}
          <div><button type="submit">Save information</button></div>
        </form>
      )}

      {!d.published ? (
        <div className="card">
          <PanelHeading title="Publish election" description="Review the ballot setup before publishing." icon="chain" />
          <p>Positions: <b>{d.positions}</b> · Unused tokens to register: <b>{d.tokens}</b></p>
          <p>
            Estimated publishing cost: <b>{d.estimate.publish} SOL</b><br />
            Voting reserve (if everyone votes): <b>{d.estimate.allVoters} SOL</b> (≈ {d.estimate.perVoter} SOL per voter)
          </p>
          {low && <div className="msg err">The wallet has insufficient SOL to publish. Get SOL at faucet.solana.com.</div>}
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Make sure positions, candidates, and tokens are complete. They cannot be changed after publishing.
            Do not save files on the server while publishing.
          </p>

          {j.running && (
            <>
              <p><b>{j.step}</b> {j.done}/{j.total}</p>
              <progress value={j.done} max={j.total || 1} style={{ width: "100%" }} />
            </>
          )}
          {j.error && <div className="msg err">{j.error}</div>}

          <button onClick={publish} disabled={j.running || !d.positions || !d.tokens || low}>
            {j.running ? "Publishing..." : "Publish to Blockchain"}
          </button>
        </div>
      ) : (
        <div className="card">
          <PanelHeading title="Published ✔" description="Manage the current election’s status." icon="check" />
          <p>Election: <a href={addr(d.electionAddress)} target="_blank" rel="noreferrer" className="mono">{short(d.electionAddress)}</a></p>
          <p>Blockchain status: <b>{NAMES[d.chainStatus]}</b></p>
          {Number.isInteger(d.tokensRegistered) && d.tokensRegistered !== d.totalTokens && (
            <div className="msg err">
              {d.tokensRegistered} of {d.totalTokens} tokens are registered on the blockchain. Unregistered tokens cannot be used to vote.
              {d.chainStatus === 1 && " Close this election on the blockchain before starting a new election and registering tokens."}
            </div>
          )}
          <div className="row">
            <button disabled={busy || d.chainStatus !== 0 || d.tokensRegistered !== d.totalTokens} onClick={() => setStatus("open")}>Open voting</button>
            <button className="danger" disabled={busy || d.chainStatus === 2} onClick={() => setStatus("closed")}>Close voting</button>
          </div>
          {d.chainStatus === 2 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "#6b7280", fontSize: 14 }}>
                A closed election cannot be reopened. You can start a new election; previous results will be archived and remain on the blockchain.
              </p>
              <button className="ghost" disabled={busy} onClick={startNewElection}>Start new election</button>
            </div>
          )}
          <small style={{ color: "#6b7280" }}>Status only moves forward: Pending → Open → Closed. Changes cannot be reversed.</small>
        </div>
      )}
    </div>
  );
}
