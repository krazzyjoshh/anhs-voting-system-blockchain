const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  try {
    const raw = (req.get("authorization") ?? "").replace("Bearer ", "");
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (payload.role !== "admin") throw new Error("not admin");
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Please log in." });
  }
}

function requireVoter(req, res, next) {
  try {
    const raw = (req.get("authorization") ?? "").replace("Bearer ", "");
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (payload.role !== "voter") throw new Error("not voter");
    req.tokenId = payload.sub;
    req.voterElectionId = payload.electionId;
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Log in again with your token." });
  }
}

module.exports = { requireAdmin, requireVoter };
