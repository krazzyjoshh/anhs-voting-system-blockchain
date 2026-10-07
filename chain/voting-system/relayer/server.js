require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const anchor = require("@anchor-lang/core");

const { RELAYER_KEY, TOKEN_PEPPER, RPC_URL, WALLET_PATH, PORT } = process.env;
if (!RELAYER_KEY || !TOKEN_PEPPER) throw new Error("Kulang ang .env");

const keypair = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")))
);
const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});
anchor.setProvider(provider);

const idl = JSON.parse(
  fs.readFileSync(__dirname + "/../target/idl/voting_system.json", "utf8")
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
const find = (seeds) =>
  anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];

const electionPda = (id) => find([Buffer.from("election"), u64(id)]);
const positionPda = (el, i) => find([Buffer.from("position"), el.toBuffer(), Buffer.from([i])]);
const tokenPda = (el, h) => find([Buffer.from("token"), el.toBuffer(), Buffer.from(h)]);
const votePda = (pos, h) => find([Buffer.from("vote"), pos.toBuffer(), Buffer.from(h)]);

const send = (ixs) => provider.sendAndConfirm(new anchor.web3.Transaction().add(...ixs));

// ---------- server ----------
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, authority: authority.toBase58() }));

app.use((req, res, next) => {
  if (req.get("x-relayer-key") !== RELAYER_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
});

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    const text = [e?.message, ...(e?.logs ?? [])].join(" ");
    console.error(JSON.stringify({ event: "relayer_request_failed", status: 500 }));
    if (text.includes("already in use"))
      return res.status(409).json({ error: "Nagamit na ang token na ito" });
    if (text.includes("AccountNotInitialized"))
      return res.status(403).json({ error: "Hindi registered ang token" });
    if (text.includes("ElectionNotOpen"))
      return res.status(403).json({ error: "Hindi bukas ang eleksyon" });
    if (text.includes("InvalidOption"))
      return res.status(400).json({ error: "Maling candidate" });
    res.status(500).json({ error: "May pansamantalang problema sa blockchain." });
  }
};

// Gumawa ng election + mga posisyon
// body: { electionId, title, positions: [{ name, candidates: ["A","B"] }] }
app.post("/election", wrap(async (req) => {
  const { electionId, title, positions } = req.body;
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
  return { election: el.toBase58(), positions: positions.length };
}));

// I-register ang mga token (raw codes, ihahash dito)
// body: { electionId, tokens: ["ABCD1234", ...] }
app.post("/tokens", wrap(async (req) => {
  const { electionId, tokens } = req.body;
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
  }
  return { registered: done };
}));

// Baguhin ang status: 1 = open, 2 = closed
// body: { electionId, status }
app.post("/status", wrap(async (req) => {
  const { electionId, status } = req.body;
  await program.methods
    .setStatus(status)
    .accountsPartial({ election: electionPda(electionId), authority })
    .rpc();
  return { status };
}));

// Magpadala ng boto (isang transaksyon, lahat o wala)
// body: { electionId, token, selections: [{ positionIndex, candidateIndex }] }
app.post("/vote", wrap(async (req) => {
  const { electionId, token, selections } = req.body;
  if (!selections?.length || selections.length > 6)
    throw new Error("Hindi tamang bilang ng pinili (max 6 bawat submit)");
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
  return {
    signature,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}));

// Basahin ang resulta mula sa blockchain
app.get("/results/:electionId", wrap(async (req) => {
  const el = electionPda(req.params.electionId);
  const e = await program.account.election.fetch(el);
  const positions = [];
  for (let i = 0; i < e.positionCount; i++) {
    const p = await program.account.position.fetch(positionPda(el, i));
    positions.push({
      index: i,
      name: p.name,
      candidates: p.candidates.map((name, k) => ({ name, votes: p.votes[k].toNumber() })),
    });
  }
  return { title: e.title, status: e.status, tokensRegistered: e.tokenCount, positions };
}));

app.listen(PORT || 3001, "127.0.0.1", () =>
  console.log(`Relayer ready sa http://127.0.0.1:${PORT || 3001}`)
);