const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const anchor = require("@anchor-lang/core");

const { RPC_URL, WALLET_PATH, TOKEN_PEPPER } = process.env;
if (!TOKEN_PEPPER || !WALLET_PATH) throw new Error("WALLET_PATH or TOKEN_PEPPER is missing from .env");

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
  if (text.includes("already in use")) return err(409, "This token has already been used.");
  if (text.includes("AccountNotInitialized")) return err(403, "The token is not registered.");
  if (text.includes("ElectionNotOpen")) return err(403, "The election is not open.");
  if (text.includes("InvalidOption")) return err(400, "Invalid candidate.");
  if (/insufficient (funds|lamports)|no record of a prior credit/i.test(text))
    return err(402, "The wallet has insufficient SOL.");
  return err(502, "Unable to get a response from the blockchain.");
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
async function vote(electionId, token, selections, onPrepared = () => {}) {
  if (!selections?.length || selections.length > 6)
    throw Object.assign(new Error("A maximum of 6 positions is allowed per transaction."), { status: 400 });
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
    const lifetime = await connection.getLatestBlockhash("confirmed");
    const tx = new anchor.web3.Transaction({ feePayer: authority, ...lifetime }).add(...ixs);
    tx.sign(keypair);
    const signature = anchor.utils.bytes.bs58.encode(tx.signature);
    // Persist only signature/lifetime BEFORE broadcast, so a restart is recoverable.
    await onPrepared({ signature, lastValidBlockHeight: lifetime.lastValidBlockHeight });
    await connection.sendRawTransaction(tx.serialize());
    const confirmation = await connection.confirmTransaction({ signature, ...lifetime }, "confirmed");
    if (confirmation.value.err) throw Object.assign(new Error("Transaction failed."), { status: 502 });
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

async function signatureStatuses(signatures) {
  const statuses = [];
  for (let i = 0; i < signatures.length; i += 256) {
    const response = await connection.getSignatureStatuses(signatures.slice(i, i + 256), { searchTransactionHistory: true });
    statuses.push(...response.value);
  }
  return statuses;
}

// Decode confirmed batches in memory only. Never persist their instruction data.
async function matchesVoteTransaction(signature, electionId, token, selections) {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) return false;
  const message = tx.transaction.message;
  const instructions = message.instructions;
  if (!instructions || instructions.length !== selections.length) return false;
  const el = electionPda(electionId);
  const h = hashToken(token);
  return instructions.every((ix, i) => {
    if (!message.accountKeys[ix.programIdIndex].equals(program.programId)) return false;
    const decoded = program.coder.instruction.decode(ix.data, "base58");
    const expected = selections[i];
    const accounts = ix.accounts.map((index) => message.accountKeys[index]);
    return decoded?.name === "castVote" && decoded.data.candidateIndex === expected.candidateIndex &&
      Buffer.from(decoded.data.tokenHash).equals(Buffer.from(h)) &&
      accounts[0]?.equals(el) && accounts[1]?.equals(positionPda(el, expected.positionIndex)) &&
      accounts[2]?.equals(tokenPda(el, h)) && accounts[4]?.equals(authority);
  });
}
const blockHeight = () => connection.getBlockHeight("confirmed");
async function hasVoteRecords(electionId, token, start, count) {
  const el = electionPda(electionId);
  const h = hashToken(token);
  const addresses = Array.from({ length: count }, (_, i) => votePda(positionPda(el, start + i), h));
  return (await connection.getMultipleAccountsInfo(addresses, "confirmed")).some(Boolean);
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
  signatureStatuses,
  matchesVoteTransaction,
  blockHeight,
  hasVoteRecords,
};
