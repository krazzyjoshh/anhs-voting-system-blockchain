const express = require("express");
const db = require("../db");
const settings = require("../settings");
const models = require("../models");
const election = require("../election");
const { safeMessage } = require("../errors");

const router = express.Router();

let job = { running: false, step: "", done: 0, total: 0, error: "" };

function fail(res, status, error) {
  return res.status(status).json({ error });
}

function cleanError(error) {
  return safeMessage(error);
}

function loadChain() {
  try {
    return require("../chain");
  } catch (error) {
    const err = new Error(cleanError(error));
    err.status = 503;
    throw err;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function isPublished() {
  const status = settings.get("status", "pending");
  return Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(status);
}

function electionId() {
  const existing = Number(settings.get("election_id"));
  if (Number.isSafeInteger(existing) && existing > 0) return existing;
  const next = Date.now();
  settings.set("election_id", next);
  return next;
}

function localChainStatus() {
  const status = settings.get("status", "pending");
  if (status === "open") return 1;
  if (status === "closed") return 2;
  return 0;
}

function statusName(value) {
  return ["published", "open", "closed"][value] ?? "published";
}

function localPositions() {
  const positions = db.prepare("SELECT id, name FROM positions ORDER BY sort_order, id").all();
  const candidates = db
    .prepare("SELECT id, full_name, position_id FROM candidates ORDER BY full_name COLLATE NOCASE")
    .all();

  return positions.map((position) => ({
    ...position,
    candidates: candidates
      .filter((candidate) => candidate.position_id === position.id)
      .map((candidate) => candidate.full_name),
  }));
}

function unusedTokens() {
  return db
    .prepare(
      `SELECT t.code
       FROM voting_tokens t
       JOIN students s ON s.id = t.student_id AND s.active = 1
       WHERE t.used = 0
       ORDER BY t.id`
    )
    .all()
    .map((row) => row.code);
}

function tokenCount() {
  return db
    .prepare("SELECT COUNT(*) AS count FROM voting_tokens t JOIN students s ON s.id = t.student_id AND s.active = 1")
    .get().count;
}

function expectedTokenCount() {
  const saved = settings.get("expected_token_count");
  const count = Number(saved);
  return saved !== null && saved !== "" && Number.isSafeInteger(count) && count >= 0 ? count : tokenCount();
}

function archivedElections() {
  return db
    .prepare("SELECT * FROM election_archive ORDER BY election_id DESC")
    .all()
    .map((row) => ({
      electionId: row.election_id,
      title: row.title,
      schoolYear: row.school_year,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      announcement: row.announcement,
      electionAddress: row.election_address,
      archivedAt: row.archived_at,
      ...JSON.parse(row.results_json),
    }));
}

function buildFallback(setupError = "") {
  const positions = localPositions();
  const tokens = unusedTokens();
  const published = isPublished();

  return {
    wallet: "",
    programId: "",
    balance: 0,
    estimate: { publish: setupError ? 999999 : 0, perVoter: 0, allVoters: 0 },
    positions: positions.length,
    tokens: tokens.length,
    totalTokens: expectedTokenCount(),
    tokensRegistered: null,
    published,
    chainStatus: localChainStatus(),
    electionAddress: settings.get("election_address", ""),
    job: setupError ? { ...job, error: setupError } : job,
  };
}

router.get(
  "/blockchain",
  asyncRoute(async (_req, res) => {
    let chain;
    try {
      chain = loadChain();
    } catch (error) {
      return res.json(buildFallback(error.message));
    }

    const positions = localPositions();
    const tokens = unusedTokens();
    const published = isPublished();
    const estimate = chain.estimate(positions.length, tokens.length);
    const balance = await chain.balance();

    const data = {
      wallet: chain.authority.toBase58(),
      programId: chain.programId.toBase58(),
      balance: Number((balance / 1e9).toFixed(6)),
      estimate: {
        publish: Number(estimate.publish.toFixed(6)),
        perVoter: Number(estimate.perVoter.toFixed(6)),
        allVoters: Number(estimate.allVoters.toFixed(6)),
      },
      positions: positions.length,
      tokens: tokens.length,
      totalTokens: expectedTokenCount(),
      tokensRegistered: null,
      published,
      chainStatus: localChainStatus(),
      electionAddress: settings.get("election_address", ""),
      job,
    };

    if (published) {
      try {
        const result = await chain.results(electionId());
        data.chainStatus = result.status;
        data.tokensRegistered = result.tokensRegistered;
        data.totalTokens = expectedTokenCount();
        data.electionAddress = result.electionAddress;
        settings.set("status", statusName(result.status));
        settings.set("election_address", result.electionAddress);
      } catch (error) {
        data.job = { ...job, error: cleanError(error) };
      }
    }

    res.json(data);
  })
);

router.post("/blockchain/publish", (req, res, next) => {
  if (job.running) return fail(res, 409, "A publishing job is already running.");
  if (isPublished() || settings.get("publishing") === "1") return fail(res, 409, "The election is already published or a previous publishing job is incomplete. Contact COMELEC.");

  let chain;
  try {
    chain = loadChain();
  } catch (error) {
    return next(error);
  }

  const positions = localPositions();
  const tokens = unusedTokens();
  if (!positions.length) return fail(res, 400, "Add a position first.");
  if (positions.some((position) => position.candidates.length === 0)) {
    return fail(res, 400, "Each position requires at least one candidate.");
  }
  if (!tokens.length) return fail(res, 400, "Generate unused voting tokens first.");

  const id = electionId();
  models.saveChainMap();
  settings.set("publishing", "1");
  settings.set("expected_token_count", tokens.length);
  const title = settings.get("title", "SSLG Election 2026");
  job = { running: true, step: "Creating election", done: 0, total: tokens.length, error: "" };
  res.status(202).json({ ok: true, job });

  setImmediate(async () => {
    try {
      const electionAddress = await chain.createElection(id, title, positions);
      settings.set("election_address", electionAddress);

      job = { ...job, step: "Registering tokens" };
      const done = await chain.registerTokens(id, tokens, (count) => {
        job = { ...job, done: count };
      });

      settings.set("status", "published");
      settings.set("publishing", "0");
      election.invalidate();
      job = { running: false, step: "Done", done, total: tokens.length, error: "" };
    } catch (error) {
      job = { ...job, running: false, error: cleanError(error) };
    }
  });
});

router.post(
  "/blockchain/new-election",
  asyncRoute(async (_req, res) => {
    if (job.running) return fail(res, 409, "A publishing job is already running.");
    if (!isPublished()) return fail(res, 409, "There is no published election to close and archive.");

    const previousId = Number(settings.get("election_id"));
    if (!Number.isSafeInteger(previousId) || previousId <= 0) {
      return fail(res, 409, "The current election ID could not be found.");
    }

    const chain = loadChain();
    const result = await chain.results(previousId);
    if (result.status !== 2) {
      return fail(res, 409, "Close the current election on the blockchain first.");
    }

    const nextId = Math.max(Date.now(), previousId + 1);
    if (!Number.isSafeInteger(nextId)) return fail(res, 500, "Unable to create a new election ID.");

    const archiveResult = {
      status: result.status,
      tokensRegistered: result.tokensRegistered,
      positions: result.positions,
    };
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO election_archive
         (election_id, title, school_year, period_start, period_end, announcement, election_address, results_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        previousId,
        result.title,
        settings.get("school_year", ""),
        settings.get("period_start", ""),
        settings.get("period_end", ""),
        settings.get("announcement", ""),
        result.electionAddress,
        JSON.stringify(archiveResult)
      );
      db.prepare("UPDATE voting_tokens SET used = 0, used_at = NULL").run();
      db.prepare("UPDATE students SET has_voted = 0, voted_at = NULL").run();
      settings.set("election_id", nextId);
      settings.set("election_address", "");
      settings.set("status", "pending");
      settings.set("expected_token_count", "");
      settings.set("chain_map", "");
      settings.set("publishing", "0");
    })();

    election.invalidate();
    res.json({
      ok: true,
      electionId: nextId,
      archivedElectionId: previousId,
      archivedResults: archiveResult,
    });
  })
);

router.post(
  "/status",
  asyncRoute(async (req, res) => {
    const status = String(req.body?.status ?? "");
    const nextStatus = { open: 1, closed: 2 }[status];
    if (!nextStatus) return fail(res, 400, "Invalid status.");
    if (!isPublished()) return fail(res, 409, "The election has not been published yet.");

    const chain = loadChain();
    if (status === "open") {
      const result = await chain.results(electionId());
      const expectedTokens = expectedTokenCount();
      const registeredTokens = await chain.verifyTokens(electionId(), unusedTokens());
      if (result.tokensRegistered !== expectedTokens || !registeredTokens.complete) {
        return fail(
          res,
          409,
          `Voting cannot be opened: ${registeredTokens.registered} of ${registeredTokens.total} eligible tokens are registered on the blockchain.`
        );
      }
    }
    await chain.setStatus(electionId(), nextStatus);
    settings.set("status", status);
    election.invalidate();
    res.json({ status, chainStatus: nextStatus });
  })
);

router.get(
  "/results",
  asyncRoute(async (_req, res) => {
    const archive = archivedElections();
    if (!isPublished()) return res.json({ published: false, positions: [], archivedElections: archive });

    const chain = loadChain();
    const result = await chain.results(electionId());
    settings.set("status", statusName(result.status));
    settings.set("election_address", result.electionAddress);
    res.json({ published: true, ...result, archivedElections: archive });
  })
);

module.exports = router;
