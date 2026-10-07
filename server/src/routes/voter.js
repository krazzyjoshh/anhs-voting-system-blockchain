const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");
const settings = require("../settings");
const chain = require("../chain");
const election = require("../election");
const models = require("../models");
const { voterReceipt } = require("../receipts");
const { requireVoter } = require("../auth");
const { logError } = require("../errors");
const router = express.Router();
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const tokenHash = (code) => crypto.createHmac("sha256", process.env.TOKEN_PEPPER).update(code).digest("hex");
const makeCode = () => crypto.randomBytes(9).toString("hex").toUpperCase().slice(0, 12);
const failures = new Map();
const recent = (ip) => (failures.get(ip) ?? []).filter((t) => Date.now() - t < 60_000);
const recordFail = (ip) => {
  for (const [key, attempts] of failures) if (!attempts.some((t) => Date.now() - t < 60_000)) failures.delete(key);
  failures.set(ip, [...recent(ip), Date.now()]);
};

function loadToken(tokenId, allowUsed = false) {
  const row = db.prepare(`SELECT t.*, s.active AS student_active FROM voting_tokens t
    LEFT JOIN students s ON s.id = t.student_id WHERE t.id = ?`).get(tokenId);
  if (!row) throw fail(401, "Token not found.");
  if (row.used && !allowUsed) throw fail(409, "This token has already been used.", "TOKEN_USED");
  if (!row.student_id || !row.student_active) throw fail(403, "The student is inactive. Contact COMELEC.");
  return row;
}
function sessionElection(req) {
  const id = election.electionId();
  if (req.voterElectionId !== id) throw fail(401, "This is a different election. Log in again with your token.");
  return id;
}
async function openElection() {
  if (!election.published() || (await election.snapshot({ fresh: true })).status !== 1)
    throw fail(403, "Voting has not opened or has already closed.");
}
// Preserve the existing ballot queries and ordering; use the published snapshot for indices.
async function ballotPositions(result) {
  const positions = db.prepare("SELECT id, name FROM positions ORDER BY sort_order, id").all();
  const candidates = db.prepare("SELECT id, full_name, partylist, grade, section, photo_url, position_id FROM candidates ORDER BY full_name COLLATE NOCASE").all();
  const map = await models.verifiedChainMap(result);
  return positions.map((position) => {
    const frozen = map.find((p) => p.id === position.id);
    if (!frozen) throw fail(503, "The ballot does not match the blockchain.");
    const rows = candidates.filter((candidate) => candidate.position_id === position.id);
    if (rows.length !== frozen.candidates.length || rows.some((c, i) => c.id !== frozen.candidates[i].id || c.full_name !== frozen.candidates[i].name))
      throw fail(503, "The ballot does not match the blockchain.");
    return { ...position, index: frozen.index, candidates: rows };
  });
}
function ownReceipt(row, id) {
  return db.prepare("SELECT * FROM receipts WHERE election_id = ? AND token_hash = ?").get(id, tokenHash(row.code));
}
router.post("/login", async (req, res) => {
  if (recent(req.ip).length >= 10) throw fail(429, "Too many failed attempts. Please wait one minute.");
  const code = String(req.body?.token ?? "").trim().toUpperCase();
  const found = /^[A-Z0-9]{8}$/.test(code) ? db.prepare("SELECT id FROM voting_tokens WHERE code = ?").get(code) : null;
  if (!found) { recordFail(req.ip); throw fail(401, "Invalid token. Please check it and try again."); }
  loadToken(found.id);
  await openElection();
  const token = jwt.sign({ sub: found.id, role: "voter", electionId: election.electionId() }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});
router.get("/me", requireVoter, async (req, res) => {
  sessionElection(req); loadToken(req.tokenId); await openElection();
  const student = models.tokenStudent(req.tokenId);
  // Explicit whitelist: no participation, token codes, hashes or choices.
  res.json({ title: settings.get("title", ""), student: {
    fullName: [student.first_name, student.given_name, student.last_name].filter(Boolean).join(" "),
    grade: student.grade, section: student.section } });
});
router.get("/ballot", requireVoter, async (req, res) => {
  sessionElection(req); loadToken(req.tokenId); await openElection();
  res.json({ title: settings.get("title", ""), positions: await ballotPositions() });
});
router.get("/receipt", requireVoter, (req, res) => {
  const id = sessionElection(req);
  const row = loadToken(req.tokenId, true);
  const receipt = ownReceipt(row, id);
  if (!receipt) throw fail(404, "No completed receipt yet.");
  res.json(voterReceipt(receipt));
});

const inflight = new Set();
router.post("/submit", requireVoter, async (req, res, next) => {
  const id = sessionElection(req);
  const tokenId = req.tokenId;
  const key = `${id}:${tokenId}`;
  if (inflight.has(key)) throw fail(423, "Your vote is still being processed. Please wait.");
  inflight.add(key);
  try {
    const row = loadToken(tokenId, true);
    const previousReceipt = ownReceipt(row, id);
    if (previousReceipt) return res.json(voterReceipt(previousReceipt)); // Lost-response recovery.
    if (row.used) throw fail(409, "This token has already been used.", "TOKEN_USED");
    if (!election.published()) throw fail(403, "The election has not been published yet.");
    const result = await election.snapshot({ fresh: true });
    const positions = await ballotPositions(result);
    if (!positions.length) throw fail(400, "There are no positions on the ballot.");
    const sel = req.body?.selections;
    if (!sel || typeof sel !== "object" || Array.isArray(sel)) throw fail(400, "Please complete the ballot.");
    const indexed = positions.map((p) => {
      if (!Object.prototype.hasOwnProperty.call(sel, String(p.id))) throw fail(400, `No selection for ${p.name}.`);
      if (sel[p.id] === null) return null;
      const candidateIndex = p.candidates.findIndex((c) => c.id === sel[p.id]);
      if (candidateIndex < 0) throw fail(400, "Invalid candidate.");
      return { positionIndex: p.index, candidateIndex };
    });
    const completed = [];
    // Fixed position groups keep retries stable even when some positions are abstentions.
    for (let batchIndex = 0; batchIndex * 6 < indexed.length; batchIndex++) {
      const batch = indexed.slice(batchIndex * 6, batchIndex * 6 + 6).filter(Boolean);
      const saved = db.prepare("SELECT * FROM submission_batches WHERE election_id = ? AND token_id = ? AND batch_index = ?").get(id, tokenId, batchIndex);
      if (saved) {
        const [state] = await chain.signatureStatuses([saved.signature]);
        if (state && !state.err && ["confirmed", "finalized"].includes(state.confirmationStatus)) {
          if (!await chain.matchesVoteTransaction(saved.signature, id, row.code, batch))
            throw fail(409, "The ballot does not match the submitted batch. Keep your original selections and contact COMELEC.", "BALLOT_LOCKED");
          db.prepare("UPDATE submission_batches SET state = 'confirmed' WHERE election_id = ? AND token_id = ? AND batch_index = ?").run(id, tokenId, batchIndex);
          completed.push({ batchIndex, signature: saved.signature });
          continue;
        }
        if (saved.state === "confirmed" || state && !state.err || !state && await chain.blockHeight() <= saved.last_valid_block_height)
          throw fail(503, "Waiting for confirmation of the previous transaction. Please try again later.");
        // A missing signature after expiry is uncertain: check vote records before any resend.
        if (!state && await chain.hasVoteRecords(id, row.code, batchIndex * 6, Math.min(6, indexed.length - batchIndex * 6)))
          throw fail(503, "A batch was recorded on the blockchain, but its signature history is incomplete. Contact COMELEC.");
      }
      if (!batch.length) continue;
      if (result.status !== 1) throw fail(403, "Voting is closed. Contact COMELEC if a batch is pending.");
      const sent = await chain.vote(id, row.code, batch, ({ signature, lastValidBlockHeight }) => {
        db.prepare(`INSERT INTO submission_batches (election_id, token_id, batch_index, signature, last_valid_block_height, state)
          VALUES (?, ?, ?, ?, ?, 'prepared') ON CONFLICT(election_id, token_id, batch_index)
          DO UPDATE SET signature = excluded.signature, last_valid_block_height = excluded.last_valid_block_height, state = 'prepared'`)
          .run(id, tokenId, batchIndex, signature, lastValidBlockHeight);
      });
      db.prepare("UPDATE submission_batches SET state = 'confirmed' WHERE election_id = ? AND token_id = ? AND batch_index = ?").run(id, tokenId, batchIndex);
      completed.push({ batchIndex, signature: sent.signature });
    }
    if (!completed.length && result.status !== 1) throw fail(403, "Voting is closed.");
    if (election.electionId() !== id) throw fail(409, "The election changed during processing. Contact COMELEC.");
    const receiptCode = makeCode();
    db.transaction(() => {
      db.prepare("UPDATE voting_tokens SET used = 1, used_at = datetime('now') WHERE id = ?").run(tokenId);
      db.prepare("UPDATE students SET has_voted = 1, voted_at = datetime('now') WHERE id = ?").run(row.student_id);
      const receipt = db.prepare("INSERT INTO receipts (receipt_code, token_hash, solana_signature, election_id, kind) VALUES (?, ?, ?, ?, ?)")
        .run(receiptCode, tokenHash(row.code), completed[0]?.signature ?? null, id, completed.length ? "onchain" : "abstain");
      for (const t of completed) db.prepare("INSERT INTO receipt_transactions (receipt_id, signature, batch_index) VALUES (?, ?, ?)")
        .run(receipt.lastInsertRowid, t.signature, t.batchIndex);
    })();
    election.invalidate();
    res.json(voterReceipt(ownReceipt(row, id)));
  } catch (error) {
    if (!error.status || [402, 502].includes(error.status)) {
      logError("voter_submission_failed", error);
      return next(fail(503, "The system is temporarily unavailable. Please try again later or contact COMELEC."));
    }
    next(error);
  } finally { inflight.delete(key); }
});
module.exports = router;
