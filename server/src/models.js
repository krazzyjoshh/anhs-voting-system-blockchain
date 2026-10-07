const db = require("./db");
const settings = require("./settings");
const election = require("./election");
function positionCandidates(positionId) {
  // Preserve the existing election query and its case-insensitive ordering.
  return db.prepare("SELECT * FROM candidates ORDER BY full_name COLLATE NOCASE").all()
    .filter((candidate) => candidate.position_id === Number(positionId));
}
const candidatePosition = (candidateId) => {
  const candidate = db.prepare("SELECT * FROM candidates WHERE id = ?").get(candidateId);
  return candidate ? db.prepare("SELECT * FROM positions WHERE id = ?").get(candidate.position_id) : null;
};
const studentToken = (studentId) => db.prepare("SELECT * FROM voting_tokens WHERE student_id = ? ORDER BY id LIMIT 1").get(studentId) ?? null;
const tokenStudent = (tokenId) => {
  const token = db.prepare("SELECT * FROM voting_tokens WHERE id = ?").get(tokenId);
  return token?.student_id ? db.prepare("SELECT * FROM students WHERE id = ?").get(token.student_id) ?? null : null;
};
function localMap() {
  const positions = db.prepare("SELECT id, name FROM positions ORDER BY sort_order, id").all();
  const candidates = db.prepare("SELECT id, full_name, position_id FROM candidates ORDER BY full_name COLLATE NOCASE").all();
  return positions.map((p, index) => ({ id: p.id, name: p.name, index,
    candidates: candidates.filter((c) => c.position_id === p.id).map((c, candidateIndex) => ({ id: c.id, name: c.full_name, index: candidateIndex })) }));
}
function chainMap() {
  const raw = settings.get("chain_map");
  if (!raw) return null;
  const map = JSON.parse(raw);
  return map.electionId === election.electionId() ? map.positions : null;
}
function saveChainMap(positions = localMap()) {
  settings.set("chain_map", JSON.stringify({ electionId: election.electionId(), positions }));
  return positions;
}
async function verifiedChainMap(result = null) {
  const data = result || await election.snapshot();
  const map = chainMap() || localMap();
  if (map.length !== data.positions.length || map.some((p, i) => p.name !== data.positions[i].name ||
      p.candidates.length !== data.positions[i].candidates.length ||
      p.candidates.some((c, k) => c.name !== data.positions[i].candidates[k].name))) {
    throw Object.assign(new Error("The ballot does not match the blockchain. Contact COMELEC."), { status: 503 });
  }
  if (!chainMap()) saveChainMap(map); // Safe backfill only after exact chain comparison.
  return map;
}
async function candidateVotes(candidateId) {
  if (!election.published()) return 0;
  const result = await election.snapshot();
  const map = await verifiedChainMap(result);
  for (const p of map) {
    const c = p.candidates.find((candidate) => candidate.id === Number(candidateId));
    if (c) return result.positions[p.index].candidates[c.index].votes;
  }
  return null;
}
module.exports = { positionCandidates, candidatePosition, candidateVotes, studentToken, tokenStudent, localMap, chainMap, saveChainMap, verifiedChainMap };
