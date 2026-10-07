const express = require("express");
const db = require("../db");
const settings = require("../settings");
const election = require("../election");
const { publicReceipt } = require("../receipts");
const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

async function status() {
  const published = election.published();
  const result = published ? await election.snapshot() : null;
  const id = Number(settings.get("election_id"));
  const votesCast = db.prepare("SELECT COUNT(*) AS n FROM receipts WHERE election_id = ?").get(id).n;
  const tokensRegistered = result?.tokensRegistered ?? 0;
  return { title: result?.title ?? settings.get("title", "SSLG Election"),
    status: result ? election.statusName(result.status) : "pending", published, tokensRegistered, votesCast,
    turnoutPercent: tokensRegistered ? Math.round(votesCast / tokensRegistered * 10000) / 100 : 0 };
}
async function results() {
  if (!election.published()) return { published: false, status: "pending", positions: [], resultsVisible: false,
    electionAddress: "", programId: "" };
  const result = await election.snapshot();
  const resultsVisible = process.env.PUBLIC_LIVE_RESULTS !== "false" || result.status === 2;
  return { ...result, published: true, status: election.statusName(result.status), resultsVisible,
    programId: require("../chain").programId.toBase58(),
    positions: result.positions.map((p) => ({ ...p,
      candidates: p.candidates.map((c) => resultsVisible ? { name: c.name, votes: c.votes } : { name: c.name }) })) };
}
router.get("/status", async (_req, res) => res.json(await status()));
router.get("/results", async (_req, res) => res.json(await results()));
// Compatibility endpoint shares the same cached RPC snapshot.
router.get("/election", async (_req, res) => res.json({ ...await status(), ...await results(),
  schoolYear: settings.get("school_year", ""), periodStart: settings.get("period_start", ""),
  periodEnd: settings.get("period_end", ""), announcement: settings.get("announcement", "") }));
router.get("/receipt/:code", (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const receipt = /^[A-Z0-9]{12}$/.test(code)
    ? db.prepare("SELECT id, receipt_code, created_at, kind FROM receipts WHERE receipt_code = ?").get(code) : null;
  res.json(publicReceipt(receipt));
});
module.exports = router;
