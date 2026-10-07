const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const anchor = require("@anchor-lang/core");
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../../chain/target/idl/voting_system.json"), "utf8"));
function fixture() {
  let calls = [], tx;
  const authority = new anchor.web3.PublicKey(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
  const program = new anchor.Program(idl, new anchor.AnchorProvider(new anchor.web3.Connection("http://127.0.0.1:8899"), { publicKey: authority }, {}));
  const connection = {
    getSignatureStatuses: async (signatures, config) => { calls.push({ signatures, config }); return { value: signatures.map(() => ({ err: null, confirmationStatus: "finalized" })) }; },
    getTransaction: async () => tx,
    getMultipleAccountsInfo: async () => [],
    getBlockHeight: async () => 100,
  };
  const fakeAnchor = { ...anchor, setProvider: () => {},
    web3: { ...anchor.web3, Connection: function () { return connection; }, Keypair: { fromSecretKey: () => ({ publicKey: authority }) } },
    AnchorProvider: function () { return {}; }, Wallet: function () {}, Program: function () { return program; } };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, "../src/chain.js"), "utf8");
  vm.runInNewContext(source, { module, Buffer, Uint8Array, __dirname: path.join(__dirname, "../src"),
    process: { env: { TOKEN_PEPPER: "test-pepper", WALLET_PATH: "TEST_WALLET_PLACEHOLDER" } },
    require: (name) => name === "@anchor-lang/core" ? fakeAnchor : name === "fs" ? {
      readFileSync: (file) => file === "TEST_WALLET_PLACEHOLDER" ? "[]" : JSON.stringify(idl),
    } : require(name),
  });
  const chain = module.exports;
  function transaction(batch, { candidateOverride, electionOverride } = {}) {
    const tokenHash = [...crypto.createHmac("sha256", "test-pepper").update("ABCDEF01").digest()];
    const el = chain.electionPda(electionOverride ?? 101);
    const pda = (seeds) => anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];
    const token = pda([Buffer.from("token"), el.toBuffer(), Buffer.from(tokenHash)]);
    const instructions = batch.map((b) => {
      const pos = pda([Buffer.from("position"), el.toBuffer(), Buffer.from([b.positionIndex])]);
      return new anchor.web3.TransactionInstruction({ programId: program.programId,
        keys: [el, pos, token, pda([Buffer.from("vote"), pos.toBuffer(), Buffer.from(tokenHash)]), authority, anchor.web3.SystemProgram.programId]
          .map((pubkey, i) => ({ pubkey, isSigner: i === 4, isWritable: [1, 2, 3, 4].includes(i) })),
        data: program.coder.instruction.encode("castVote", { tokenHash, candidateIndex: candidateOverride ?? b.candidateIndex }) });
    });
    const unsigned = new anchor.web3.Transaction({ feePayer: authority, recentBlockhash: anchor.web3.SystemProgram.programId.toBase58() }).add(...instructions);
    tx = { transaction: { message: unsigned.compileMessage() }, meta: { err: null } };
  }
  return { chain, calls, transaction };
}
test("signature status reader searches history and chunks requests at 256", async () => {
  const { chain, calls } = fixture();
  const statuses = await chain.signatureStatuses(Array.from({ length: 600 }, (_, i) => `test-signature-${i}`));
  assert.equal(statuses.length, 600); assert.deepEqual(calls.map((c) => c.signatures.length), [256, 256, 88]);
  assert.ok(calls.every((c) => c.config.searchTransactionHistory === true));
});
test("real Anchor decoder verifies a matching batch and rejects changed candidate/election", async () => {
  const { chain, transaction } = fixture(); const batch = [{ positionIndex: 0, candidateIndex: 1 }, { positionIndex: 1, candidateIndex: 0 }];
  transaction(batch); assert.equal(await chain.matchesVoteTransaction("test", 101, "ABCDEF01", batch), true);
  assert.equal(await chain.matchesVoteTransaction("test", 101, "ABCDEF02", batch), false);
  assert.equal(await chain.matchesVoteTransaction("test", 101, "ABCDEF01", []), false);
  transaction(batch, { candidateOverride: 2 }); assert.equal(await chain.matchesVoteTransaction("test", 101, "ABCDEF01", batch), false);
  transaction(batch, { electionOverride: 102 }); assert.equal(await chain.matchesVoteTransaction("test", 101, "ABCDEF01", batch), false);
});
test("safe logger excludes raw RPC payload and credentials", () => {
  const { logError } = require("../src/errors");
  const original = console.error;
  const lines = [];
  console.error = (line) => lines.push(line);
  try { logError("test_failure", Object.assign(new Error("PRIVATE_TOKEN SECRET_KEY VOTER_CHOICES"), { status: 502 })); }
  finally { console.error = original; }
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [{ event: "test_failure", status: 502 }]);
});
