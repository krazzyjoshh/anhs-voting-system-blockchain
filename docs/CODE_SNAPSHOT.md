# CODE SNAPSHOT (walang .env at walang secrets)

=== FILE: server/package.json ===
```
{
  "name": "server",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "dev": "node --watch src/index.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "@anchor-lang/core": "^1.2.0",
    "bcryptjs": "^3.0.3",
    "better-sqlite3": "^13.0.3",
    "csv-parse": "^7.0.3",
    "dotenv": "^18.0.5",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.3",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "vite": "^8.3.2"
  }
}
```

=== FILE: web/package.json ===
```
{
  "name": "web",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "dev": "vite"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router-dom": "^7.18.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "vite": "^8.3.2"
  }
}
```

=== FILE: web/vite.config.js ===
```
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
});
```

=== FILE: web/index.html ===
```
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ANHS Blockchain Voting</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

=== FILE: chain/programs/voting-system/src/lib.rs ===
```
use anchor_lang::prelude::*;

declare_id!("3qbabjuWYpbyWFaHfmW1qmjLWkWMJkDxZUbUVzRE8VXX");

pub const STATUS_PENDING: u8 = 0;
pub const STATUS_OPEN: u8 = 1;
pub const STATUS_CLOSED: u8 = 2;
pub const MAX_CANDIDATES: usize = 10;

#[program]
pub mod voting_system {
    use super::*;

    pub fn create_election(
        ctx: Context<CreateElection>,
        election_id: u64,
        title: String,
    ) -> Result<()> {
        require!(title.len() <= 64, VotingError::NameTooLong);
        let e = &mut ctx.accounts.election;
        e.authority = ctx.accounts.authority.key();
        e.title = title;
        e.status = STATUS_PENDING;
        e.position_count = 0;
        e.token_count = 0;
        let _ = election_id;
        Ok(())
    }

    pub fn add_position(
        ctx: Context<AddPosition>,
        name: String,
        candidates: Vec<String>,
    ) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(e.status == STATUS_PENDING, VotingError::ElectionLocked);
        require!(name.len() <= 32, VotingError::NameTooLong);
        require!(
            !candidates.is_empty() && candidates.len() <= MAX_CANDIDATES,
            VotingError::BadCandidateCount
        );
        for c in candidates.iter() {
            require!(c.len() <= 40, VotingError::NameTooLong);
        }

        let p = &mut ctx.accounts.position;
        p.election = e.key();
        p.index = e.position_count;
        p.name = name;
        p.votes = vec![0; candidates.len()];
        p.candidates = candidates;

        e.position_count += 1;
        Ok(())
    }

    pub fn register_token(ctx: Context<RegisterToken>, token_hash: [u8; 32]) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(e.status == STATUS_PENDING, VotingError::ElectionLocked);
        let _ = token_hash;
        ctx.accounts.token_record.votes_cast = 0;
        e.token_count += 1;
        Ok(())
    }

    pub fn set_status(ctx: Context<SetStatus>, status: u8) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(
            status > e.status && status <= STATUS_CLOSED,
            VotingError::BadStatus
        );
        e.status = status;
        Ok(())
    }

    pub fn cast_vote(
        ctx: Context<CastVote>,
        token_hash: [u8; 32],
        candidate_index: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.election.status == STATUS_OPEN,
            VotingError::ElectionNotOpen
        );
        let p = &mut ctx.accounts.position;
        require!(
            (candidate_index as usize) < p.votes.len(),
            VotingError::InvalidOption
        );
        p.votes[candidate_index as usize] += 1;
        ctx.accounts.token_record.votes_cast += 1;
        let _ = token_hash;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(election_id: u64)]
pub struct CreateElection<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + 64 + 1 + 1 + 4,
        seeds = [b"election", election_id.to_le_bytes().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPosition<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 4 + 32 + 4 + MAX_CANDIDATES * (4 + 40) + 4 + MAX_CANDIDATES * 8,
        seeds = [b"position", election.key().as_ref(), &[election.position_count]],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_hash: [u8; 32])]
pub struct RegisterToken<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(
        init,
        payer = authority,
        space = 8 + 1,
        seeds = [b"token", election.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub token_record: Account<'info, TokenRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetStatus<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_hash: [u8; 32])]
pub struct CastVote<'info> {
    #[account(has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(mut, constraint = position.election == election.key())]
    pub position: Account<'info, Position>,
    // Kailangang naka-register ang token. Kung hindi, mag-e-error dito.
    #[account(
        mut,
        seeds = [b"token", election.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub token_record: Account<'info, TokenRecord>,
    // Isang boto kada token kada posisyon. Pag ulit, mag-e-error.
    #[account(
        init,
        payer = authority,
        space = 8 + 1,
        seeds = [b"vote", position.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Election {
    pub authority: Pubkey,
    pub title: String,
    pub status: u8,
    pub position_count: u8,
    pub token_count: u32,
}

#[account]
pub struct Position {
    pub election: Pubkey,
    pub index: u8,
    pub name: String,
    pub candidates: Vec<String>,
    pub votes: Vec<u64>,
}

#[account]
pub struct TokenRecord {
    pub votes_cast: u8,
}

#[account]
pub struct VoteRecord {
    pub placeholder: u8,
}

#[error_code]
pub enum VotingError {
    #[msg("Invalid option")]
    InvalidOption,
    #[msg("Election is not open")]
    ElectionNotOpen,
    #[msg("Election setup is locked")]
    ElectionLocked,
    #[msg("Invalid status change")]
    BadStatus,
    #[msg("Name is too long")]
    NameTooLong,
    #[msg("Candidates must be between 1 and 10")]
    BadCandidateCount,
}```

=== FILE: server/src/auth.js ===
```
const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  try {
    const raw = (req.get("authorization") ?? "").replace("Bearer ", "");
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (payload.role !== "admin") throw new Error("not admin");
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Kailangang mag-login." });
  }
}

function requireVoter(req, res, next) {
  try {
    const raw = (req.get("authorization") ?? "").replace("Bearer ", "");
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (payload.role !== "voter") throw new Error("not voter");
    req.tokenId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Nag-expire ang session. Mag-login ulit gamit ang token." });
  }
}

module.exports = { requireAdmin, requireVoter };
```

=== FILE: server/src/chain.js ===
```
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const anchor = require("@anchor-lang/core");

const { RPC_URL, WALLET_PATH, TOKEN_PEPPER } = process.env;
if (!TOKEN_PEPPER || !WALLET_PATH) throw new Error("Kulang ang WALLET_PATH o TOKEN_PEPPER sa .env");

const keypair = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")))
);
const connection = new anchor.web3.Connection(RPC_URL || "https://api.devnet.solana.com", "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});
anchor.setProvider(provider);

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "chain", "target", "idl", "voting_system.json"), "utf8")
);
const program = new anchor.Program(idl, provider);
const authority = keypair.publicKey;
const sys = anchor.web3.SystemProgram.programId;

// ---------- helpers ----------
const hashToken = (t) =>
  Array.from(
    crypto.createHmac("sha256", TOKEN_PEPPER).update(String(t).trim().toUpperCase()).digest()
  );
const u64 = (n) => new anchor.BN(n).toArrayLike(Buffer, "le", 8);
const find = (seeds) => anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];

const electionPda = (id) => find([Buffer.from("election"), u64(id)]);
const positionPda = (el, i) => find([Buffer.from("position"), el.toBuffer(), Buffer.from([i])]);
const tokenPda = (el, h) => find([Buffer.from("token"), el.toBuffer(), Buffer.from(h)]);
const votePda = (pos, h) => find([Buffer.from("vote"), pos.toBuffer(), Buffer.from(h)]);

const send = (ixs) => provider.sendAndConfirm(new anchor.web3.Transaction().add(...ixs));
const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// Ginagawang malinaw na error ang mga error ng blockchain
function wrap(e) {
  const text = [e?.message, e?.error?.errorCode?.code, ...(e?.logs ?? [])].join(" ");
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (text.includes("already in use")) return err(409, "Nagamit na ang token na ito.");
  if (text.includes("AccountNotInitialized")) return err(403, "Hindi registered ang token.");
  if (text.includes("ElectionNotOpen")) return err(403, "Hindi bukas ang eleksyon.");
  if (text.includes("InvalidOption")) return err(400, "Maling candidate.");
  if (/insufficient (funds|lamports)|no record of a prior credit/i.test(text))
    return err(402, "Kulang ang SOL ng wallet.");
  return err(502, "Error sa blockchain: " + (e?.message ?? e));
}

// ---------- gastos (rent + fee), tinatayang ----------
const rent = (len) => (128 + len) * 6960; // lamports
function estimate(positions, tokens) {
  const txs = 1 + positions + Math.ceil(tokens / 6);
  const publish = rent(114) + positions * rent(605) + tokens * rent(9) + txs * 5000;
  const perVoter = positions * rent(9) + Math.ceil(positions / 6) * 5000;
  return { publish: publish / 1e9, perVoter: perVoter / 1e9, allVoters: (perVoter * tokens) / 1e9 };
}

const balance = () => connection.getBalance(authority);

// ---------- mga operasyon ----------
async function createElection(electionId, title, positions) {
  try {
    const el = electionPda(electionId);
    await program.methods
      .createElection(new anchor.BN(electionId), title)
      .accountsPartial({ election: el, authority, systemProgram: sys })
      .rpc();
    for (let i = 0; i < positions.length; i++) {
      await program.methods
        .addPosition(positions[i].name, positions[i].candidates)
        .accountsPartial({ election: el, position: positionPda(el, i), authority, systemProgram: sys })
        .rpc();
    }
    return el.toBase58();
  } catch (e) {
    throw wrap(e);
  }
}

async function registerTokens(electionId, tokens, onProgress = () => {}) {
  try {
    const el = electionPda(electionId);
    const CHUNK = 6;
    let done = 0;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const ixs = [];
      for (const t of tokens.slice(i, i + CHUNK)) {
        const h = hashToken(t);
        ixs.push(
          await program.methods
            .registerToken(h)
            .accountsPartial({ election: el, tokenRecord: tokenPda(el, h), authority, systemProgram: sys })
            .instruction()
        );
      }
      await send(ixs);
      done += ixs.length;
      onProgress(done);
    }
    return done;
  } catch (e) {
    throw wrap(e);
  }
}

async function verifyTokens(electionId, tokens) {
  const el = electionPda(electionId);
  let registered = 0;
  const CHUNK = 100;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const addresses = tokens.slice(i, i + CHUNK).map((token) => {
      const hash = hashToken(token);
      return tokenPda(el, hash);
    });
    const accounts = await connection.getMultipleAccountsInfo(addresses, "confirmed");
    registered += accounts.filter(Boolean).length;
  }
  return { registered, total: tokens.length, complete: registered === tokens.length };
}

async function setStatus(electionId, status) {
  try {
    await program.methods
      .setStatus(status)
      .accountsPartial({ election: electionPda(electionId), authority })
      .rpc();
  } catch (e) {
    throw wrap(e);
  }
}

// Isang transaksyon, lahat o wala. Hanggang 6 na posisyon.
async function vote(electionId, token, selections) {
  if (!selections?.length || selections.length > 6)
    throw Object.assign(new Error("Hanggang 6 na posisyon bawat transaksyon."), { status: 400 });
  try {
    const el = electionPda(electionId);
    const h = hashToken(token);
    const ixs = [];
    for (const s of selections) {
      const pos = positionPda(el, s.positionIndex);
      ixs.push(
        await program.methods
          .castVote(h, s.candidateIndex)
          .accountsPartial({
            election: el,
            position: pos,
            tokenRecord: tokenPda(el, h),
            voteRecord: votePda(pos, h),
            authority,
            systemProgram: sys,
          })
          .instruction()
      );
    }
    const signature = await send(ixs);
    return { signature, explorer: explorerTx(signature) };
  } catch (e) {
    throw wrap(e);
  }
}

async function results(electionId) {
  try {
    const el = electionPda(electionId);
    const e = await program.account.election.fetch(el);
    const positions = await Promise.all(
      Array.from({ length: e.positionCount }, async (_, i) => {
        const p = await program.account.position.fetch(positionPda(el, i));
        return {
          index: i,
          name: p.name,
          candidates: p.candidates.map((name, k) => ({ name, votes: p.votes[k].toNumber() })),
        };
      })
    );
    return {
      title: e.title,
      status: e.status,
      tokensRegistered: e.tokenCount,
      positions,
      electionAddress: el.toBase58(),
    };
  } catch (e) {
    throw wrap(e);
  }
}

module.exports = {
  authority,
  programId: program.programId,
  electionPda,
  balance,
  estimate,
  createElection,
  registerTokens,
  verifyTokens,
  setStatus,
  vote,
  results,
  explorerTx,
};
```

=== FILE: server/src/db.js ===
```
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lrn TEXT NOT NULL UNIQUE,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  given_name TEXT,
  grade TEXT NOT NULL,
  section TEXT NOT NULL,
  sex TEXT NOT NULL DEFAULT 'Male',
  active INTEGER NOT NULL DEFAULT 1,
  has_voted INTEGER NOT NULL DEFAULT 0,
  voted_at TEXT
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  partylist TEXT,
  grade TEXT,
  section TEXT,
  photo_url TEXT
);

CREATE TABLE IF NOT EXISTS voting_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  grade TEXT,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Resibo ng botante. Walang laman na nagsasabi kung ano ang pinili.
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  solana_signature TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS election_archive (
  election_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  school_year TEXT NOT NULL DEFAULT '',
  period_start TEXT NOT NULL DEFAULT '',
  period_end TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  election_address TEXT NOT NULL,
  results_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const studentColumns = db.pragma("table_info(students)");
if (!studentColumns.some((column) => column.name === "active")) {
  db.exec("ALTER TABLE students ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

const archiveColumns = db.pragma("table_info(election_archive)");
for (const [name, definition] of [
  ["school_year", "TEXT NOT NULL DEFAULT ''"],
  ["period_start", "TEXT NOT NULL DEFAULT ''"],
  ["period_end", "TEXT NOT NULL DEFAULT ''"],
  ["announcement", "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!archiveColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE election_archive ADD COLUMN ${name} ${definition}`);
  }
}

module.exports = db;
```

=== FILE: server/src/index.js ===
```
require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const settings = require("./settings");
const { requireAdmin } = require("./auth");

const { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PORT } = process.env;
if (!JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Kulang ang .env");

if (!db.prepare("SELECT 1 FROM admins LIMIT 1").get()) {
  db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(
    ADMIN_EMAIL.toLowerCase(),
    bcrypt.hashSync(ADMIN_PASSWORD, 10)
  );
  console.log("Nagawa ang unang admin:", ADMIN_EMAIL);
}
if (settings.get("status") === null) settings.set("status", "pending");
if (settings.get("title") === null) settings.set("title", "SSLG Election 2026");
if (settings.get("school_year") === null) settings.set("school_year", "SY 2026-2027");
if (settings.get("period_start") === null) settings.set("period_start", "");
if (settings.get("period_end") === null) settings.set("period_end", "");
if (settings.get("announcement") === null) settings.set("announcement", "");

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const admin = db
    .prepare("SELECT * FROM admins WHERE email = ?")
    .get(String(email ?? "").toLowerCase());
  if (!admin || !bcrypt.compareSync(String(password ?? ""), admin.password_hash)) {
    return res.status(401).json({ error: "Maling email o password." });
  }
  const token = jwt.sign({ sub: admin.id, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, email: admin.email });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id, email FROM admins WHERE id = ?").get(req.adminId));
});

app.use("/api/admin", requireAdmin, require("./routes/admin"));
app.use("/api/admin", requireAdmin, require("./routes/blockchain"));
app.use("/api/vote", require("./routes/voter"));
app.use("/api/public", require("./routes/public"));

app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "May error sa server." });
});

app.listen(PORT || 4000, "127.0.0.1", () =>
  console.log(`API ready sa http://127.0.0.1:${PORT || 4000}`)
);
```

=== FILE: server/src/routes/admin.js ===
```
const crypto = require("crypto");
const express = require("express");
const { parse } = require("csv-parse/sync");
const db = require("../db");
const settings = require("../settings");

const router = express.Router();

function fail(res, status, error) {
  return res.status(status).json({ error });
}

function clean(value) {
  return String(value ?? "").trim();
}

function published() {
  const status = settings.get("status", "pending");
  return Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(status);
}

function assertUnlocked(res) {
  if (!published()) return true;
  fail(res, 409, "Naka-lock na ito dahil naka-publish na ang election.");
  return false;
}

function sections() {
  return db
    .prepare(
      `SELECT grade, section, COUNT(*) AS count
       FROM students
       GROUP BY grade, section
       ORDER BY grade, section`
    )
    .all();
}

function activeValue(value, fallback = null) {
  if (value === true || value === 1 || value === "1" || value === "active") return 1;
  if (value === false || value === 0 || value === "0" || value === "inactive") return 0;
  return fallback;
}

function election() {
  const positions = db.prepare("SELECT * FROM positions ORDER BY sort_order, id").all();
  const candidates = db
    .prepare("SELECT * FROM candidates ORDER BY full_name COLLATE NOCASE")
    .all();

  return positions.map((position) => ({
    ...position,
    candidates: candidates.filter((candidate) => candidate.position_id === position.id),
  }));
}

function uniqueCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const exists = db.prepare("SELECT 1 FROM voting_tokens WHERE code = ?").get(code);
    if (!exists) return code;
  }
  throw new Error("Hindi makagawa ng unique token.");
}

router.get("/stats", (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS n FROM students").get().n;
  const activeStudents = db.prepare("SELECT COUNT(*) AS n FROM students WHERE active = 1").get().n;
  const voted = db.prepare("SELECT COUNT(*) AS n FROM students WHERE has_voted = 1 AND active = 1").get().n;
  const positions = db.prepare("SELECT COUNT(*) AS n FROM positions").get().n;
  const candidates = db.prepare("SELECT COUNT(*) AS n FROM candidates").get().n;
  const tokens = db.prepare("SELECT COUNT(*) AS n FROM voting_tokens").get().n;
  const usedTokens = db.prepare("SELECT COUNT(*) AS n FROM voting_tokens WHERE used = 1").get().n;

  res.json({
    students,
    activeStudents,
    voted,
    turnout: activeStudents ? Math.round((voted / activeStudents) * 100) : 0,
    positions,
    candidates,
    tokens,
    usedTokens,
    status: settings.get("status", "pending"),
    published: published(),
  });
});

router.get("/students", (req, res) => {
  const where = [];
  const params = {};

  if (req.query.search) {
    params.search = `%${clean(req.query.search)}%`;
    where.push("(lrn LIKE @search OR last_name LIKE @search OR first_name LIKE @search OR given_name LIKE @search)");
  }
  if (req.query.grade) {
    params.grade = clean(req.query.grade);
    where.push("grade = @grade");
  }
  if (req.query.section) {
    params.section = clean(req.query.section);
    where.push("section = @section");
  }
  if (req.query.status === "voted") where.push("has_voted = 1");
  if (req.query.status === "not") where.push("has_voted = 0");
  if (req.query.active === "1") where.push("active = 1");
  if (req.query.active === "0") where.push("active = 0");

  const sql = `
    SELECT *
    FROM students
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY grade, section, last_name COLLATE NOCASE, first_name COLLATE NOCASE
    LIMIT 500
  `;

  res.json({ students: db.prepare(sql).all(params), sections: sections() });
});

router.post("/students", (req, res) => {
  if (!assertUnlocked(res)) return;

  const student = {
    lrn: clean(req.body.lrn),
    last_name: clean(req.body.last_name),
    first_name: clean(req.body.first_name),
    given_name: clean(req.body.given_name),
    grade: clean(req.body.grade),
    section: clean(req.body.section),
    sex: clean(req.body.sex) || "Male",
  };

  if (!student.lrn || !student.last_name || !student.first_name || !student.grade || !student.section) {
    return fail(res, 400, "Kumpletuhin ang LRN, pangalan, grade, at section.");
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO students (lrn, last_name, first_name, given_name, grade, section, sex)
         VALUES (@lrn, @last_name, @first_name, @given_name, @grade, @section, @sex)`
      )
      .run(student);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(res, 409, "May existing student na may ganitong LRN.");
    throw err;
  }
});

router.post("/students/upload", (req, res) => {
  if (!assertUnlocked(res)) return;

  const csv = String(req.body.csv ?? "");
  if (!csv.trim()) return fail(res, 400, "Walang laman ang CSV.");

  let rows;
  try {
    rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true });
  } catch {
    return fail(res, 400, "Hindi mabasa ang CSV.");
  }

  const insert = db.prepare(
    `INSERT INTO students (lrn, last_name, first_name, given_name, grade, section, sex)
     VALUES (@lrn, @last_name, @first_name, @given_name, @grade, @section, @sex)
     ON CONFLICT(lrn) DO UPDATE SET
       last_name = excluded.last_name,
       first_name = excluded.first_name,
       given_name = excluded.given_name,
       grade = excluded.grade,
       section = excluded.section,
       sex = excluded.sex`
  );

  const save = db.transaction((items) => {
    let count = 0;
    for (const row of items) {
      const student = {
        lrn: clean(row.lrn),
        last_name: clean(row.last_name),
        first_name: clean(row.first_name),
        given_name: clean(row.given_name),
        grade: clean(row.grade),
        section: clean(row.section),
        sex: clean(row.sex) || "Male",
      };
      if (!student.lrn || !student.last_name || !student.first_name || !student.grade || !student.section) continue;
      insert.run(student);
      count += 1;
    }
    return count;
  });

  res.json({ count: save(rows) });
});

router.post("/students/reset", (_req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("UPDATE students SET has_voted = 0, voted_at = NULL").run();
  db.prepare("UPDATE voting_tokens SET used = 0, used_at = NULL").run();
  res.json({ updated: info.changes });
});

router.delete("/students", (_req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM students").run();
  res.json({ deleted: info.changes });
});

router.delete("/students/:id", (req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM students WHERE id = ?").run(Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Hindi nakita ang student.");
  res.json({ deleted: info.changes });
});

router.patch("/students/:id/active", (req, res) => {
  const active = activeValue(req.body?.active);
  if (active === null) return fail(res, 400, "Pumili ng valid na active status.");
  const info = db.prepare("UPDATE students SET active = ? WHERE id = ?").run(active, Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Hindi nakita ang student.");
  res.json({ active: Boolean(active) });
});

router.get("/election", (_req, res) => {
  res.json({ positions: election(), published: published(), status: settings.get("status", "pending") });
});

router.get("/election/settings", (_req, res) => {
  res.json({
    title: settings.get("title", "SSLG Election"),
    schoolYear: settings.get("school_year", ""),
    periodStart: settings.get("period_start", ""),
    periodEnd: settings.get("period_end", ""),
    announcement: settings.get("announcement", ""),
    published: published(),
  });
});

router.put("/election/settings", (req, res) => {
  const title = clean(req.body?.title);
  const schoolYear = clean(req.body?.schoolYear);
  const periodStart = clean(req.body?.periodStart);
  const periodEnd = clean(req.body?.periodEnd);
  const announcement = clean(req.body?.announcement);

  if (!title || title.length > 64) return fail(res, 400, "Kailangan ang election title at hanggang 64 characters lang.");
  if (schoolYear.length > 32) return fail(res, 400, "Hanggang 32 characters lang ang school year.");
  if (announcement.length > 500) return fail(res, 400, "Hanggang 500 characters lang ang announcement.");
  if ((periodStart && !Number.isFinite(Date.parse(periodStart))) || (periodEnd && !Number.isFinite(Date.parse(periodEnd)))) {
    return fail(res, 400, "Maling petsa o oras sa election period.");
  }
  if (periodStart && periodEnd && Date.parse(periodStart) > Date.parse(periodEnd)) {
    return fail(res, 400, "Dapat mauna ang simula ng election period sa pagtatapos nito.");
  }
  if (published() && (title !== settings.get("title", "") || schoolYear !== settings.get("school_year", ""))) {
    return fail(res, 409, "Hindi na mababago ang title at school year pagkatapos ma-publish sa blockchain.");
  }

  settings.set("title", title);
  settings.set("school_year", schoolYear);
  settings.set("period_start", periodStart);
  settings.set("period_end", periodEnd);
  settings.set("announcement", announcement);
  res.json({ ok: true });
});

router.post("/positions", (req, res) => {
  if (!assertUnlocked(res)) return;

  const name = clean(req.body.name);
  if (!name || name.length > 32) return fail(res, 400, "Ang position name ay kailangan at hanggang 32 characters lang.");

  const next = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM positions").get().n;
  const info = db.prepare("INSERT INTO positions (name, sort_order) VALUES (?, ?)").run(name, next);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete("/positions/:id", (req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM positions WHERE id = ?").run(Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Hindi nakita ang position.");
  res.json({ deleted: info.changes });
});

router.post("/candidates", (req, res) => {
  if (!assertUnlocked(res)) return;

  const candidate = {
    full_name: clean(req.body.full_name),
    position_id: Number(req.body.position_id),
    partylist: clean(req.body.partylist),
    grade: clean(req.body.grade),
    section: clean(req.body.section),
    photo_url: clean(req.body.photo_url),
  };

  if (!candidate.full_name || candidate.full_name.length > 40) {
    return fail(res, 400, "Ang candidate name ay kailangan at hanggang 40 characters lang.");
  }
  if (!db.prepare("SELECT 1 FROM positions WHERE id = ?").get(candidate.position_id)) {
    return fail(res, 400, "Pumili ng valid na position.");
  }

  const info = db
    .prepare(
      `INSERT INTO candidates (full_name, position_id, partylist, grade, section, photo_url)
       VALUES (@full_name, @position_id, @partylist, @grade, @section, @photo_url)`
    )
    .run(candidate);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/candidates/:id", (req, res) => {
  if (!assertUnlocked(res)) return;

  const candidate = {
    id: Number(req.params.id),
    full_name: clean(req.body.full_name),
    position_id: Number(req.body.position_id),
    partylist: clean(req.body.partylist),
    grade: clean(req.body.grade),
    section: clean(req.body.section),
    photo_url: clean(req.body.photo_url),
  };

  if (!candidate.full_name || candidate.full_name.length > 40) {
    return fail(res, 400, "Ang candidate name ay kailangan at hanggang 40 characters lang.");
  }
  if (!db.prepare("SELECT 1 FROM positions WHERE id = ?").get(candidate.position_id)) {
    return fail(res, 400, "Pumili ng valid na position.");
  }

  const info = db
    .prepare(
      `UPDATE candidates
       SET full_name = @full_name, position_id = @position_id, partylist = @partylist,
           grade = @grade, section = @section, photo_url = @photo_url
       WHERE id = @id`
    )
    .run(candidate);
  if (!info.changes) return fail(res, 404, "Hindi nakita ang candidate.");
  res.json({ updated: info.changes });
});

router.delete("/candidates/:id", (req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM candidates WHERE id = ?").run(Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Hindi nakita ang candidate.");
  res.json({ deleted: info.changes });
});

router.get("/tokens", (req, res) => {
  const where = [];
  const params = {};

  if (req.query.grade) {
    params.grade = clean(req.query.grade);
    where.push("COALESCE(s.grade, t.grade) = @grade");
  }
  if (req.query.section) {
    params.section = clean(req.query.section);
    where.push("s.section = @section");
  }
  if (req.query.status === "unused") where.push("t.used = 0");
  if (req.query.status === "used") where.push("t.used = 1");
  if (req.query.active === "1") where.push("(t.student_id IS NULL OR s.active = 1)");
  if (req.query.active === "0") where.push("s.active = 0");

  const sql = `
    SELECT
      t.id, t.code, t.grade, t.used, t.used_at, t.student_id,
      s.last_name, s.first_name, s.given_name, s.section, s.active AS student_active,
      COALESCE(s.grade, t.grade) AS grade
    FROM voting_tokens t
    LEFT JOIN students s ON s.id = t.student_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY COALESCE(s.grade, t.grade), s.section, s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE, t.id
    LIMIT 1000
  `;

  const tokens = db.prepare(sql).all(params);
  const unused = db
    .prepare(
      `SELECT COUNT(*) AS n FROM voting_tokens t
       JOIN students s ON s.id = t.student_id AND s.active = 1
       WHERE t.used = 0`
    )
    .get().n;
  res.json({ tokens, unused, sections: sections() });
});

router.post("/tokens/generate", (req, res) => {
  if (!assertUnlocked(res)) return;

  let students;
  if (req.body.mode === "name") {
    const studentId = Number(req.body.student_id);
    students = db.prepare("SELECT * FROM students WHERE id = ? AND active = 1").all(studentId);
  } else {
    const grade = clean(req.body.grade);
    const section = clean(req.body.section);
    if (!grade) return fail(res, 400, "Pumili ng grade.");
    students = db
      .prepare(
        `SELECT *
         FROM students
         WHERE active = 1 AND grade = ? AND (? = '' OR section = ?)
         ORDER BY section, last_name COLLATE NOCASE, first_name COLLATE NOCASE`
      )
      .all(grade, section, section);
  }

  if (!students.length) return fail(res, 404, "Walang nahanap na student.");

  const hasToken = db.prepare("SELECT 1 FROM voting_tokens WHERE student_id = ?");
  const insert = db.prepare("INSERT INTO voting_tokens (code, student_id, grade) VALUES (?, ?, ?)");
  const save = db.transaction((items) => {
    let created = 0;
    for (const student of items) {
      if (hasToken.get(student.id)) continue;
      insert.run(uniqueCode(), student.id, student.grade);
      created += 1;
    }
    return created;
  });

  res.status(201).json({ created: save(students) });
});

router.delete("/tokens/unused", (_req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM voting_tokens WHERE used = 0").run();
  res.json({ deleted: info.changes });
});

router.delete("/tokens/:id", (req, res) => {
  if (!assertUnlocked(res)) return;
  const info = db.prepare("DELETE FROM voting_tokens WHERE id = ? AND used = 0").run(Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Hindi nakita ang unused token.");
  res.json({ deleted: info.changes });
});

module.exports = router;
```

=== FILE: server/src/routes/blockchain.js ===
```
const express = require("express");
const db = require("../db");
const settings = require("../settings");

const router = express.Router();

let job = { running: false, step: "", done: 0, total: 0, error: "" };

function fail(res, status, error) {
  return res.status(status).json({ error });
}

function cleanError(error) {
  const message = error?.message ?? String(error);
  if (message.includes("@anchor-lang/core")) {
    return "Kulang ang package na @anchor-lang/core. Patakbuhin: cd ~/anhs-chain-vote/server && npm install @anchor-lang/core";
  }
  return message;
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
    .prepare("SELECT election_id, title, election_address, results_json, archived_at FROM election_archive ORDER BY election_id DESC")
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
  if (job.running) return fail(res, 409, "May kasalukuyang publish job.");

  let chain;
  try {
    chain = loadChain();
  } catch (error) {
    return next(error);
  }

  const positions = localPositions();
  const tokens = unusedTokens();
  if (!positions.length) return fail(res, 400, "Magdagdag muna ng position.");
  if (positions.some((position) => position.candidates.length === 0)) {
    return fail(res, 400, "Bawat position ay kailangan ng kahit isang candidate.");
  }
  if (!tokens.length) return fail(res, 400, "Mag-generate muna ng unused voting tokens.");

  const id = electionId();
  settings.set("expected_token_count", tokens.length);
  const title = settings.get("title", "SSLG Election 2026");
  job = { running: true, step: "Creating election", done: 0, total: tokens.length, error: "" };
  res.status(202).json({ ok: true, job });

  setImmediate(async () => {
    try {
      const electionAddress = await chain.createElection(id, title, positions);
      settings.set("election_address", electionAddress);

      job = { ...job, step: "Registering tokens" };
      const done = await chain.registerTokens(tokens, (count) => {
        job = { ...job, done: count };
      });

      settings.set("status", "published");
      job = { running: false, step: "Done", done, total: tokens.length, error: "" };
    } catch (error) {
      job = { ...job, running: false, error: cleanError(error) };
    }
  });
});

router.post(
  "/blockchain/new-election",
  asyncRoute(async (_req, res) => {
    if (job.running) return fail(res, 409, "May kasalukuyang publish job.");
    if (!isPublished()) return fail(res, 409, "Walang naka-publish na election na maisasara at maa-archive.");

    const previousId = Number(settings.get("election_id"));
    if (!Number.isSafeInteger(previousId) || previousId <= 0) {
      return fail(res, 409, "Hindi makita ang ID ng kasalukuyang election.");
    }

    const chain = loadChain();
    const result = await chain.results(previousId);
    if (result.status !== 2) {
      return fail(res, 409, "Kailangan munang isara ang kasalukuyang election sa blockchain.");
    }

    const nextId = Math.max(Date.now(), previousId + 1);
    if (!Number.isSafeInteger(nextId)) return fail(res, 500, "Hindi makagawa ng bagong election ID.");

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
    })();

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
    if (!nextStatus) return fail(res, 400, "Maling status.");
    if (!isPublished()) return fail(res, 409, "Hindi pa naka-publish ang election.");

    const chain = loadChain();
    if (status === "open") {
      const result = await chain.results(electionId());
      const expectedTokens = expectedTokenCount();
      const registeredTokens = await chain.verifyTokens(electionId(), unusedTokens());
      if (result.tokensRegistered !== expectedTokens || !registeredTokens.complete) {
        return fail(
          res,
          409,
          `Hindi mabubuksan ang botohan: ${registeredTokens.registered} sa ${registeredTokens.total} eligible token ang registered sa blockchain.`
        );
      }
    }
    await chain.setStatus(electionId(), nextStatus);
    settings.set("status", status);
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
```

=== FILE: server/src/routes/public.js ===
```
const express = require("express");
const settings = require("../settings");

const router = express.Router();

function statusName(value) {
  return ["pending", "open", "closed"][value] ?? "pending";
}

router.get("/election", async (_req, res, next) => {
  const status = settings.get("status", "pending");
  const published =
    Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(status);
  const data = {
    title: settings.get("title", "SSLG Election"),
    schoolYear: settings.get("school_year", ""),
    periodStart: settings.get("period_start", ""),
    periodEnd: settings.get("period_end", ""),
    announcement: settings.get("announcement", ""),
    published,
    status,
    electionAddress: settings.get("election_address", ""),
  };

  if (!published) return res.json({ ...data, positions: [] });

  try {
    const chain = require("../chain");
    const result = await chain.results(Number(settings.get("election_id")));
    data.status = statusName(result.status);
    data.electionAddress = result.electionAddress;
    settings.set("status", data.status);
    settings.set("election_address", result.electionAddress);
    const positions = result.positions.map((position) => ({
      ...position,
      candidates: position.candidates.map(({ name, votes }) =>
        result.status === 2 ? { name, votes } : { name }
      ),
    }));
    res.json({
      ...data,
      positions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

=== FILE: server/src/routes/voter.js ===
```
const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");
const settings = require("../settings");
const chain = require("../chain");
const { requireVoter } = require("../auth");

const router = express.Router();
const fail = (status, message) => Object.assign(new Error(message), { status });
const published = () => {
  const status = settings.get("status", "pending");
  return Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(status);
};
const isOpen = () => published() && settings.get("status", "pending") === "open";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(len) {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

// ---------- rate limit sa maling token ----------
const failures = new Map();
const recent = (ip) => (failures.get(ip) ?? []).filter((t) => Date.now() - t < 60_000);
const recordFail = (ip) => failures.set(ip, [...recent(ip), Date.now()]);

// Keep this ordering aligned with the positions and candidates published on-chain.
function ballotPositions() {
  const positions = db.prepare("SELECT id, name FROM positions ORDER BY sort_order, id").all();
  const candidates = db.prepare(
    "SELECT id, full_name, partylist, grade, section, photo_url, position_id FROM candidates ORDER BY full_name COLLATE NOCASE"
  ).all();
  return positions.map((position, index) => ({
    index,
    ...position,
    candidates: candidates.filter((candidate) => candidate.position_id === position.id),
  }));
}

function loadToken(tokenId) {
  const row = db.prepare(
    `SELECT t.*, s.active AS student_active
     FROM voting_tokens t
     LEFT JOIN students s ON s.id = t.student_id
     WHERE t.id = ?`
  ).get(tokenId);
  if (!row) throw fail(401, "Hindi nahanap ang token.");
  if (row.used) throw fail(409, "Nagamit na ang token na ito.");
  if (!row.student_id || !row.student_active) throw fail(403, "Hindi active ang student. Makipag-ugnayan sa COMELEC.");
  return row;
}

// ---------- login ----------
router.post("/login", (req, res) => {
  if (recent(req.ip).length >= 10)
    throw fail(429, "Masyadong maraming maling subok. Maghintay ng isang minuto.");

  const code = String(req.body?.token ?? "").trim().toUpperCase();
  const row = /^[A-Z0-9]{8}$/.test(code)
    ? db.prepare(
        `SELECT t.*, s.active AS student_active
         FROM voting_tokens t
         LEFT JOIN students s ON s.id = t.student_id
         WHERE t.code = ?`
      ).get(code)
    : null;
  if (!row) {
    recordFail(req.ip);
    throw fail(401, "Maling token. Pakisuri at subukan ulit.");
  }
  if (row.used) throw fail(409, "Nagamit na ang token na ito.");
  if (!row.student_id || !row.student_active) throw fail(403, "Hindi active ang student. Makipag-ugnayan sa COMELEC.");
  if (!isOpen()) throw fail(403, "Hindi pa bukas ang botohan.");

  const token = jwt.sign({ sub: row.id, role: "voter" }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// ---------- ballot ----------
router.get("/ballot", requireVoter, (req, res) => {
  loadToken(req.tokenId);
  if (!isOpen()) throw fail(403, "Hindi pa bukas o sarado na ang botohan.");
  res.json({ title: settings.get("title", ""), positions: ballotPositions() });
});

// ---------- submit ----------
const inflight = new Set();
const progress = new Map(); // tokenId -> { chunkIndex: signature | null }

router.post("/submit", requireVoter, async (req, res, next) => {
  const tokenId = req.tokenId;
  if (inflight.has(tokenId)) return next(fail(409, "Pinoproseso pa ang boto mo. Maghintay."));
  inflight.add(tokenId);

  try {
    const row = loadToken(tokenId);
    if (!isOpen()) throw fail(403, "Sarado na ang botohan.");

    // 1. Gawing index ng blockchain ang pinili
    const sel = req.body?.selections ?? {};
    const chainSel = [];
    for (const p of ballotPositions()) {
      if (!Object.prototype.hasOwnProperty.call(sel, String(p.id)))
        throw fail(400, `Walang napili para sa ${p.name}.`);
      const v = sel[p.id];
      if (v === null) continue; // abstain: walang ipinapadala
      const idx = p.candidates.findIndex((c) => c.id === Number(v));
      if (idx === -1) throw fail(400, "Maling candidate.");
      chainSel.push({ positionIndex: p.index, candidateIndex: idx });
    }

    // 2. Ipadala sa blockchain (max 6 posisyon kada transaksyon)
    const electionId = Number(settings.get("election_id"));
    if (!Number.isSafeInteger(electionId) || electionId <= 0)
      throw fail(503, "Hindi makita ang naka-publish na election.");
    const done = progress.get(tokenId) ?? {};
    for (let i = 0; i * 6 < chainSel.length; i++) {
      if (i in done) continue;
      try {
        const r = await chain.vote(electionId, row.code, chainSel.slice(i * 6, i * 6 + 6));
        done[i] = r.signature;
      } catch (e) {
        if (e.status !== 409) {
          progress.set(tokenId, done);
          throw e;
        }
        done[i] = null; // nasa blockchain na pala ang boto na ito
      }
      progress.set(tokenId, done);
    }

    // 3. I-update ang database. Walang isinusulat na pinili ng botante.
    const signatures = Object.values(done).filter(Boolean);
    const receiptCode = makeCode(12);
    const tokenHash = crypto.createHmac("sha256", process.env.TOKEN_PEPPER).update(row.code).digest("hex");

    db.transaction(() => {
      db.prepare("UPDATE voting_tokens SET used = 1, used_at = datetime('now') WHERE id = ?").run(tokenId);
      if (row.student_id)
        db.prepare("UPDATE students SET has_voted = 1, voted_at = datetime('now') WHERE id = ?").run(row.student_id);
      db.prepare("INSERT INTO receipts (receipt_code, token_hash, solana_signature) VALUES (?, ?, ?)").run(
        receiptCode,
        tokenHash,
        signatures[0] ?? null
      );
    })();
    progress.delete(tokenId);

    res.json({ receiptCode, signatures, explorers: signatures.map(chain.explorerTx) });
  } catch (e) {
    // Huwag ilabas sa botante ang teknikal na error (hal. kulang ang SOL)
    if (e.status === 402 || e.status === 502) {
      console.error(e);
      return next(fail(503, "May pansamantalang problema sa sistema. Subukan ulit mamaya o ipaalam sa COMELEC."));
    }
    next(e);
  } finally {
    inflight.delete(tokenId);
  }
});

module.exports = router;
```

=== FILE: server/src/settings.js ===
```
const db = require("./db");

const get = (key, fallback = null) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
};

const set = (key, value) =>
  db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, String(value));

module.exports = { get, set };
```

=== FILE: web/src/App.jsx ===
```
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getToken, logout } from "./api";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Students from "./pages/Students.jsx";
import Candidates from "./pages/Candidates.jsx";
import Tokens from "./pages/Tokens.jsx";
import TokensPrint from "./pages/TokensPrint.jsx";
import Blockchain from "./pages/Blockchain.jsx";
import Vote from "./pages/Vote.jsx";
import Home from "./pages/Home.jsx";

function Guard() {
  return getToken() ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

function Shell() {
  const nav = useNavigate();
  return (
    <div className="shell">
      <aside>
        <h2>ANHS Vote</h2>
        <NavLink to="/admin" end>Dashboard</NavLink>
        <NavLink to="/admin/students">Students</NavLink>
        <NavLink to="/admin/candidates">Candidates</NavLink>
        <NavLink to="/admin/tokens">Tokens</NavLink>
        <NavLink to="/admin/blockchain">Blockchain</NavLink>
        <NavLink to="/" end>Public page</NavLink>
        <button className="link" onClick={() => { logout(); nav("/admin/login"); }}>Logout</button>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vote" element={<Vote />} />
        <Route path="/admin/login" element={<Login />} />
        <Route element={<Guard />}>
          <Route path="/admin/tokens/print" element={<TokensPrint />} />
          <Route path="/admin" element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="candidates" element={<Candidates />} />
            <Route path="tokens" element={<Tokens />} />
            <Route path="blockchain" element={<Blockchain />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

=== FILE: web/src/api.js ===
```
export const getToken = () => localStorage.getItem("adminToken");
export const logout = () => localStorage.removeItem("adminToken");

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith("/admin") && path !== "/admin/login") {
    logout();
    window.location.href = "/admin/login";
  }
  if (!res.ok) throw new Error(data.error || "May error.");
  return data;
}
```

=== FILE: web/src/main.jsx ===
```
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

=== FILE: web/src/pages/Blockchain.jsx ===
```
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";

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
    if (!confirm("I-publish sa blockchain? Hindi na mababago ang positions, candidates, at tokens pagkatapos.")) return;
    try {
      await api("/admin/blockchain/publish", { method: "POST" });
      setM(null);
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  async function setStatus(status) {
    if (status === "closed" && !confirm("Isara ang botohan? Hindi na ito mabubuksan ulit.")) return;
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
    if (!confirm("Ise-save ang resulta ng saradong election at magsimula ng panibago? Mananatili ang lumang resulta sa blockchain. Mare-reset ang Used status ng mga token at boto ng mga estudyante para makaboto sila sa bagong election.")) return;
    setBusy(true);
    try {
      const result = await api("/admin/blockchain/new-election", { method: "POST" });
      setM({ type: "ok", text: `Na-archive ang election #${result.archivedElectionId}. Ihanda at i-publish ang bagong election.` });
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
      setM({ type: "ok", text: "Na-save ang election information." });
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  if (!d) return (<><h1>Blockchain</h1><Msg m={m} /></>);
  const j = d.job;
  const low = d.balance < d.estimate.publish;

  return (
    <>
      <h1>Blockchain</h1>
      <Msg m={m} />

      <div className="card">
        <h2>Wallet at Program (Solana Devnet)</h2>
        <p>Wallet: <a href={addr(d.wallet)} target="_blank" rel="noreferrer" className="mono">{short(d.wallet)}</a> · Balance: <b>{d.balance} SOL</b></p>
        <p>Program: <a href={addr(d.programId)} target="_blank" rel="noreferrer" className="mono">{short(d.programId)}</a></p>
      </div>

      {metadata && (
        <form className="card grid election-settings" onSubmit={saveMetadata}>
          <div>
            <div className="eyebrow">PUBLIC ELECTION PAGE</div>
            <h2>Election information</h2>
            <p className="muted">Impormasyong makikita ng publiko. Hindi awtomatikong magbubukas o magsasara ang botohan ayon sa petsa.</p>
          </div>
          <div className="form-grid">
            <label>Election title
              <input required maxLength={64} value={metadata.title} disabled={metadata.published} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} />
            </label>
            <label>School year
              <input required maxLength={32} placeholder="SY 2026-2027" value={metadata.schoolYear} disabled={metadata.published} onChange={(e) => setMetadata({ ...metadata, schoolYear: e.target.value })} />
            </label>
            <label>Simula ng election period
              <input type="datetime-local" value={metadata.periodStart} onChange={(e) => setMetadata({ ...metadata, periodStart: e.target.value })} />
            </label>
            <label>Katapusan ng election period
              <input type="datetime-local" value={metadata.periodEnd} onChange={(e) => setMetadata({ ...metadata, periodEnd: e.target.value })} />
            </label>
          </div>
          <label>Announcement / school update
            <textarea rows={3} maxLength={500} placeholder="Ilagay ang paalala o update mula sa COMELEC…" value={metadata.announcement} onChange={(e) => setMetadata({ ...metadata, announcement: e.target.value })} />
          </label>
          {metadata.published && <small className="muted">Naka-lock na ang title at school year dahil naka-publish na ang election sa blockchain.</small>}
          <div><button type="submit">I-save ang impormasyon</button></div>
        </form>
      )}

      {!d.published ? (
        <div className="card">
          <h2>I-publish ang election</h2>
          <p>Positions: <b>{d.positions}</b> · Unused tokens na ire-register: <b>{d.tokens}</b></p>
          <p>
            Tinatayang gastos sa pag-publish: <b>{d.estimate.publish} SOL</b><br />
            Reserba para sa mga boto (kung bumoto ang lahat): <b>{d.estimate.allVoters} SOL</b> (≈ {d.estimate.perVoter} SOL kada botante)
          </p>
          {low && <div className="msg err">Kulang ang SOL ng wallet para sa pag-publish. Kumuha sa faucet.solana.com.</div>}
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Siguraduhing kumpleto na ang positions, candidates, at tokens. Hindi na ito mababago pagkatapos mag-publish.
            Huwag mag-save ng file sa server habang nagpa-publish.
          </p>

          {j.running && (
            <>
              <p><b>{j.step}</b> {j.done}/{j.total}</p>
              <progress value={j.done} max={j.total || 1} style={{ width: "100%" }} />
            </>
          )}
          {j.error && <div className="msg err">{j.error}</div>}

          <button onClick={publish} disabled={j.running || !d.positions || !d.tokens || low}>
            {j.running ? "Nagpa-publish..." : "Publish to Blockchain"}
          </button>
        </div>
      ) : (
        <div className="card">
          <h2>Naka-publish na ✔</h2>
          <p>Election: <a href={addr(d.electionAddress)} target="_blank" rel="noreferrer" className="mono">{short(d.electionAddress)}</a></p>
          <p>Status sa blockchain: <b>{NAMES[d.chainStatus]}</b></p>
          {Number.isInteger(d.tokensRegistered) && d.tokensRegistered !== d.totalTokens && (
            <div className="msg err">
              {d.tokensRegistered} sa {d.totalTokens} token ang registered sa blockchain. Hindi makakaboto ang mga token na wala sa bilang na ito.
              {d.chainStatus === 1 && " Sarado na ang election na ito sa blockchain bago makapagsimula ng bagong election at mairehistro ang mga token."}
            </div>
          )}
          <div className="row">
            <button disabled={busy || d.chainStatus !== 0 || d.tokensRegistered !== d.totalTokens} onClick={() => setStatus("open")}>Buksan ang botohan</button>
            <button className="danger" disabled={busy || d.chainStatus === 2} onClick={() => setStatus("closed")}>Isara ang botohan</button>
          </div>
          {d.chainStatus === 2 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "#6b7280", fontSize: 14 }}>
                Hindi na mabubuksan muli ang saradong election. Maaari kang magsimula ng bago; mase-save muna ang lumang resulta at mananatili ito sa blockchain.
              </p>
              <button className="ghost" disabled={busy} onClick={startNewElection}>Simulan ang bagong election</button>
            </div>
          )}
          <small style={{ color: "#6b7280" }}>Pasulong lang ang status: Pending → Open → Closed. Hindi na ito mababawi.</small>
        </div>
      )}
    </>
  );
}
```

=== FILE: web/src/pages/Candidates.jsx ===
```
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";

function CandidateForm({ initial, positions, students, onSave, onCancel }) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  function pick(e) {
    const s = students.find((x) => String(x.id) === e.target.value);
    if (!s) return;
    setV({
      ...v,
      full_name: [s.first_name, s.given_name, s.last_name].filter(Boolean).join(" "),
      grade: s.grade,
      section: s.section,
    });
  }

  return (
    <form className="card grid" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <select onChange={pick} defaultValue="">
        <option value="">— Pumili mula sa students (optional) —</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.grade} {s.section})</option>
        ))}
      </select>
      <select value={v.position_id} onChange={set("position_id")} required>
        {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input placeholder="Full name (max 40 characters)" value={v.full_name} onChange={set("full_name")} required />
      <div className="row">
        <input placeholder="Partylist" value={v.partylist} onChange={set("partylist")} />
        <input placeholder="Grade" value={v.grade} onChange={set("grade")} />
        <input placeholder="Section" value={v.section} onChange={set("section")} />
      </div>
      <input placeholder="Photo URL (optional, http/https)" value={v.photo_url} onChange={set("photo_url")} />
      <div className="row">
        <button type="submit">I-save</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const blank = (positions) => ({
  full_name: "", position_id: positions[0]?.id ?? "", partylist: "", grade: "", section: "", photo_url: "",
});

export default function Candidates() {
  const [data, setData] = useState({ positions: [], published: false });
  const [students, setStudents] = useState([]);
  const [posName, setPosName] = useState("");
  const [editing, setEditing] = useState(null); // "new" o candidate id
  const [m, setM] = useState(null);

  const load = useCallback(async () => setData(await api("/admin/election")), []);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
    api("/admin/students").then((d) => setStudents(d.students)).catch(() => {});
  }, [load]);

  async function run(fn, ok) {
    try {
      await fn();
      setM({ type: "ok", text: ok });
      await load();
      return true;
    } catch (e) {
      setM({ type: "err", text: e.message });
      return false;
    }
  }

  async function save(v, id) {
    const body = { ...v, position_id: Number(v.position_id) };
    const ok = await run(
      () => api(id ? `/admin/candidates/${id}` : "/admin/candidates", { method: id ? "PUT" : "POST", body }),
      id ? "Candidate updated." : "Candidate added."
    );
    if (ok) setEditing(null);
  }

  const locked = data.published;
  const P = data.positions;

  return (
    <>
      <h1>Candidates at Positions</h1>
      <Msg m={m} />
      {locked && <div className="msg err">Naka-lock na ito dahil naka-publish na ang election sa blockchain.</div>}

      {!locked && (
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("/admin/positions", { method: "POST", body: { name: posName } }), "Position added.")) setPosName("");
          }}
        >
          <input placeholder="Bagong posisyon (max 32 characters)" value={posName} onChange={(e) => setPosName(e.target.value)} />
          <button type="submit">Add position</button>
          {P.length > 0 && <button type="button" className="ghost" onClick={() => setEditing("new")}>+ Add candidate</button>}
        </form>
      )}

      {editing === "new" && (
        <CandidateForm initial={blank(P)} positions={P} students={students} onSave={(v) => save(v)} onCancel={() => setEditing(null)} />
      )}

      {P.map((p) => (
        <div className="card" key={p.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>{p.name} <span className="badge">{p.candidates.length} candidate(s)</span></h2>
            {!locked && (
              <button className="danger small" onClick={() => confirm(`Burahin ang "${p.name}" at ang mga candidate nito?`) && run(() => api(`/admin/positions/${p.id}`, { method: "DELETE" }), "Position deleted.")}>
                Delete position
              </button>
            )}
          </div>

          {p.candidates.map((c) =>
            editing === c.id ? (
              <CandidateForm
                key={c.id}
                initial={{ ...c, partylist: c.partylist ?? "", grade: c.grade ?? "", section: c.section ?? "", photo_url: c.photo_url ?? "" }}
                positions={P}
                students={students}
                onSave={(v) => save(v, c.id)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="row" key={c.id} style={{ justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
                <span><b>{c.full_name}</b> <small style={{ color: "#6b7280" }}>{[c.partylist, c.grade, c.section].filter(Boolean).join(" · ")}</small></span>
                {!locked && (
                  <span className="row">
                    <button className="ghost small" onClick={() => setEditing(c.id)}>Edit</button>
                    <button className="danger small" onClick={() => confirm("Burahin?") && run(() => api(`/admin/candidates/${c.id}`, { method: "DELETE" }), "Candidate deleted.")}>Delete</button>
                  </span>
                )}
              </div>
            )
          )}
        </div>
      ))}
      {P.length === 0 && <p>Wala pang posisyon. Magdagdag muna sa itaas.</p>}
    </>
  );
}
```

=== FILE: web/src/pages/Dashboard.jsx ===
```
import { useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [r, setR] = useState(null);
  const [m, setM] = useState(null);
  const [electionFilter, setElectionFilter] = useState("current");
  const [positionFilter, setPositionFilter] = useState("all");

  useEffect(() => {
    api("/admin/stats").then(setS).catch((e) => setM({ type: "err", text: e.message }));
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = () =>
      api("/admin/results")
        .then((x) => !stop && setR(x))
        .catch((e) => !stop && setM({ type: "err", text: e.message }));
    tick();
    const t = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const items = s && [
    ["Active students", s.activeStudents], ["Voted", s.voted], ["Turnout", s.turnout + "%"],
    ["Positions", s.positions], ["Candidates", s.candidates],
    ["Tokens", s.tokens], ["Used tokens", s.usedTokens],
  ];

  const selectedElection = electionFilter === "current"
    ? (r?.published ? { ...r, electionId: "current" } : null)
    : r?.archivedElections?.find((election) => String(election.electionId) === electionFilter);
  const visiblePositions = selectedElection?.positions?.filter(
    (position) => positionFilter === "all" || String(position.index) === positionFilter
  ) ?? [];

  return (
    <>
      <h1>Dashboard</h1>
      <Msg m={m} />
      {s && (
        <>
          <div className="cards">
            {items.map(([label, val]) => (
              <div className="card stat" key={label}><b>{val}</b><span>{label}</span></div>
            ))}
          </div>
          <div className="card">
            Election status: <b>{s.status}</b> · Blockchain: <b>{s.published ? "Naka-publish" : "Hindi pa naka-publish"}</b>
            {r?.published && <> · Tokens na naka-register sa blockchain: <b>{r.tokensRegistered}</b></>}
          </div>
        </>
      )}

      {(r?.published || r?.archivedElections?.length > 0) && (
        <>
          <div className="report-filters">
            <div>
              <div className="eyebrow">ADMIN REPORT</div>
              <h2>Mga resulta mula sa blockchain</h2>
            </div>
            <label>Election
              <select value={electionFilter} onChange={(e) => { setElectionFilter(e.target.value); setPositionFilter("all"); }}>
                <option value="current" disabled={!r.published}>{r.title || "Kasalukuyang election"} (kasalukuyan)</option>
                {r.archivedElections?.map((election) => (
                  <option key={election.electionId} value={election.electionId}>
                    {election.title}{election.schoolYear ? ` · ${election.schoolYear}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>Position
              <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
                <option value="all">Lahat ng position</option>
                {selectedElection?.positions?.map((position) => (
                  <option key={position.index} value={position.index}>{position.name}</option>
                ))}
              </select>
            </label>
          </div>
          {electionFilter === "current" && r.published && <h2>Resulta (mula sa blockchain)</h2>}
          {electionFilter === "current" && !r.published && <div className="card muted">Wala pang resulta ang kasalukuyang election.</div>}
          {visiblePositions.map((p) => {
            const total = p.candidates.reduce((a, c) => a + c.votes, 0);
            return (
              <div className="card" key={p.index}>
                <h2>{p.name} <span className="badge">{total} boto</span></h2>
                {p.candidates.map((c) => (
                  <div key={c.name} style={{ marginBottom: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
                      <span>{c.name}</span><b>{c.votes}</b>
                    </div>
                    <div className="bar"><div style={{ width: total ? (c.votes / total) * 100 + "%" : "0%" }} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {electionFilter !== "current" && selectedElection && (
        <section>
          <h2>Resulta ng nakaraang election: {selectedElection.title}</h2>
          <div className="card">
            <p>
              {selectedElection.schoolYear && <>School year: <b>{selectedElection.schoolYear}</b> · </>}
              Election ID: <b>{selectedElection.electionId}</b> · Status: <b>Closed</b> · Registered tokens: <b>{selectedElection.tokensRegistered}</b>
            </p>
            <p>
              <a href={`https://explorer.solana.com/address/${selectedElection.electionAddress}?cluster=devnet`} target="_blank" rel="noreferrer">
                Tingnan ang election sa Solana Explorer
              </a>
            </p>
          </div>
          {visiblePositions.map((position) => {
            const total = position.candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
            return (
              <div className="card" key={`${selectedElection.electionId}-${position.index}`}>
                <h2>{position.name} <span className="badge">{total} boto</span></h2>
                {position.candidates.map((candidate) => (
                  <div key={candidate.name} style={{ marginBottom: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
                      <span>{candidate.name}</span><b>{candidate.votes}</b>
                    </div>
                    <div className="bar"><div style={{ width: total ? (candidate.votes / total) * 100 + "%" : "0%" }} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
```

=== FILE: web/src/pages/Home.jsx ===
```
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STATUS = {
  pending: { label: "Hindi pa nagsisimula", tone: "pending" },
  published: { label: "Nakahanda", tone: "pending" },
  open: { label: "Bukas na ang botohan", tone: "open" },
  closed: { label: "Sarado na ang botohan", tone: "closed" },
};

function formatDate(value) {
  if (!value) return "Hindi itinakda";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Home() {
  const [election, setElection] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const response = await fetch("/api/public/election");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Hindi ma-load ang election update.");
        if (!stopped) {
          setElection(data);
          setError("");
          setUpdatedAt(new Date());
        }
      } catch (err) {
        if (!stopped) setError(err.message);
      }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const status = STATUS[election?.status] ?? STATUS.pending;

  return (
    <main className="public-page">
      <header className="public-nav">
        <Link className="brand" to="/">ANHS <span>VOTE</span></Link>
        {election?.status === "open" ? (
          <Link className="button-link ghost" to="/vote">Pumunta sa pagboto</Link>
        ) : (
          <span className="button-link ghost" aria-disabled="true">{status.label}</span>
        )}
      </header>

      <section className="public-hero">
        <div className="eyebrow">ANHS · SSLG ELECTION</div>
        <h1>{election?.title || "ANHS School Election"}</h1>
        <p className="hero-subtitle">
          {election?.schoolYear || "Opisyal na election updates"}
        </p>
        {election?.status === "open" && (
          <div className="status-pill live"><span /> BUKAS ANG BOTOHAN</div>
        )}
        {election?.status !== "open" && (
          <div className={`status-pill ${status.tone}`}>{status.label}</div>
        )}
        <div className="hero-actions">
          {election?.status === "open" && <Link className="button-link primary" to="/vote">Bumoto ngayon</Link>}
          {election?.electionAddress && (
            <a
              className="button-link ghost"
              href={`https://explorer.solana.com/address/${election.electionAddress}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              I-verify sa blockchain
            </a>
          )}
        </div>
      </section>

      {error && <div className="public-alert">{error}</div>}

      <section className="public-grid">
        <article className="public-card">
          <div className="eyebrow">ELECTION PERIOD</div>
          <h2>Mahahalagang petsa</h2>
          <dl className="date-list">
            <div><dt>Simula</dt><dd>{formatDate(election?.periodStart)}</dd></div>
            <div><dt>Katapusan</dt><dd>{formatDate(election?.periodEnd)}</dd></div>
          </dl>
          <p className="muted">Ang aktuwal na pagbukas at pagsara ay inaanunsyo ng COMELEC.</p>
        </article>

        <article className="public-card announcement">
          <div className="eyebrow">PAALALA MULA SA COMELEC</div>
          <h2>Election update</h2>
          <p>{election?.announcement || "Wala pang bagong anunsyo."}</p>
        </article>
      </section>

      {election?.status === "open" && (
        <section className="public-callout">
          <div>
            <div className="eyebrow">NAKABOTO KA NA BA?</div>
            <h2>Bukas na ang botohan.</h2>
            <p>Gamitin ang iyong voting token para makaboto. Huwag ibahagi ang token sa iba.</p>
          </div>
          <Link className="button-link primary" to="/vote">Simulan ang pagboto</Link>
        </section>
      )}

      {election?.published && election?.status !== "closed" && election.positions?.length > 0 && (
        <section className="public-results">
          <div className="eyebrow">NAKA-RECORD SA BLOCKCHAIN</div>
          <h2>Mga posisyon at kandidato</h2>
          <p className="muted">Makikita ang pangalan ng kandidato habang bukas ang botohan; hindi ipinapakita ang tally hangga't hindi ito nagsasara.</p>
          <div className="public-grid">
            {election.positions.map((position) => (
              <article className="public-card" key={position.index}>
                <h3>{position.name}</h3>
                <ul className="candidate-list">
                  {position.candidates.map((candidate) => <li key={candidate.name}>{candidate.name}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {election?.status === "closed" && election.positions?.length > 0 && (
        <section className="public-results">
          <div className="eyebrow">RESULTA MULA SA BLOCKCHAIN</div>
          <h2>Opisyal na resulta</h2>
          <p className="muted">Lalabas lamang ang bilang ng boto matapos magsara ang botohan.</p>
          <div className="public-grid">
            {election.positions.map((position) => {
              const total = position.candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
              return (
                <article className="public-card" key={position.index}>
                  <div className="result-heading">
                    <h3>{position.name}</h3><span className="badge">{total} boto</span>
                  </div>
                  {position.candidates.map((candidate) => (
                    <div className="result-row" key={candidate.name}>
                      <div><span>{candidate.name}</span><b>{candidate.votes}</b></div>
                      <div className="bar"><div style={{ width: total ? `${(candidate.votes / total) * 100}%` : "0%" }} /></div>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer className="public-footer">
        <span>ANHS Blockchain Voting</span>
        <span>{updatedAt ? `Huling update ${updatedAt.toLocaleTimeString()}` : "Kinukuha ang pinakabagong update…"}</span>
      </footer>
    </main>
  );
}
```

=== FILE: web/src/pages/Login.jsx ===
```
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Msg } from "../ui";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [m, setM] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      const d = await api("/admin/login", { method: "POST", body: { email, password } });
      localStorage.setItem("adminToken", d.token);
      nav("/admin");
    } catch (err) {
      setM({ type: "err", text: err.message });
    }
  }

  return (
    <form className="center card grid" onSubmit={submit}>
      <h1>Admin Login</h1>
      <Msg m={m} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
```

=== FILE: web/src/pages/Students.jsx ===
```
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";

const empty = { lrn: "", last_name: "", first_name: "", given_name: "", grade: "Grade 7", section: "", sex: "Male" };

export default function Students() {
  const [data, setData] = useState({ students: [], sections: [] });
  const [f, setF] = useState({ search: "", grade: "", section: "", status: "", active: "" });
  const [form, setForm] = useState(empty);
  const [m, setM] = useState(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setData(await api(`/admin/students?${q}`));
  }, [f]);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
  }, [load]);

  async function run(fn, ok) {
    try {
      const r = await fn();
      setM({ type: "ok", text: typeof ok === "function" ? ok(r) : ok });
      await load();
      return true;
    } catch (e) {
      setM({ type: "err", text: e.message });
      return false;
    }
  }

  const grades = [...new Set(data.sections.map((s) => s.grade))];
  const sections = [...new Set(data.sections.filter((s) => !f.grade || s.grade === f.grade).map((s) => s.section))];
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (await run(() => api("/admin/students", { method: "POST", body: form }), "Student added.")) setForm(empty);
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const csv = await file.text();
    e.target.value = "";
    run(() => api("/admin/students/upload", { method: "POST", body: { csv } }), (r) => `${r.count} student(s) uploaded.`);
  }

  return (
    <>
      <h1>Students</h1>
      <Msg m={m} />

      <form className="card grid" onSubmit={add}>
        <h2>Magdagdag ng student</h2>
        <div className="row">
          <input placeholder="LRN" value={form.lrn} onChange={setField("lrn")} />
          <input placeholder="Last name" value={form.last_name} onChange={setField("last_name")} />
          <input placeholder="First name" value={form.first_name} onChange={setField("first_name")} />
          <input placeholder="Given/Middle name" value={form.given_name} onChange={setField("given_name")} />
        </div>
        <div className="row">
          <input placeholder="Grade (hal. Grade 7)" value={form.grade} onChange={setField("grade")} />
          <input placeholder="Section" value={form.section} onChange={setField("section")} />
          <select value={form.sex} onChange={setField("sex")}><option>Male</option><option>Female</option></select>
          <button type="submit">Add</button>
        </div>
      </form>

      <div className="card">
        <h2>CSV upload</h2>
        <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 14 }}>
          Mga column: lrn, last_name, first_name, given_name, grade, section, sex
        </p>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={upload} />
      </div>

      <div className="row">
        <input placeholder="Hanapin (pangalan o LRN)" value={f.search} onChange={setFilter("search")} />
        <select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, section: "" })}>
          <option value="">Lahat ng grade</option>{grades.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select value={f.section} onChange={setFilter("section")}>
          <option value="">Lahat ng section</option>{sections.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.status} onChange={setFilter("status")}>
          <option value="">Lahat</option><option value="voted">Nakaboto</option><option value="not">Hindi pa</option>
        </select>
        <select value={f.active} onChange={setFilter("active")}>
          <option value="">Lahat ng student status</option><option value="1">Active</option><option value="0">Inactive</option>
        </select>
        <button className="ghost" onClick={() => confirm("I-reset ang voted status ng lahat?") && run(() => api("/admin/students/reset", { method: "POST" }), "Na-reset ang lahat.")}>
          Reset voted
        </button>
        <button className="danger" onClick={() => confirm("Burahin LAHAT ng students?") && run(() => api("/admin/students", { method: "DELETE" }), "Nabura ang lahat ng students.")}>
          Delete all
        </button>
      </div>

      <table>
        <thead><tr><th>LRN</th><th>Pangalan</th><th>Grade</th><th>Section</th><th>Sex</th><th>Student status</th><th>Voted</th><th></th></tr></thead>
        <tbody>
          {data.students.map((s) => (
            <tr key={s.id}>
              <td>{s.lrn}</td>
              <td>{s.last_name}, {s.first_name} {s.given_name ?? ""}</td>
              <td>{s.grade}</td><td>{s.section}</td><td>{s.sex}</td>
              <td><span className={`badge ${s.active ? "unused" : "used"}`}>{s.active ? "Active" : "Inactive"}</span></td>
              <td><span className={`badge ${s.has_voted ? "used" : "unused"}`}>{s.has_voted ? "Oo" : "Hindi"}</span></td>
              <td className="row">
                <button className="ghost small" onClick={() => run(
                  () => api(`/admin/students/${s.id}/active`, { method: "PATCH", body: { active: !s.active } }),
                  s.active ? "Student marked inactive; voting is blocked." : "Student marked active."
                )}>{s.active ? "Set inactive" : "Set active"}</button>
                <button className="danger small" onClick={() => confirm("Burahin?") && run(() => api(`/admin/students/${s.id}`, { method: "DELETE" }), "Student deleted.")}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#6b7280" }}>Ipinapakita ang unang 500 na tumutugma.</p>
    </>
  );
}
```

=== FILE: web/src/pages/Tokens.jsx ===
```
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";

export default function Tokens() {
  const [data, setData] = useState({ tokens: [], unused: 0, sections: [] });
  const [students, setStudents] = useState([]);
  const [f, setF] = useState({ grade: "", section: "", status: "", active: "" });
  const [g, setG] = useState({ mode: "grade", student_id: "", grade: "", section: "" });
  const [m, setM] = useState(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setData(await api(`/admin/tokens?${q}`));
  }, [f]);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
  }, [load]);

  useEffect(() => {
    api("/admin/students").then((d) => setStudents(d.students)).catch(() => {});
  }, []);

  async function run(fn, ok) {
    try {
      const r = await fn();
      setM({ type: "ok", text: typeof ok === "function" ? ok(r) : ok });
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  const grades = [...new Set(data.sections.map((s) => s.grade))];
  const gSections = [...new Set(data.sections.filter((s) => !g.grade || s.grade === g.grade).map((s) => s.section))];
  const fSections = [...new Set(data.sections.filter((s) => !f.grade || s.grade === f.grade).map((s) => s.section))];
  const printQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

  return (
    <>
      <h1>Tokens</h1>
      <Msg m={m} />

      <div className="card grid">
        <h2>Mag-generate ng token</h2>
        <div className="row">
          <select value={g.mode} onChange={(e) => setG({ ...g, mode: e.target.value })}>
            <option value="grade">Buong grade o section</option>
            <option value="name">Isang estudyante</option>
          </select>

          {g.mode === "grade" ? (
            <>
              <select value={g.grade} onChange={(e) => setG({ ...g, grade: e.target.value, section: "" })}>
                <option value="">Pumili ng grade</option>{grades.map((x) => <option key={x}>{x}</option>)}
              </select>
              <select value={g.section} onChange={(e) => setG({ ...g, section: e.target.value })}>
                <option value="">Lahat ng section</option>{gSections.map((x) => <option key={x}>{x}</option>)}
              </select>
            </>
          ) : (
            <select value={g.student_id} onChange={(e) => setG({ ...g, student_id: e.target.value })}>
              <option value="">Pumili ng estudyante</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.grade} {s.section})</option>)}
            </select>
          )}

          <button onClick={() => run(() => api("/admin/tokens/generate", { method: "POST", body: g }), (r) => `${r.created} token(s) generated.`)}>
            Generate
          </button>
        </div>
        <small style={{ color: "#6b7280" }}>Isang token lang kada estudyante. Hindi na makakapag-generate pagkatapos i-publish sa blockchain.</small>
      </div>

      <div className="row">
        <select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, section: "" })}>
          <option value="">Lahat ng grade</option>{grades.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
          <option value="">Lahat ng section</option>{fSections.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Lahat</option><option value="unused">Unused</option><option value="used">Used</option>
        </select>
        <select value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })}>
          <option value="">Active at inactive</option><option value="1">Active students</option><option value="0">Inactive students</option>
        </select>
        <a href={`/admin/tokens/print?${printQuery}`} target="_blank" rel="noreferrer"><button className="ghost">Print</button></a>
        <button className="danger" onClick={() => confirm(`Burahin ang ${data.unused} unused token(s)?`) && run(() => api("/admin/tokens/unused", { method: "DELETE" }), (r) => `${r.deleted} unused token(s) deleted.`)}>
          Delete unused
        </button>
      </div>

      <table>
        <thead><tr><th>Estudyante</th><th>Grade</th><th>Section</th><th>Student status</th><th>Token</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data.tokens.map((t) => (
            <tr key={t.id}>
              <td>{t.last_name ? `${t.last_name}, ${t.first_name}` : "—"}</td>
              <td>{t.grade}</td><td>{t.section ?? ""}</td>
              <td>{t.student_active === null ? "—" : <span className={`badge ${t.student_active ? "unused" : "used"}`}>{t.student_active ? "Active" : "Inactive"}</span>}</td>
              <td className="mono">{t.code}</td>
              <td><span className={`badge ${t.used ? "used" : "unused"}`}>{t.used ? "Used" : "Unused"}</span></td>
              <td>{!t.used && <button className="danger small" onClick={() => run(() => api(`/admin/tokens/${t.id}`, { method: "DELETE" }), "Token deleted.")}>Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

=== FILE: web/src/pages/TokensPrint.jsx ===
```
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function TokensPrint() {
  const [sp] = useSearchParams();
  const [tokens, setTokens] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ status: "unused", ...Object.fromEntries(sp) });
    api(`/admin/tokens?${q}`).then((d) => setTokens(d.tokens)).catch((e) => setErr(e.message));
  }, [sp]);

  return (
    <div style={{ padding: 20 }}>
      <div className="no-print row">
        <button onClick={() => window.print()}>Print</button>
        <span>{tokens.length} token(s)</span>
        {err && <span className="msg err">{err}</span>}
      </div>
      <div className="print-grid">
        {tokens.map((t) => (
          <div className="ticket" key={t.id}>
            <b>{t.last_name ? `${t.last_name}, ${t.first_name}` : "—"}</b>
            <br /><small>{t.grade} {t.section ?? ""}</small>
            <div className="code mono">{t.code}</div>
            <small>ANHS Voting System. Isang beses lang magagamit. Huwag ipakita sa iba.</small>
          </div>
        ))}
      </div>
    </div>
  );
}
```

=== FILE: web/src/pages/Vote.jsx ===
```
import { useEffect, useState } from "react";
import { vapi, vToken } from "../voter";
import { Msg } from "../ui";

const read = (k, fb) => {
  try { return JSON.parse(sessionStorage.getItem(k)) ?? fb; } catch { return fb; }
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export default function Vote() {
  const [stage, setStage] = useState(read("receipt", null) ? "receipt" : vToken() ? "loading" : "login");
  const [code, setCode] = useState("");
  const [ballot, setBallot] = useState(null);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(() => read("selections", {}));
  const [receipt, setReceipt] = useState(() => read("receipt", null));
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    sessionStorage.clear();
    setSel({}); setReceipt(null); setBallot(null); setStep(0); setCode(""); setM(null);
    setStage("login");
  }

  async function loadBallot() {
    try {
      const b = await vapi("/ballot");
      setBallot(b);
      setStage("ballot");
    } catch (e) {
      sessionStorage.removeItem("voterToken");
      setStage("login");
      setM({ type: "err", text: e.message });
    }
  }

  useEffect(() => {
    if (stage === "loading") loadBallot();
    // eslint-disable-next-line
  }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true); setM(null);
    try {
      const d = await vapi("/login", { method: "POST", body: { token: code } });
      sessionStorage.setItem("voterToken", d.token);
      sessionStorage.removeItem("selections"); // walang matitirang pinili ng nauna
      setSel({}); setStep(0);
      await loadBallot();
    } catch (err) {
      setM({ type: "err", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function choose(posId, value) {
    const next = { ...sel, [posId]: value };
    setSel(next);
    sessionStorage.setItem("selections", JSON.stringify(next));
  }

  async function submit() {
    if (!confirm("Final na ba ang boto mo? Hindi na ito mababago.")) return;
    setBusy(true); setM(null);
    try {
      const r = await vapi("/submit", { method: "POST", body: { selections: sel } });
      sessionStorage.removeItem("voterToken");
      sessionStorage.removeItem("selections");
      sessionStorage.setItem("receipt", JSON.stringify(r));
      setReceipt(r);
      setStage("receipt");
    } catch (e) {
      if (e.status === 401 || e.status === 409) {
        sessionStorage.removeItem("voterToken");
        setStage("login");
      }
      setM({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const P = ballot?.positions ?? [];
  const pos = P[step];
  const chosen = pos && has(sel, pos.id);
  const last = step === P.length - 1;

  return (
    <div className="vwrap">
      <h1>{ballot?.title || "ANHS Blockchain Voting"}</h1>
      <Msg m={m} />

      {stage === "loading" && <p>Sandali lang...</p>}

      {stage === "login" && (
        <form className="card grid" onSubmit={login}>
          <h2>Ilagay ang iyong token</h2>
          <input
            className="mono"
            maxLength={8}
            autoFocus
            placeholder="8-character token"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" disabled={busy || code.length !== 8}>Magpatuloy</button>
          <small style={{ color: "#6b7280" }}>Isang beses lang magagamit ang token. Huwag ipakita sa iba.</small>
        </form>
      )}

      {stage === "ballot" && !pos && (
        <div className="card">Walang posisyon sa ballot. Ipaalam sa COMELEC.
          <div className="row"><button className="ghost" onClick={reset}>Bumalik</button></div>
        </div>
      )}

      {stage === "ballot" && pos && (
        <>
          <div className="steps">Posisyon {step + 1} ng {P.length}</div>
          <div className="card">
            <h2>{pos.name}</h2>
            {pos.candidates.map((c) => (
              <div key={c.id} className={`opt ${sel[pos.id] === c.id ? "sel" : ""}`} onClick={() => choose(pos.id, c.id)}>
                {c.photo_url && <img src={c.photo_url} alt="" />}
                <div>
                  <b>{c.full_name}</b>
                  <small>{[c.partylist, c.grade, c.section].filter(Boolean).join(" · ")}</small>
                </div>
              </div>
            ))}
            <div className={`opt ${chosen && sel[pos.id] === null ? "sel" : ""}`} onClick={() => choose(pos.id, null)}>
              <div><b>Abstain</b><small>Walang iboboto sa posisyong ito</small></div>
            </div>
          </div>
          <div className="row">
            <button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Bumalik</button>
            <button disabled={!chosen} onClick={() => (last ? setStage("review") : setStep(step + 1))}>
              {last ? "I-review" : "Susunod"}
            </button>
            <button className="ghost" onClick={reset}>Kanselahin</button>
          </div>
        </>
      )}

      {stage === "review" && (
        <>
          <div className="card">
            <h2>I-review ang boto mo</h2>
            {P.map((p) => {
              const c = p.candidates.find((x) => x.id === sel[p.id]);
              return (
                <div className="row" key={p.id} style={{ justifyContent: "space-between" }}>
                  <span>{p.name}</span><b>{c ? c.full_name : "Abstain"}</b>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="ghost" disabled={busy} onClick={() => { setStep(0); setStage("ballot"); }}>Baguhin</button>
            <button disabled={busy} onClick={submit}>{busy ? "Ipinapadala sa blockchain..." : "I-submit ang boto"}</button>
          </div>
        </>
      )}

      {stage === "receipt" && receipt && (
        <div className="card receipt">
          <h2>Salamat sa pagboto! ✔</h2>
          <p>Ang resibo mo:</p>
          <div className="code mono">{receipt.receiptCode}</div>
          {receipt.explorers.length ? (
            receipt.explorers.map((u, i) => (
              <p key={u}>
                <a href={u} target="_blank" rel="noreferrer">
                  Tingnan sa blockchain{receipt.explorers.length > 1 ? ` (${i + 1})` : ""}
                </a>
              </p>
            ))
          ) : (
            <p>Abstain ka sa lahat ng posisyon, kaya walang transaksyon sa blockchain.</p>
          )}
          <small style={{ color: "#6b7280" }}>I-screenshot o isulat ang resibo.</small>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="ghost" onClick={() => window.print()}>Print</button>
            <button onClick={reset}>Tapos na</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

=== FILE: web/src/styles.css ===
```
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #17243a; background: #f4f7fb; }
h1 { margin: 0 0 16px; font-size: clamp(24px, 3vw, 32px); letter-spacing: -.03em; }
h2 { font-size: 18px; margin: 0 0 8px; }
a { color: #2563eb; }

.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
aside { background: #101d34; padding: 20px 14px; display: flex; flex-direction: column; gap: 6px; }
aside h2 { color: #fff; margin-bottom: 12px; }
aside a { color: #d1d5db; text-decoration: none; padding: 8px 10px; border-radius: 8px; }
aside a.active { background: #2563eb; color: #fff; }
aside .link { margin-top: auto; background: none; color: #9ca3af; text-align: left; padding: 8px 10px; }
main { padding: clamp(16px, 3vw, 32px); overflow-x: auto; }

.card { background: #fff; border: 1px solid #e4eaf2; border-radius: 14px; padding: 18px; margin-bottom: 16px; box-shadow: 0 2px 8px #1a36500a; }
.grid { display: grid; gap: 8px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat b { display: block; font-size: 28px; }
.stat span { color: #6b7280; font-size: 13px; }

input, select, textarea, button { font: inherit; padding: 9px 11px; border-radius: 9px; border: 1px solid #d1dbe8; background: #fff; }
input:focus, select:focus, textarea:focus { outline: 3px solid #2563eb26; border-color: #4b83e5; }
button { background: #2563eb; color: #fff; border: 0; cursor: pointer; }
button.ghost { background: #e5e7eb; color: #111827; }
button.danger { background: #dc2626; }
button.small { padding: 4px 10px; font-size: 13px; }

table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
th { background: #f9fafb; color: #6b7280; }
.mono { font-family: ui-monospace, monospace; letter-spacing: 1px; font-weight: 600; }

.msg { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
.msg.ok { background: #ecfdf5; color: #065f46; }
.msg.err { background: #fef2f2; color: #991b1b; }
.badge { padding: 2px 8px; border-radius: 99px; font-size: 12px; background: #e5e7eb; }
.badge.used { background: #fee2e2; color: #991b1b; }
.badge.unused { background: #dcfce7; color: #166534; }

.center { max-width: 380px; margin: 80px auto; }

.print-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ticket { border: 1px dashed #6b7280; border-radius: 8px; padding: 12px; background: #fff; break-inside: avoid; }
.ticket .code { font-size: 26px; text-align: center; margin: 8px 0; }
.ticket small { color: #6b7280; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff; }
}

.bar { background: #e5e7eb; border-radius: 99px; height: 8px; overflow: hidden; }
.bar > div { background: #2563eb; height: 100%; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.vwrap { max-width: 640px; margin: 24px auto; padding: 0 16px; }
.opt { display: flex; gap: 12px; align-items: center; border: 2px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; cursor: pointer; margin-bottom: 8px; }
.opt.sel { border-color: #2563eb; background: #eff6ff; }
.opt img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.opt small { color: #6b7280; display: block; }
.steps { color: #6b7280; margin-bottom: 8px; }
.receipt { text-align: center; }
.receipt .code { font-size: 28px; letter-spacing: 3px; margin: 8px 0; }

.eyebrow { color: #58708f; font-size: 11px; font-weight: 800; letter-spacing: .12em; margin-bottom: 7px; }
.muted { color: #687b94; }
.election-settings { gap: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.form-grid label, .election-settings > label, .report-filters label { display: grid; gap: 6px; color: #435671; font-size: 13px; font-weight: 700; }
.report-filters { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 14px; padding: 18px; margin: 12px 0 18px; border: 1px solid #e4eaf2; border-radius: 14px; background: #fff; }
.report-filters select { min-width: 210px; }

.public-page { max-width: 1100px; min-height: 100vh; margin: 0 auto; padding: 0 24px; }
.public-nav { height: 72px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e3eaf3; }
.brand { color: #17243a; font-weight: 900; letter-spacing: .04em; text-decoration: none; }
.brand span { color: #2563eb; }
.button-link { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; padding: 9px 16px; border-radius: 10px; text-decoration: none; font-weight: 700; }
.button-link.primary { color: #fff; background: #245fe5; box-shadow: 0 6px 14px #245fe533; }
.button-link.ghost { color: #23416a; background: #eaf0f8; }
.public-hero { position: relative; margin: 28px 0 20px; padding: clamp(28px, 7vw, 68px); overflow: hidden; border-radius: 24px; color: #fff; background: linear-gradient(120deg, #142848, #245fe5); }
.public-hero:after { position: absolute; top: -150px; right: -70px; width: 400px; height: 400px; border: 1px solid #ffffff20; border-radius: 50%; box-shadow: 0 0 0 55px #ffffff0b, 0 0 0 110px #ffffff08; content: ""; }
.public-hero .eyebrow { color: #b8d1ff; }
.public-hero h1 { max-width: 700px; margin-bottom: 8px; font-size: clamp(32px, 6vw, 56px); }
.hero-subtitle { margin: 0 0 20px; color: #d5e2ff; font-size: 18px; }
.hero-actions { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.hero-actions .ghost { color: #fff; background: #ffffff20; }
.status-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 99px; color: #1e3659; background: #e6edf7; font-size: 13px; font-weight: 800; }
.status-pill.open { color: #086444; background: #d9f8ea; }
.status-pill.closed { color: #674b14; background: #fff0c6; }
.status-pill.live { position: relative; z-index: 1; color: #064d34; background: #d9f8ea; }
.status-pill.live span { width: 8px; height: 8px; border-radius: 50%; background: #13a56f; box-shadow: 0 0 0 4px #13a56f22; }
.public-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.public-card { padding: 22px; border: 1px solid #e4eaf2; border-radius: 16px; background: #fff; box-shadow: 0 2px 8px #1a36500a; }
.public-card h2 { font-size: 20px; }
.date-list { margin: 16px 0; }
.date-list div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #edf1f6; }
.date-list dt { color: #687b94; }
.date-list dd { margin: 0; font-weight: 700; text-align: right; }
.announcement p { white-space: pre-wrap; line-height: 1.65; }
.public-callout { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 18px; margin: 16px 0; padding: 24px; border: 1px solid #b8ead4; border-radius: 16px; background: #effcf6; }
.public-callout h2 { font-size: 24px; }
.public-results { margin-top: 30px; }
.public-results > h2 { font-size: 26px; }
.candidate-list { display: grid; gap: 8px; padding-left: 20px; color: #435671; }
.result-heading, .result-row > div:first-child { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.result-heading h3 { margin: 0; font-size: 18px; }
.result-row { margin-top: 18px; }
.result-row .bar { margin-top: 8px; height: 7px; }
.public-alert { padding: 12px 16px; border-radius: 10px; color: #8b341d; background: #fff0eb; }
.public-footer { display: flex; justify-content: space-between; gap: 16px; padding: 28px 0; color: #718198; font-size: 12px; }

@media (max-width: 760px) {
  .shell { grid-template-columns: 1fr; }
  aside { position: static; flex-direction: row; align-items: center; overflow-x: auto; padding: 10px; }
  aside h2 { flex: 0 0 auto; margin: 0 10px 0 0; font-size: 16px; }
  aside a, aside .link { flex: 0 0 auto; margin: 0; white-space: nowrap; }
  .public-grid, .form-grid { grid-template-columns: 1fr; }
  .report-filters { align-items: stretch; }
  .report-filters label, .report-filters select { width: 100%; }
}

@media (max-width: 480px) {
  .public-page { padding: 0 14px; }
  .public-nav { height: 60px; }
  .public-nav .button-link { min-height: 38px; padding: 7px 10px; font-size: 13px; }
  .public-footer { flex-direction: column; }
  table { min-width: 720px; }
}
```

=== FILE: web/src/ui.jsx ===
```
export function Msg({ m }) {
  return m ? <div className={`msg ${m.type}`}>{m.text}</div> : null;
}
```

=== FILE: web/src/voter.js ===
```
export const vToken = () => sessionStorage.getItem("voterToken");

export async function vapi(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/vote${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(vToken() ? { Authorization: `Bearer ${vToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || "May error.");
    e.status = res.status;
    throw e;
  }
  return data;
}
```
