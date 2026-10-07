const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.BROWSER_BASE_URL || "http://127.0.0.1:5173";
const previews = path.join(__dirname, "../../docs/ui-reference");
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let submissions = 0, loginCode;
    const payloads = [], errors = [];
    const receipt = { receiptCode: "PREVIEW00001", signatures: ["preview-one", "preview-two"], explorers: [1, 2].map((n) => `https://explorer.solana.com/tx/preview-${n}?cluster=devnet`), kind: "onchain" };
    // Intercept every API request before opening the page: no real votes or mutations.
    await context.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let status = 200, body;
      if (pathname === "/api/vote/login") {
        loginCode = route.request().postDataJSON().token;
        if (loginCode === "INVALID1") { status = 400; body = { error: "Invalid token." }; }
        else body = { token: "preview-session" };
      } else if (pathname === "/api/vote/me") body = { title: "SSLG Election 2026", student: { fullName: "Sample Student", grade: "Grade 10", section: "A" } };
      else if (pathname === "/api/vote/ballot") body = { title: "SSLG Election 2026", positions: [{ id: 1, name: "President", candidates: [{ id: 10, full_name: "Sample Candidate One", partylist: "Student Party" }, { id: 11, full_name: "Sample Candidate Two", partylist: "School Party" }] }, { id: 2, name: "Vice President", candidates: [{ id: 20, full_name: "Sample Candidate Three" }] }] };
      else if (pathname === "/api/vote/submit") {
        submissions++; payloads.push(route.request().postDataJSON());
        if (submissions === 1) { status = 503; body = { error: "Submission is incomplete. Please try again." }; }
        else body = receipt;
      } else { status = 404; body = { error: "Unexpected fixture endpoint" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const screenshot = async (name) => page.screenshot({ path: path.join(previews, `voter-${name}-preview.png`), fullPage: true });
    const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page exceeds viewport");
    await page.goto(`${origin}/vote`);
    await page.getByRole("heading", { name: "ANHS Blockchain Voting" }).waitFor();
    await page.locator(".vote-logos img").last().evaluate((img) => img.decode());
    assert.ok(await page.locator(".vote-logos img").evaluateAll((imgs) => imgs.length === 2 && imgs.every((img) => img.complete && img.naturalWidth > 0)));
    assert.equal(await page.locator("header, footer, nav").count(), 0);
    assert.doesNotMatch(await page.locator("body").innerText(), /Ayala|Agusan National High School|Blockchain Online|Private PoA|Port:|Back to Public page/);
    await fits(); await screenshot("login");
    await page.setViewportSize({ width: 390, height: 844 }); await fits(); await screenshot("login-mobile");
    const input = page.getByLabel("Enter your token", { exact: true });
    const next = page.getByRole("button", { name: "Continue", exact: true });
    await input.fill("a!b-c"); assert.equal(await input.inputValue(), "ABC"); assert.ok(await next.isDisabled());
    await input.fill("INVALID1"); await next.click();
    await page.getByRole("alert").filter({ hasText: "Invalid token." }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem("voterToken")), null);
    await input.evaluate((element) => {
      const clipboardData = new DataTransfer(); clipboardData.setData("text", " abcd-ef01 \n");
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.equal(await input.inputValue(), "ABCDEF01");
    assert.equal(await page.locator(".vote-token-counter").innerText(), "8/8");
    await next.click(); assert.equal(loginCode, "ABCDEF01");
    await page.getByRole("heading", { name: "Welcome, Sample Student" }).waitFor();
    await fits(); await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot("dashboard");
    await page.getByRole("button", { name: "Start voting", exact: true }).click();
    const first = page.getByRole("radio", { name: /Sample Candidate One/ });
    await first.focus(); await page.keyboard.press("Space"); assert.ok(await first.isChecked());
    await page.keyboard.press("ArrowDown"); assert.ok(await page.getByRole("radio", { name: /Sample Candidate Two/ }).isChecked());
    await screenshot("ballot"); await page.setViewportSize({ width: 390, height: 844 }); await fits(); await screenshot("ballot-mobile");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Vice President", { exact: true }).waitFor();
    await page.getByText("Abstain", { exact: true }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.getByRole("heading", { name: "Review your vote", exact: true }).waitFor();
    await fits(); await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot("review");
    await page.getByRole("button", { name: "Submit vote", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Submission is incomplete" }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Edit", exact: true }).isDisabled());
    await page.reload(); await page.getByRole("heading", { name: "Review your vote", exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Edit", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Submit vote", exact: true }).click();
    await page.getByText(receipt.receiptCode, { exact: true }).waitFor();
    assert.deepEqual(payloads, [{ selections: { 1: 11, 2: null } }, { selections: { 1: 11, 2: null } }]);
    assert.equal(await page.getByRole("link", { name: /View on blockchain/ }).count(), 2);
    await screenshot("receipt"); await page.setViewportSize({ width: 390, height: 844 }); await fits();
    await page.reload(); await page.getByText(receipt.receiptCode, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem("voterToken")), null);
    assert.deepEqual(errors, []);
    console.log("PASS Voting branding, removed navigation/footer, desktop and mobile layout");
    console.log("PASS Token validation, sanitized paste, counter and invalid-token feedback");
    console.log("PASS Keyboard candidate selection and abstain");
    console.log("PASS Failed submission preserves locked choices across reload and retry");
    console.log("PASS Multiple transaction links, receipt persistence and session cleanup");
    await context.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
