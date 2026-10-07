const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite"));
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

// Legacy receipts stay unassigned: their election cannot safely be inferred.
const receiptColumns = db.pragma("table_info(receipts)");
for (const [name, definition] of [["election_id", "INTEGER"], ["kind", "TEXT NOT NULL DEFAULT 'legacy'"]]) {
  if (!receiptColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE receipts ADD COLUMN ${name} ${definition}`);
  }
}
db.exec(`
CREATE INDEX IF NOT EXISTS receipts_election ON receipts(election_id);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_token_election ON receipts(election_id, token_hash);
CREATE TABLE IF NOT EXISTS receipt_transactions (
  receipt_id INTEGER NOT NULL REFERENCES receipts(id),
  signature TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  PRIMARY KEY (receipt_id, signature)
);
CREATE TABLE IF NOT EXISTS submission_batches (
  election_id INTEGER NOT NULL,
  token_id INTEGER NOT NULL REFERENCES voting_tokens(id),
  batch_index INTEGER NOT NULL,
  signature TEXT NOT NULL,
  last_valid_block_height INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared', 'confirmed')),
  PRIMARY KEY (election_id, token_id, batch_index)
);
INSERT OR IGNORE INTO receipt_transactions(receipt_id, signature, batch_index)
SELECT id, solana_signature, 0 FROM receipts
WHERE solana_signature IS NOT NULL AND solana_signature != '';
`);

module.exports = db;
