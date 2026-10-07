const express = require("express");
const db = require("../db");
const election = require("../election");
const { transactions } = require("../receipts");
const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
async function summary(fresh = false) {
  const id = election.electionId();
  const result = election.published() ? await election.snapshot({ fresh }) : null;
  const chain = require("../chain");
  const receipts = db.prepare("SELECT id, receipt_code, created_at, kind FROM receipts WHERE election_id = ? ORDER BY id DESC").all(id)
    .map((r) => { const signatures = transactions(r); return { receipt_code: r.receipt_code, created_at: r.created_at,
      kind: r.kind, signature: signatures[0] ?? null, explorer: signatures[0] ? chain.explorerTx(signatures[0]) : null,
      transactions: signatures.map((signature) => ({ signature, explorer: chain.explorerTx(signature) })) }; });
  return { electionId: id, address: result?.electionAddress ?? "", status: result ? election.statusName(result.status) : "pending",
    tokensRegistered: result?.tokensRegistered ?? 0, published: Boolean(result),
    positions: result?.positions.map((p) => ({ index: p.index, name: p.name, totalVotes: p.candidates.reduce((n, c) => n + c.votes, 0) })) ?? [],
    receipts, legacyReceipts: db.prepare("SELECT COUNT(*) AS n FROM receipts WHERE election_id IS NULL").get().n };
}
router.get("/ledger", async (_req, res) => res.json(await summary()));
router.post("/ledger/verify", async (_req, res) => {
  const data = await summary(true);
  const checks = [];
  const add = (id, status, explanation) => checks.push({ id, status, explanation });
  const all = db.prepare("SELECT COUNT(*) AS n FROM voting_tokens").get().n;
  const eligible = db.prepare("SELECT COUNT(*) AS n FROM voting_tokens t JOIN students s ON s.id = t.student_id WHERE s.active = 1").get().n;
  const used = db.prepare("SELECT COUNT(*) AS n FROM voting_tokens WHERE used = 1").get().n;
  add("tokens", !data.published ? "N/A" : data.tokensRegistered === all ? "PASS" : "WARNING",
    `${data.tokensRegistered} registered on the blockchain; ${all} total tokens; ${eligible} currently eligible. Only active students are registered when publishing.`);
  for (const p of data.positions) add(`position:${p.index}`, p.totalVotes <= used ? "PASS" : "FAIL",
    `${p.name}: ${p.totalVotes} votes; ${used} used tokens. Used tokens include all-abstain submissions.`);
  add("receipts", data.receipts.length === used ? "PASS" : "FAIL", `${data.receipts.length} receipts for this election; ${used} used tokens.`);
  if (data.legacyReceipts) add("legacy", "WARNING", `${data.legacyReceipts} legacy receipts have no verifiable election ID and are excluded from the count.`);
  const signatures = [...new Set(data.receipts.flatMap((r) => r.transactions.map((t) => t.signature)))];
  let statuses;
  try { statuses = await require("../chain").signatureStatuses(signatures); }
  catch { add("rpc", "WARNING", "Unable to retrieve signature history from the RPC. Transactions have not been verified."); }
  const bySignature = new Map(signatures.map((signature, i) => [signature, statuses?.[i]]));
  for (const r of data.receipts) {
    if (!r.transactions.length) add(`receipt:${r.receipt_code}`, r.kind === "abstain" ? "N/A" : "WARNING",
      r.kind === "abstain" ? "Valid all-abstain receipt; no on-chain transaction." : "This receipt has no signature evidence.");
    for (const t of r.transactions) {
      const state = bySignature.get(t.signature);
      const status = !statuses || !state ? "WARNING" : state.err ? "FAIL" :
        ["confirmed", "finalized"].includes(state.confirmationStatus) ? "PASS" : "WARNING";
      add(`signature:${t.signature}`, status, status === "PASS" ? "Confirmed transaction; no blockchain error." :
        status === "FAIL" ? "The transaction failed on the blockchain." : "The confirmed transaction cannot yet be verified in RPC history.");
    }
  }
  if (!data.published) add("chain", "N/A", "The election has not been published yet.");
  res.json({ checks, consistent: checks.every((c) => c.status === "PASS" || c.status === "N/A"),
    note: "These are consistency checks only. They do not prove the secrecy or correctness of each ballot." });
});
module.exports = router;
