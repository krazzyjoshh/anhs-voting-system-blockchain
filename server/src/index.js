require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const settings = require("./settings");
const { requireAdmin } = require("./auth");
const { logError } = require("./errors");

const { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PORT } = process.env;
if (!JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Required .env settings are missing");

if (!db.prepare("SELECT 1 FROM admins LIMIT 1").get()) {
  db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(
    ADMIN_EMAIL.toLowerCase(),
    bcrypt.hashSync(ADMIN_PASSWORD, 10)
  );
  console.log("Initial admin created.");
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
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  const token = jwt.sign({ sub: admin.id, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, email: admin.email });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id, email FROM admins WHERE id = ?").get(req.adminId));
});

// Removed operations return 404 even before admin authentication.
const removed = [
  ["POST", /^\/api\/admin\/students\/reset\/?$/],
  ["DELETE", /^\/api\/admin\/students(?:\/[^/]+)?\/?$/],
  ["PUT", /^\/api\/admin\/candidates\/[^/]+\/?$/],
  ["DELETE", /^\/api\/admin\/(?:candidates|positions|tokens)\/[^/]+\/?$/],
];
app.use((req, res, next) => removed.some(([method, pattern]) => req.method === method && pattern.test(req.path))
  ? res.status(404).json({ error: "Endpoint not found." }) : next());
app.use("/api/admin", requireAdmin, require("./routes/admin"));
app.use("/api/admin", requireAdmin, require("./routes/blockchain"));
app.use("/api/admin", requireAdmin, require("./routes/ledger"));
app.use("/api/vote", require("./routes/voter"));
app.use("/api/public", require("./routes/public"));

app.use((err, _req, res, _next) => {
  if (!err.status) logError("request_failed", err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "A server error occurred.",
    ...(err.code && ["TOKEN_USED", "BALLOT_LOCKED"].includes(err.code) ? { code: err.code } : {}) });
});

if (require.main === module) {
  app.listen(PORT || 4000, "127.0.0.1", () =>
    console.log(`API ready at http://127.0.0.1:${PORT || 4000}`)
  );
}
module.exports = app;
