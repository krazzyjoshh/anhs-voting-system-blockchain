const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const jwt = require("../../server/node_modules/jsonwebtoken");
require("../../server/node_modules/dotenv").config({ path: path.join(__dirname, "../../server/.env"), quiet: true });
const origin = process.env.BROWSER_BASE_URL || "http://127.0.0.1:5173";
const report = [];
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin); await page.getByRole("heading", { name: "Turnout", exact: true }).waitFor();
    await page.locator(".status-pill").filter({ hasText: /Pending|Open|Closed/ }).waitFor();
    assert.ok(await page.getByRole("link", { name: "Verify receipt" }).count());
    report.push("Live landing page: title, status, turnout and verification links");
    await page.goto(`${origin}/verify`); await page.getByLabel("Receipt code").fill("UNKNOWN00001");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.getByRole("heading", { name: "Receipt code not found" }).waitFor();
    report.push("Live verify page: unknown receipt handled without login");
    await page.goto(`${origin}/login`); await page.waitForURL("**/admin/login");
    await page.goto(`${origin}/admin/ledger`); await page.waitForURL("**/admin/login");
    report.push("Login alias and anonymous admin guard");
    const token = jwt.sign({ sub: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" });
    await page.evaluate((value) => localStorage.setItem("adminToken", value), token);
    await page.goto(`${origin}/admin/dashboard`); await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await page.goto(`${origin}/admin/system`); await page.waitForURL("**/admin/blockchain");
    await page.getByRole("heading", { name: "Blockchain", exact: true }).waitFor();
    report.push("Authenticated dashboard and system aliases");
    for (const route of ["candidates", "students", "tokens"]) {
      await page.goto(`${origin}/admin/${route}`); await page.locator("table, .card").first().waitFor();
      assert.equal(await page.getByRole("button", { name: /^(Edit|Delete|Delete all|Delete unused|Delete position|Reset voted)$/ }).count(), 0);
    }
    report.push("Removed admin buttons absent on Candidates, Students and Tokens");
    await page.goto(`${origin}/admin/ledger`); await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.getByText("These are consistency checks only.", { exact: false }).waitFor();
    assert.ok(await page.getByText("WARNING", { exact: true }).count() || await page.getByText("PASS", { exact: true }).count());
    report.push("Live read-only ledger verification and status explanations");
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(origin);
    await page.getByRole("heading", { name: "Turnout", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    report.push("Mobile landing page fits a 390px viewport");
    assert.deepEqual(errors, []);
    await context.close();

    // All voter traffic is intercepted before login. No real submission can reach the API.
    const voterContext = await browser.newContext();
    let used = false, submissions = 0;
    const receipt = { receiptCode: "BROWSER00001", signatures: ["browser-test-signature"], explorers: ["https://explorer.solana.com/tx/browser-test-signature?cluster=devnet"], kind: "onchain" };
    await voterContext.route("**/api/vote/**", async (route) => {
      const suffix = new URL(route.request().url()).pathname.slice("/api/vote".length);
      let status = 200, body;
      if (suffix === "/login") body = { token: "mock-browser-session" };
      else if (suffix === "/me") {
        if (used) { status = 409; body = { code: "TOKEN_USED", error: "This token has already been used." }; }
        else body = { title: "Browser Test Election", student: { fullName: "Sample Student", grade: "Grade 7", section: "A" } };
      } else if (suffix === "/ballot") body = { title: "Browser Test Election", positions: [1, 2].map((id) => ({ id, name: `Position ${id}`, candidates: [{ id: id * 10, full_name: `Candidate ${id}` }] })) };
      else if (suffix === "/submit") { submissions++; body = receipt; }
      else if (suffix === "/receipt") body = receipt;
      else { status = 404; body = { error: "Mock route unavailable" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    const vote = await voterContext.newPage();
    const voterErrors = []; vote.on("pageerror", (e) => voterErrors.push(e.message));
    await vote.goto(`${origin}/vote/review`); await vote.waitForURL(`${origin}/vote`);
    await vote.getByText("Please log in with your token first.").waitFor();
    report.push("Voter protected URL redirects missing session with a message");
    await vote.getByPlaceholder("8-character token").fill("ABCDEF01");
    await vote.getByRole("button", { name: "Continue", exact: true }).click();
    await vote.waitForURL("**/vote/dashboard"); await vote.getByText("Welcome, Sample Student").waitFor();
    await vote.getByRole("button", { name: "Start voting", exact: true }).click();
    await vote.waitForURL("**/vote/ballot?step=1"); await vote.getByText("Candidate 1", { exact: true }).click();
    await vote.getByRole("button", { name: "Next", exact: true }).click();
    await vote.waitForURL("**/vote/ballot?step=2"); await vote.reload();
    await vote.getByText("Candidate 2", { exact: true }).waitFor();
    assert.equal(await vote.evaluate(() => JSON.parse(sessionStorage.getItem("selections"))[1]), 10);
    await vote.getByText("Abstain", { exact: true }).click();
    await vote.getByRole("button", { name: "Review", exact: true }).click();
    await vote.waitForURL("**/vote/review"); await vote.getByRole("heading", { name: "Review your vote", exact: true }).waitFor();
    vote.on("dialog", (dialog) => dialog.accept());
    await vote.getByRole("button", { name: "Submit vote", exact: true }).click();
    await vote.waitForURL("**/vote/receipt"); await vote.getByText(receipt.receiptCode, { exact: true }).waitFor();
    await vote.reload(); await vote.getByText(receipt.receiptCode, { exact: true }).waitFor();
    assert.equal(await vote.evaluate(() => sessionStorage.getItem("voterToken")), null);
    assert.equal(submissions, 1);
    report.push("Mock voter dashboard, URL steps, selection refresh, review and receipt refresh");
    await vote.getByRole("button", { name: "Done", exact: true }).click(); await vote.waitForURL(`${origin}/vote`);
    await vote.getByPlaceholder("8-character token").fill("ABCDEF01"); await vote.getByRole("button", { name: "Continue", exact: true }).click();
    await vote.waitForURL("**/vote/dashboard"); await vote.getByRole("button", { name: "Log out", exact: true }).click();
    await vote.waitForURL(`${origin}/vote`);
    assert.equal(await vote.evaluate(() => sessionStorage.getItem("voterToken")), null);
    report.push("Voter logout URL clears browser session");
    used = true;
    await vote.evaluate(() => sessionStorage.setItem("voterToken", "mock-used-session"));
    await vote.goto(`${origin}/vote/dashboard`); await vote.waitForURL(`${origin}/vote`);
    await vote.getByText("This token has already been used.").waitFor();
    report.push("Used-token guard redirects to login with a message");
    assert.deepEqual(voterErrors, []);
    await voterContext.close();
    for (const item of report) console.log(`PASS ${item}`);
    console.log(`Browser checks passed: ${report.length}. Voter submission used mocked endpoints only.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(`Last completed browser check: ${report.at(-1) || "none"}`); console.error(error.message); process.exitCode = 1; });
