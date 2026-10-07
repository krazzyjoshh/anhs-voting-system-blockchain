const crypto = require("crypto");
const express = require("express");
const { parseStudentsCsv, inspectStudentsCsv } = require("../student-csv");
const db = require("../db");
const settings = require("../settings");
const models = require("../models");

const router = express.Router();

function fail(res, status, error) {
  return res.status(status).json({ error });
}

function clean(value) {
  return String(value ?? "").trim();
}

function published() {
  const status = settings.get("status", "pending");
  return settings.get("publishing") === "1" || Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(status);
}

function assertUnlocked(res) {
  if (!published()) return true;
  fail(res, 409, "This is locked because the election has been published.");
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
  return positions.map((position) => ({
    ...position,
    candidates: models.positionCandidates(position.id),
  }));
}

function uniqueCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const exists = db.prepare("SELECT 1 FROM voting_tokens WHERE code = ?").get(code);
    if (!exists) return code;
  }
  throw new Error("Unable to generate a unique token.");
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
    return fail(res, 400, "Please complete the LRN, name, grade, and section.");
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
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(res, 409, "A student with this LRN already exists.");
    throw err;
  }
});

router.post("/students/preview", (req, res) => {
  if (!assertUnlocked(res)) return;
  try {
    const { students, ...preview } = inspectStudentsCsv(String(req.body.csv ?? ""), req.body.options);
    res.json(preview);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message, details: err.details });
    throw err;
  }
});

router.post("/students/upload", (req, res) => {
  if (!assertUnlocked(res)) return;

  let parsed;
  try {
    parsed = parseStudentsCsv(String(req.body.csv ?? ""), req.body.options);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message, details: err.details });
    throw err;
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
    let inserted = 0, updated = 0;
    const exists = db.prepare("SELECT 1 FROM students WHERE lrn = ?");
    for (const student of items) {
      if (exists.get(student.lrn)) updated++;
      else inserted++;
      insert.run(student);
    }
    return { count: inserted + updated, inserted, updated };
  });

  res.json({ ...save(parsed.students), skipped: parsed.skipped, details: parsed.details });
});

router.patch("/students/:id/active", (req, res) => {
  const active = activeValue(req.body?.active);
  if (active === null) return fail(res, 400, "Select a valid active status.");
  const info = db.prepare("UPDATE students SET active = ? WHERE id = ?").run(active, Number(req.params.id));
  if (!info.changes) return fail(res, 404, "Student not found.");
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

  if (!title || title.length > 64) return fail(res, 400, "An election title is required and must not exceed 64 characters.");
  if (schoolYear.length > 32) return fail(res, 400, "The school year must not exceed 32 characters.");
  if (announcement.length > 500) return fail(res, 400, "The announcement must not exceed 500 characters.");
  if ((periodStart && !Number.isFinite(Date.parse(periodStart))) || (periodEnd && !Number.isFinite(Date.parse(periodEnd)))) {
    return fail(res, 400, "Invalid date or time in the election period.");
  }
  if (periodStart && periodEnd && Date.parse(periodStart) > Date.parse(periodEnd)) {
    return fail(res, 400, "The election period must start before it ends.");
  }
  if (published() && (title !== settings.get("title", "") || schoolYear !== settings.get("school_year", ""))) {
    return fail(res, 409, "The title and school year cannot be changed after publishing to the blockchain.");
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
  if (!name || name.length > 32) return fail(res, 400, "A position name is required and must not exceed 32 characters.");

  const next = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM positions").get().n;
  const info = db.prepare("INSERT INTO positions (name, sort_order) VALUES (?, ?)").run(name, next);
  res.status(201).json({ id: info.lastInsertRowid });
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
    return fail(res, 400, "A candidate name is required and must not exceed 40 characters.");
  }
  if (!db.prepare("SELECT 1 FROM positions WHERE id = ?").get(candidate.position_id)) {
    return fail(res, 400, "Select a valid position.");
  }

  const info = db
    .prepare(
      `INSERT INTO candidates (full_name, position_id, partylist, grade, section, photo_url)
       VALUES (@full_name, @position_id, @partylist, @grade, @section, @photo_url)`
    )
    .run(candidate);
  res.status(201).json({ id: info.lastInsertRowid });
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
    if (!grade) return fail(res, 400, "Select a grade.");
    students = db
      .prepare(
        `SELECT *
         FROM students
         WHERE active = 1 AND grade = ? AND (? = '' OR section = ?)
         ORDER BY section, last_name COLLATE NOCASE, first_name COLLATE NOCASE`
      )
      .all(grade, section, section);
  }

  if (!students.length) return fail(res, 404, "No students found.");

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

module.exports = router;
