import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { vapi, vToken } from "../voter";
import { Icon } from "../admin";
import { NameAvatar } from "../components/PageUI";
const read = (k, fb) => {
  try { return JSON.parse(sessionStorage.getItem(k)) ?? fb; } catch { return fb; }
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clearSession = () => ["voterToken", "selections", "receipt", "submissionStarted"].forEach((k) => sessionStorage.removeItem(k));

function VoteCardHeading({ number, title, detail }) {
  return <div className="vote-card-step"><div><span className="vote-step-number">{number ?? <Icon name="check" size={15} />}</span><strong>{title}</strong></div><span>{detail}</span></div>;
}

export default function Vote() {
  const location = useLocation();
  const nav = useNavigate();
  const stage = location.pathname.slice(6) || "login";
  const [code, setCode] = useState("");
  const [ballot, setBallot] = useState(null);
  const [me, setMe] = useState(null);
  const [sel, setSel] = useState(() => read("selections", {}));
  const [receipt, setReceipt] = useState(() => read("receipt", null));
  const [locked, setLocked] = useState(() => sessionStorage.getItem("submissionStarted") === "1");
  const [m, setM] = useState(location.state?.message ? { type: "err", text: location.state.message } : null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const rawStep = Number(new URLSearchParams(location.search).get("step") || 1);
  const step = Number.isSafeInteger(rawStep) && rawStep >= 1 ? rawStep - 1 : 0;

  function reset(message = null) {
    if (typeof message !== "string") message = null;
    setLoading(false); clearSession(); setSel({}); setReceipt(null); setBallot(null); setMe(null); setLocked(false); setCode("");
    setM(message ? { type: "err", text: message } : null);
    nav("/vote", { replace: true, state: message ? { message } : null });
  }
  function received(r) {
    setLoading(false);
    sessionStorage.removeItem("voterToken"); sessionStorage.removeItem("selections"); sessionStorage.removeItem("submissionStarted");
    sessionStorage.setItem("receipt", JSON.stringify(r));
    setReceipt(r); setSel({}); setLocked(false); setM(null); nav("/vote/receipt", { replace: true });
  }
  useEffect(() => {
    let stopped = false;
    if (stage === "logout") {
      if (locked && !confirm("Your submission is incomplete. Logging out will clear your selections in this browser, and you may need help from COMELEC. Log out anyway?")) {
        nav("/vote/review", { replace: true }); return;
      }
      reset(); return;
    }
    if (stage === "receipt") { if (!receipt) nav("/vote", { replace: true }); return; }
    if (stage === "login") {
      if (receipt) nav("/vote/receipt", { replace: true });
      else if (vToken()) nav("/vote/dashboard", { replace: true });
      return;
    }
    if (!["dashboard", "ballot", "review"].includes(stage)) { nav("/vote", { replace: true }); return; }
    if (!vToken()) { reset("Please log in with your token first."); return; }
    if (stage === "ballot" && locked) { nav("/vote/review", { replace: true }); return; }
    async function load() {
      setLoading(true);
      try {
        const profile = await vapi("/me");
        if (stopped) return;
        setMe(profile);
        if (stage !== "dashboard") {
          const b = await vapi("/ballot");
          if (stopped) return;
          setBallot(b);
          if (stage === "review" && b.positions.some((p) => !has(sel, p.id))) {
            setM({ type: "err", text: "Please complete the ballot first." });
            nav("/vote/ballot?step=1", { replace: true });
          } else if (stage === "ballot" && (rawStep !== step + 1 || step >= b.positions.length)) {
            nav("/vote/ballot?step=1", { replace: true });
          }
        }
      } catch (e) {
        if (stopped) return;
        if (e.code === "TOKEN_USED" && locked) {
          try { const r = await vapi("/receipt"); if (!stopped) received(r); return; } catch { /* Fall through to login guard. */ }
        }
        if (!stopped) reset(e.message);
      } finally { if (!stopped) setLoading(false); }
    }
    load();
    return () => { stopped = true; };
    // Location changes revalidate the session. Selections remain local to this browser tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  async function login(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setM(null);
    try {
      const d = await vapi("/login", { method: "POST", body: { token: code } });
      clearSession(); sessionStorage.setItem("voterToken", d.token);
      setSel({}); setReceipt(null); setLocked(false); nav("/vote/dashboard");
    } catch (err) { setM({ type: "err", text: err.message }); }
    finally { setBusy(false); }
  }
  function choose(posId, value) {
    if (locked || busy) return;
    const next = { ...sel, [posId]: value };
    setSel(next); sessionStorage.setItem("selections", JSON.stringify(next));
  }
  async function submit() {
    if (busy || !ballot || ballot.positions.some((p) => !has(sel, p.id))) return;
    if (!locked && !confirm("Submit your final vote? Your selections cannot be changed afterward.")) return;
    setBusy(true); setM(null); setLocked(true); sessionStorage.setItem("submissionStarted", "1");
    try { received(await vapi("/submit", { method: "POST", body: { selections: sel } })); }
    catch (e) {
      if (e.status === 401 || e.code === "TOKEN_USED") reset(e.message);
      else {
        if (e.status === 400) { setLocked(false); sessionStorage.removeItem("submissionStarted"); }
        setM({ type: "err", text: e.message });
      }
    } finally { setBusy(false); }
  }

  const P = ballot?.positions ?? [];
  const pos = P[step];
  const chosen = pos && has(sel, pos.id);
  const last = step === P.length - 1;

  return <main className={`vote-page vote-stage-${stage}`}>
    <div className="vote-content">
      <div className="vote-intro">
        <div className="vote-logos" aria-label="DepEd and ANHS logos">
          <img src="/branding/deped-seal.png" alt="Department of Education seal" width="64" height="64" />
          <img src="/branding/agusan-national-high-school.png" alt="Agusan National High School logo" width="64" height="64" />
        </div>
        <h1>ANHS Blockchain Voting</h1>
        <p>Official voting system for the SSLG election.</p>
      </div>
      {m && <div className={`vote-message ${m.type}`} role="alert">{m.text}</div>}
      {loading && <div className="vote-loading" role="status"><Icon name="refresh" size={20} className="is-spinning" />Please wait...</div>}

      {stage === "login" && <>
        <form className="vote-card vote-token-card" onSubmit={login}>
          <VoteCardHeading number={1} title="Voter Token Verification" detail="Step 1" />
          <div className="vote-token-label"><label htmlFor="voter-token">Enter your token</label><span>8-character key</span></div>
          <div className="vote-token-input"><Icon name="key" size={21} />
            <input id="voter-token" className="mono" type="text" maxLength={8} pattern="[A-Za-z0-9]{8}" required autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="voter-token-help voter-token-warning" placeholder="8-character token" disabled={busy} value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8))}
              onPaste={(e) => { e.preventDefault(); setCode(e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8)); }} />
            <span className={`vote-token-counter ${code.length === 8 ? "complete" : ""}`} aria-live="polite">{code.length}/8</span>
          </div>
          <p className="vote-token-help" id="voter-token-help"><Icon name="check" size={14} />This token was issued by the Commission on Elections (COMELEC).</p>
          <button className="vote-button primary vote-full-button" type="submit" disabled={busy || code.length !== 8}>{busy ? "Checking token…" : "Continue"}<Icon name={busy ? "refresh" : "arrow"} size={17} className={busy ? "is-spinning" : ""} /></button>
          <div className="vote-token-warning" id="voter-token-warning"><span className="vote-warning-icon">!</span><p><strong>Important reminder:</strong> Each token can only be used once. Do not show or share it with others.</p></div>
          <div className="vote-privacy"><Icon name="shield" size={17} /><p>Your selections may be visible in the blockchain transaction. The current system is not anonymous.</p></div>
        </form>
        <div className="vote-help"><span>Lost your token or having trouble using it? Contact COMELEC.</span><Link to="/verify">Verify receipt <Icon name="arrow" size={13} /></Link></div>
      </>}

      {stage === "dashboard" && me && !loading && <section className="vote-card">
        <VoteCardHeading title="Voter access verified" detail="Ready" />
        <p className="vote-election-name">{me.title}</p>
        <h2>Welcome, {me.student.fullName}</h2><p className="vote-subtitle">{me.student.grade} · {me.student.section}</p>
        <div className="vote-information"><Icon name="ballot" size={22} /><div><strong>You are ready to vote</strong><p>Your token is valid for this election. Choose a candidate or abstain for each position, then review your ballot before submitting.</p></div></div>
        <button className="vote-button primary vote-full-button" onClick={() => nav(locked ? "/vote/review" : "/vote/ballot?step=1")}>{locked ? "Resume submission" : "Start voting"}<Icon name="arrow" size={17} /></button>
        <button className="vote-button text vote-full-button" disabled={busy} onClick={() => nav("/vote/logout")}><Icon name="logout" size={16} />Log out</button>
      </section>}

      {stage === "ballot" && !loading && !pos && <div className="vote-card"><h2>There are no positions on the ballot.</h2><p className="vote-subtitle">Contact COMELEC.</p><button className="vote-button secondary" onClick={reset}>Back</button></div>}
      {stage === "ballot" && !loading && pos && <>
        <section className="vote-card vote-ballot-card">
          <VoteCardHeading number={2} title="Choose your candidate" detail={`Position ${step + 1} of ${P.length}`} />
          <p className="vote-election-name">{ballot.title}</p>
          <div className="vote-progress"><progress aria-label="Ballot progress" value={step + 1} max={P.length} /></div>
          <fieldset className="vote-options"><legend>{pos.name}</legend><p className="vote-subtitle">Choose one candidate or abstain for this position.</p>
            {pos.candidates.map((c) => <label key={c.id} className={`vote-option ${sel[pos.id] === c.id ? "selected" : ""}`}>
              <input type="radio" name={`position-${pos.id}`} checked={sel[pos.id] === c.id} disabled={busy || locked} onChange={() => choose(pos.id, c.id)} />
              {c.photo_url ? <img className="vote-candidate-photo" src={c.photo_url} alt="" /> : <NameAvatar name={c.full_name} />}
              <span className="vote-option-text"><strong>{c.full_name}</strong><small>{[c.partylist, c.grade, c.section].filter(Boolean).join(" · ") || "Candidate"}</small></span>
              <span className="vote-radio-mark"><Icon name="check" size={18} /></span>
            </label>)}
            <label className={`vote-option vote-abstain ${chosen && sel[pos.id] === null ? "selected" : ""}`}><input type="radio" name={`position-${pos.id}`} checked={Boolean(chosen && sel[pos.id] === null)} disabled={busy || locked} onChange={() => choose(pos.id, null)} /><span className="vote-abstain-icon"><Icon name="close" size={20} /></span><span className="vote-option-text"><strong>Abstain</strong><small>No vote for this position</small></span><span className="vote-radio-mark"><Icon name="check" size={18} /></span></label>
          </fieldset>
          <div className="vote-actions"><button className="vote-button primary" disabled={!chosen || busy} onClick={() => nav(last ? "/vote/review" : `/vote/ballot?step=${step + 2}`)}>{last ? "Review" : "Next"}<Icon name="arrow" size={16} /></button><button className="vote-button secondary" disabled={step === 0 || busy} onClick={() => nav(`/vote/ballot?step=${step}`)}>Back</button></div>
          <button className="vote-button text vote-cancel" onClick={reset}>Cancel</button>
        </section>
      </>}

      {stage === "review" && !loading && ballot && <section className="vote-card">
        <VoteCardHeading number={3} title="Ballot review" detail="Before submitting" />
        <p className="vote-election-name">{ballot.title}</p>
        <h2>Review your vote</h2><p className="vote-subtitle">Make sure your selections are correct before continuing.</p>
        {locked && <p className="vote-message err">Submission has started. Keep your selections and use Submit vote to retry.</p>}
        <div className="vote-review-list">{P.map((p) => { const c = p.candidates.find((x) => x.id === sel[p.id]); return <div className="vote-review-row" key={p.id}><span><Icon name="ballot" size={18} />{p.name}</span><strong>{c ? c.full_name : "Abstain"}</strong></div>; })}</div>
        <div className="vote-privacy"><Icon name="lock" size={17} /><p>Your vote is final once submitted. It cannot be changed.</p></div>
        <div className="vote-actions"><button className="vote-button primary" disabled={busy} onClick={submit}>{busy ? "Submitting to the blockchain..." : "Submit vote"}<Icon name={busy ? "refresh" : "check"} size={17} className={busy ? "is-spinning" : ""} /></button><button className="vote-button secondary" disabled={busy || locked} onClick={() => nav("/vote/ballot?step=1")}>Edit</button></div>
      </section>}

      {stage === "receipt" && receipt && <section className="vote-card vote-receipt">
        <VoteCardHeading number={4} title="Your voting receipt" detail="Completed" />
        <span className="vote-receipt-icon"><Icon name="check" size={34} /></span><h2>Thank you for voting! ✔</h2><p className="vote-subtitle">Your submission is complete. Keep your receipt.</p>
        <div className="vote-receipt-code"><span>Receipt code</span><strong className="mono">{receipt.receiptCode}</strong></div>
        <div className="vote-receipt-links">{receipt.explorers.length ? receipt.explorers.map((u,i) => <a key={u} href={u} target="_blank" rel="noreferrer"><Icon name="external" size={15} />View on blockchain{receipt.explorers.length > 1 ? ` (${i + 1})` : ""}</a>) : <p>You abstained for all positions, so there is no blockchain transaction.</p>}</div>
        <p className="vote-subtitle">Save your receipt code and verify it at <Link to="/verify">/verify</Link>. Your selections may be visible in the transaction; share it carefully.</p>
        <div className="vote-actions"><button className="vote-button primary" onClick={reset}>Done<Icon name="check" size={17} /></button><button className="vote-button secondary" onClick={() => window.print()}><Icon name="ledger" size={16} />Print</button></div>
      </section>}
    </div>
  </main>;
}
