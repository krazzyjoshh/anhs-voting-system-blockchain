import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { VotingSystem } from "../target/types/voting_system";
import { assert } from "chai";
import { createHash } from "crypto";

const sha = (s: string) => Array.from(createHash("sha256").update(s).digest());

// Tinitiyak na ang TAMANG error ang dahilan ng pag-fail
async function expectError(p: Promise<any>, expected: string) {
  try {
    await p;
  } catch (e: any) {
    const text = [e?.message, e?.error?.errorCode?.code, ...(e?.logs ?? [])].join(" ");
    assert.include(text, expected);
    return;
  }
  assert.fail("Dapat nag-error ito pero pumasa");
}

describe("voting-system (token-based)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.votingSystem as Program<VotingSystem>;
  const authority = provider.wallet.publicKey;
  const sys = anchor.web3.SystemProgram.programId;

  const electionId = new anchor.BN(Date.now());
  const [electionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("election"), electionId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const positionPda = (i: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("position"), electionPda.toBuffer(), Buffer.from([i])],
      program.programId
    )[0];
  const tokenPda = (hash: number[]) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token"), electionPda.toBuffer(), Buffer.from(hash)],
      program.programId
    )[0];
  const votePda = (pos: anchor.web3.PublicKey, hash: number[]) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote"), pos.toBuffer(), Buffer.from(hash)],
      program.programId
    )[0];

  const tokenA = sha("TOKEN-AAAA1111");
  const tokenB = sha("TOKEN-BBBB2222");
  const tokenFake = sha("TOKEN-HINDI-REGISTERED");

  const vote = (hash: number[], posIndex: number, candidate: number) =>
    program.methods
      .castVote(hash, candidate)
      .accountsPartial({
        election: electionPda,
        position: positionPda(posIndex),
        tokenRecord: tokenPda(hash),
        voteRecord: votePda(positionPda(posIndex), hash),
        authority,
        systemProgram: sys,
      })
      .rpc();

  it("gumagawa ng election", async () => {
    await program.methods
      .createElection(electionId, "ANHS Student Council")
      .accountsPartial({ election: electionPda, authority, systemProgram: sys })
      .rpc();
    const e = await program.account.election.fetch(electionPda);
    assert.equal(e.status, 0);
  });

  it("nagdadagdag ng mga posisyon", async () => {
    await program.methods
      .addPosition("President", ["Alice", "Bob", "Carol"])
      .accountsPartial({ election: electionPda, position: positionPda(0), authority, systemProgram: sys })
      .rpc();
    await program.methods
      .addPosition("Vice President", ["Dan", "Eve"])
      .accountsPartial({ election: electionPda, position: positionPda(1), authority, systemProgram: sys })
      .rpc();
    const e = await program.account.election.fetch(electionPda);
    assert.equal(e.positionCount, 2);
  });

  it("nagre-register ng mga token", async () => {
    for (const h of [tokenA, tokenB]) {
      await program.methods
        .registerToken(h)
        .accountsPartial({ election: electionPda, tokenRecord: tokenPda(h), authority, systemProgram: sys })
        .rpc();
    }
    const e = await program.account.election.fetch(electionPda);
    assert.equal(e.tokenCount, 2);
  });

  it("hindi tumatanggap ng boto kapag hindi pa open", async () => {
    await expectError(vote(tokenA, 0, 1), "ElectionNotOpen");
  });

  it("nabubuksan ang election", async () => {
    await program.methods
      .setStatus(1)
      .accountsPartial({ election: electionPda, authority })
      .rpc();
    const e = await program.account.election.fetch(electionPda);
    assert.equal(e.status, 1);
  });

  it("nakakaboto ang registered na token", async () => {
    await vote(tokenA, 0, 1);
    const p = await program.account.position.fetch(positionPda(0));
    assert.equal(p.votes[1].toNumber(), 1);
  });

  it("hindi pwedeng bumoto ulit sa parehong posisyon", async () => {
    await expectError(vote(tokenA, 0, 2), "already in use");
  });

  it("pwedeng bumoto sa ibang posisyon gamit ang parehong token", async () => {
    await vote(tokenA, 1, 0);
    const p = await program.account.position.fetch(positionPda(1));
    assert.equal(p.votes[0].toNumber(), 1);
  });

  it("tinatanggihan ang hindi registered na token", async () => {
    await expectError(vote(tokenFake, 0, 0), "AccountNotInitialized");
  });

  it("tinatanggihan ang maling candidate index", async () => {
    await expectError(vote(tokenB, 0, 9), "InvalidOption");
  });

  it("hindi na pwedeng mag-register ng token kapag open na", async () => {
    const late = sha("TOKEN-HULI");
    await expectError(
      program.methods
        .registerToken(late)
        .accountsPartial({ election: electionPda, tokenRecord: tokenPda(late), authority, systemProgram: sys })
        .rpc(),
      "ElectionLocked"
    );
  });

  it("hindi tumatanggap ng boto kapag sarado na", async () => {
    await program.methods
      .setStatus(2)
      .accountsPartial({ election: electionPda, authority })
      .rpc();
    await expectError(vote(tokenB, 0, 0), "ElectionNotOpen");
  });
});