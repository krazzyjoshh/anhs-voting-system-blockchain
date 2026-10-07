const settings = require("./settings");
const published = () => Boolean(settings.get("election_address")) || ["published", "open", "closed"].includes(settings.get("status"));
const electionId = () => {
  const id = Number(settings.get("election_id"));
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error("Election not found."), { status: 503 });
  return id;
};
const statusName = (status) => ["pending", "open", "closed"][status] ?? "pending";
let cached;
let pending;
let generation = 0;
function invalidate() { generation++; cached = undefined; pending = undefined; }
async function snapshot({ fresh = false } = {}) {
  const id = electionId();
  if (!fresh && cached?.id === id && Date.now() < cached.expires) return cached.result;
  if (pending?.id === id) return pending.promise;
  const version = generation;
  const request = { id };
  request.promise = require("./chain").results(id).then((result) => {
    if (id !== electionId()) throw Object.assign(new Error("The election has changed. Please try again."), { status: 503 });
    if (version === generation && id === electionId()) cached = { id, result, expires: Date.now() + 5000 };
    return result;
  }).finally(() => { if (pending === request) pending = undefined; });
  pending = request;
  return request.promise;
}
module.exports = { published, electionId, statusName, snapshot, invalidate };
