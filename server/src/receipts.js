const db = require("./db");
function transactions(receipt) {
  return db.prepare("SELECT signature FROM receipt_transactions WHERE receipt_id = ? ORDER BY batch_index, signature").all(receipt.id).map((t) => t.signature);
}
function voterReceipt(receipt) {
  const signatures = transactions(receipt);
  return { receiptCode: receipt.receipt_code, electionId: receipt.election_id, signatures,
    explorers: signatures.map(require("./chain").explorerTx), kind: receipt.kind };
}
function publicReceipt(receipt) {
  if (!receipt) return { valid: false, signature: null, explorer: null, createdAt: null };
  const signatures = transactions(receipt);
  const explorers = signatures.map(require("./chain").explorerTx);
  return { valid: true, signature: signatures[0] ?? null, explorer: explorers[0] ?? null,
    createdAt: receipt.created_at, signatures, explorers, kind: receipt.kind };
}
module.exports = { transactions, voterReceipt, publicReceipt };
