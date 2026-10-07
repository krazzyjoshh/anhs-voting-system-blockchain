const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.BROWSER_BASE_URL || "http://127.0.0.1:5173";
const report = [];
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    let loggedIn = false, statsReads = 0, resultsReads = 0, studentSearch = "", finalTally = false;
    const positions = () => [
      { index: 0, name: "President", candidates: [{ name: "Juan Santos Dela Cruz", votes: finalTally ? 3 : 2 }, { name: "Maria Lopez Reyes", votes: 0 }] },
      { index: 1, name: "Vice President", candidates: [{ name: "Ana Cruz Garcia", votes: 1 }, { name: "Pedro Santos", votes: 1 }] },
    ];
    // Every API request is intercepted; the test cannot modify real students, tokens or chain data.
    await context.route("**/api/**", async (route) => {
      const request = route.request(), url = new URL(request.url()); let status = 200, body;
      if (url.pathname === "/api/admin/login") {
        const credentials = request.postDataJSON(); loggedIn = credentials.email === "admin@school.test" && credentials.password === "test-only-password";
        if (loggedIn) body = { token: "test-only-admin-session" }; else { status = 401; body = { error: "Incorrect email or password." }; }
      } else if (url.pathname === "/api/admin/me") {
        if (loggedIn && request.headers().authorization === "Bearer test-only-admin-session") body = { id: 1, email: "admin@school.test" };
        else { status = 401; body = { error: "Invalid admin session" }; }
      } else if (url.pathname === "/api/admin/stats") {
        statsReads++; body = { students: 4, activeStudents: 4, voted: finalTally ? 3 : 2, turnout: finalTally ? 75 : 50, positions: 2, candidates: 4, tokens: 4, usedTokens: finalTally ? 3 : 2, status: "open", published: true };
      } else if (url.pathname === "/api/admin/results") {
        resultsReads++; body = { published: true, status: 1, title: "SSLG General Election 2026", tokensRegistered: 4, electionAddress: "samplePublicElectionAddressForBrowserPreview", positions: positions(),
          archivedElections: [{ electionId: 100, title: "Archived election", schoolYear: "2025", tokensRegistered: 4, positions: [{ index: 0, name: "Archived President", candidates: [{ name: "=CSV formula sample", votes: 4 }] }] }] };
      } else if (url.pathname === "/api/admin/election/settings") body = { title: "SSLG General Election 2026", schoolYear: "SY 2026-2027" };
      else if (url.pathname === "/api/admin/students" && request.method() === "GET") { studentSearch = url.searchParams.get("search") || ""; body = { students: [], sections: [], total: 0 }; }
      else { status = 404; body = { error: "Mock API unavailable" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${origin}/admin`); await page.waitForURL("**/admin/login");
    await page.getByRole("heading", { name: "Welcome back, Admin" }).waitFor();
    assert.equal(await page.getByLabel("Password", { exact: true }).getAttribute("type"), "password");
    await page.screenshot({ path: "docs/ui-reference/admin-login-preview.png", fullPage: true });
    await page.getByLabel("Email address").fill("admin@school.test"); await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Incorrect email or password." }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("adminToken")), null);
    report.push("Anonymous guard, password field and failed login");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    await page.getByRole("button", { name: "Show password" }).click();
    assert.equal(await page.getByLabel("Password", { exact: true }).getAttribute("type"), "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.waitForURL(`${origin}/admin`);
    await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await page.locator(".metric-2 .admin-metric-value").filter({ hasText: "50%" }).waitFor();
    assert.equal(await page.locator(".admin-metric").count(), 7);
    assert.equal(await page.locator(".admin-position-result").count(), 2);
    assert.equal(await page.getByText("Tied votes", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Leading", { exact: true }).count(), 1);
    assert.ok(await page.getByText("admin@school.test", { exact: true }).count());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: "docs/ui-reference/admin-dashboard-preview.png", fullPage: true });
    report.push("Successful login, verified session, seven actual-data cards, leading and tie badges");
    await page.getByLabel("Position", { exact: true }).selectOption("0"); assert.equal(await page.locator(".admin-position-result").count(), 1);
    const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Export report" }).click();
    const download = await downloaded; const csv = fs.readFileSync(await download.path(), "utf8");
    assert.match(csv, /Juan Santos Dela Cruz/); assert.doesNotMatch(csv, /Pedro Santos/);
    assert.doesNotMatch(csv, /admin@school.test/);
    await page.getByLabel("Election", { exact: true }).selectOption("100");
    await page.getByRole("heading", { name: "Archived President", exact: true }).waitFor();
    assert.equal(await page.locator(".admin-position-result").count(), 1);
    const archiveDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export report" }).click();
    assert.match(fs.readFileSync(await (await archiveDownload).path(), "utf8"), /'=CSV formula sample/);
    await page.getByLabel("Election", { exact: true }).selectOption("current");
    report.push("Election/position filters avoid duplicate archive results; filtered CSV and formula escaping");
    const before = statsReads; finalTally = true;
    await page.getByRole("button", { name: "Refresh data" }).click();
    await page.locator(".metric-2 .admin-metric-value").filter({ hasText: "75%" }).waitFor();
    assert.ok(statsReads > before); assert.ok(resultsReads > 1);
    await page.getByLabel("Search students").fill("Ana Cruz"); await page.getByLabel("Search students").press("Enter");
    await page.waitForURL("**/admin/students?search=Ana%20Cruz");
    await page.getByRole("heading", { name: "Students", exact: true }).waitFor();
    await page.getByPlaceholder("Search by name or LRN", { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder("Search by name or LRN", { exact: true }).inputValue(), "Ana Cruz");
    assert.equal(studentSearch, "Ana Cruz");
    report.push("Refresh updates real summary and topbar search passes name to Students query");
    await page.goto(`${origin}/admin/dashboard`); await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole("button", { name: "Open menu" }).click(); await page.getByRole("link", { name: "Students", exact: true }).waitFor();
    await page.getByRole("button", { name: "Logout", exact: true }).click(); await page.waitForURL("**/admin/login");
    assert.equal(await page.evaluate(() => localStorage.getItem("adminToken")), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    report.push("390px dashboard/login fit, mobile menu and logout clear the session");
    await page.evaluate(() => localStorage.setItem("adminToken", "invalid-session"));
    await page.goto(`${origin}/admin`); await page.waitForURL("**/admin/login");
    assert.equal(await page.evaluate(() => localStorage.getItem("adminToken")), null);
    assert.deepEqual(errors, []); report.push("Invalid stored session is rejected; no browser runtime errors");
    await context.close();
    report.forEach((item) => console.log(`PASS ${item}`)); console.log(`Admin browser checks passed: ${report.length}. All API calls mocked.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(`Last completed check: ${report.at(-1) || "none"}`); console.error(error); process.exitCode = 1; });
