# Phase B report — 2026-10-06

Implemented the accepted Phase B requirements and receipt/integrity fixes. Verification used read-only live RPC calls and mocked voting. No Solana transaction was signed or sent during verification; no SOL was spent.

## 1. Final audit table

| Item | Status | Evidence / final behavior |
|---|---|---|
| Student reset/delete endpoints and buttons | DONE / VERIFIED | All three removed operations return 404; buttons absent. |
| Candidate edit/delete and position delete | DONE / VERIFIED | Handlers and edit/delete UI removed; create/list retained. |
| Token delete/delete-unused | DONE / VERIFIED | Both operations return 404; generate/list/print retained. |
| `/api/public/status` | DONE / VERIFIED | Anonymous 200; explicit six-field response; receipt count scoped to current election. |
| `/api/public/results` | DONE / VERIFIED | Shared 5-second memory cache with concurrent request coalescing. |
| `PUBLIC_LIVE_RESULTS` | DONE / VERIFIED | Default true; false hides tallies until chain status is closed, including the compatibility endpoint. |
| Landing page `/` | DONE / VERIFIED | Title, status, turnout, result bars, election/program Explorer links, token login and verification links. |
| Public receipt API and `/verify` | DONE / VERIFIED | Returns receipt validity and all transaction links; excludes token hash. Validity means receipt existence, not independent chain confirmation. |
| `/login`, `/admin/dashboard`, `/admin/system` | DONE / VERIFIED | Login redirect; dashboard alias; system redirects to blockchain page. |
| `signatureStatuses()` | DONE / VERIFIED WITH MOCK RPC | Read-only; searches transaction history; maximum 256 signatures per RPC request. |
| Admin ledger API and page/sidebar | DONE / VERIFIED | Protected API, per-position totals, receipts and verification button. |
| Four ledger checks | DONE / VERIFIED | Token mismatch WARNING; position totals versus used tokens; receipts versus used tokens; every persisted signature checked. |
| Verification outcomes | DONE / VERIFIED | PASS, FAIL, WARNING, N/A with explanations; RPC uncertainty cannot produce a false PASS. |
| Voter URLs and dashboard | DONE / VERIFIED WITH MOCK VOTER API | `/vote`, `/vote/dashboard`, `/vote/ballot?step=`, `/vote/review`, `/vote/receipt`, `/vote/logout`. |
| `/api/vote/me` | DONE / VERIFIED | Requires current-election voter JWT; returns only title, student name, grade and section. |
| Missing/used-token guards | DONE / VERIFIED | Redirect to token login with a message; a completed lost-response submission can recover its own receipt. |
| Browser selections and receipt refresh | KEEP / VERIFIED | Selections stay in sessionStorage; receipt survives refresh in the same tab/session. |
| Maximum six positions per transaction | KEEP / VERIFIED WITH MOCK CHAIN | Fixed groups of six positions; abstentions omitted from instruction payload. |
| All transaction signatures | DONE / VERIFIED | One receipt per completed submission; separate receipt_transactions table holds all successful batch signatures. |
| Durable batch recovery | DONE / VERIFIED WITH MOCK CHAIN | Signature and block lifetime persisted before broadcast; confirmed batches decoded in memory before reuse. |
| All-abstain behavior | DONE / VERIFIED | Completed receipt without chain transaction; signature check N/A. |
| Receipt election isolation | DONE / VERIFIED | New receipts have election_id; old receipts remain verifiable after a new election. |
| `models.js` helpers | DONE / VERIFIED | positionCandidates, candidatePosition, candidateVotes, studentToken, tokenStudent; no student-votes helper. |
| Candidate ordering | KEEP / VERIFIED | Existing full_name COLLATE NOCASE queries retained; chain_map freezes roster IDs and indices. |
| ElectionSetting get/set | KEEP | Existing settings.js queries unchanged. |
| `registerTokens` argument bug | FIXED | Caller now passes electionId, tokens, callback; live publishing was intentionally not exercised. |
| Safe logging | DONE / VERIFIED | Controlled event/status logs; no raw errors, request bodies, tokens or selections. Legacy relayer sanitized too. |
| Aggregate archive | KEEP — ACCEPTED EXCEPTION | Aggregate candidate tallies remain in election_archive.results_json; individual voter choices are never persisted. |
| Secret-ballot privacy architecture | NOT IMPLEMENTED | Existing public instruction format remains; no program redesign or deployment was performed. Privacy limitation is explained in voter, receipt and ledger UI. |

## 2. Files changed, added and removed

### Changed

| File | Change |
|---|---|
| `.gitignore` | Ignore SQLite sidecars, web build output, temporary browser tools and database backups. |
| `server/.env` | Added PUBLIC_LIVE_RESULTS=true; existing credentials retained. |
| `server/package.json` | Added executable Node test suite. |
| `server/src/auth.js` | Expose the voter JWT's election ID for session binding. |
| `server/src/db.js` | Add receipt election/kind migrations, transaction evidence and durable batch metadata; optional DB_PATH for isolated tests. |
| `server/src/index.js` | Mount protected ledger; removed operations return 404; safe errors; export app for tests. |
| `server/src/chain.js` | Read-only history/status and recovery helpers; pre-broadcast signature callback; sanitized RPC errors. |
| `server/src/routes/admin.js` | Remove requested mutation handlers; use positionCandidates; lock roster during publishing. |
| `server/src/routes/blockchain.js` | Fix registration arguments, save roster snapshot, invalidate cache, preserve archive metadata and sanitize errors. |
| `server/src/routes/public.js` | Public status, results and receipt APIs; compatibility endpoint shares cache and result visibility policy. |
| `server/src/routes/voter.js` | Current-election sessions, whitelisted profile, receipt recovery and persistent batch reconciliation. |
| `chain/voting-system/relayer/server.js` | Remove raw RPC logging and raw error response. This relayer is not used by npm run dev. |
| `web/package.json` | Add vite build script. |
| `web/src/App.jsx` | Add verification/ledger pages, voter route stages and aliases. |
| `web/src/voter.js` | Preserve safe API error codes for guards. |
| `web/src/pages/Home.jsx` | Public turnout, cached live results and Explorer/verification links. |
| `web/src/pages/Vote.jsx` | URL-based stages, student dashboard, browser persistence, retry lock, logout and privacy notice. |
| `web/src/pages/Candidates.jsx` | Remove candidate editing and candidate/position deletion UI. |
| `web/src/pages/Students.jsx` | Remove reset/delete UI; retain active-status control and roster creation/import. |
| `web/src/pages/Tokens.jsx` | Remove delete UI; retain generation, filters and printing. |
| `web/src/styles.css` | Turnout progress and ledger check styling. |

### Added

| File | Purpose |
|---|---|
| `server/.env.example` | Configuration template without real credentials. |
| `server/src/errors.js` | Safe messages and controlled logging. |
| `server/src/election.js` | Shared election snapshot/cache and invalidation. |
| `server/src/models.js` | Thin relationship helpers and verified chain_map snapshot. |
| `server/src/receipts.js` | Explicit public/voter receipt serializers with complete transaction links. |
| `server/src/routes/ledger.js` | Admin ledger and verification endpoints. |
| `server/tests/integration.test.js` | Temporary-database API, guards, receipts, recovery and election-isolation tests. |
| `server/tests/chain.test.js` | Mocked history batching, real Anchor instruction decoding and safe logging tests. |
| `web/src/public.js` | Public API helper without admin credentials. |
| `web/src/pages/Verify.jsx` | Receipt code verification page. |
| `web/src/pages/Ledger.jsx` | Protected ledger and explained verification outcomes. |
| `web/tests/browser.cjs` | Live read-only page checks plus intercepted voter-flow checks. |
| `docs/PHASE_B_REPORT.md` | This audit, verification evidence and test instructions. |

No source files were deleted. Removed items are handlers, buttons and editing branches inside the existing files. The inactive `server/web` frontend was not modified; npm run dev uses root `web/`.

The production SQLite schema was migrated without adding votes or resetting participation. A persistent post-migration backup is in `server/backups/phase-b-2026-10-06.sqlite` and is ignored by Git. An earlier pre-edit backup was made under /tmp, but the execution environment cleared temporary files during the session; do not rely on that temporary backup.

## 3. Verification and remaining limits

| Check | Result |
|---|---|
| node --check on server JavaScript, including changed legacy relayer | PASS |
| npm --prefix web run build | PASS |
| npm --prefix server test | PASS: 16 tests |
| npm run dev | PASS: API ready and Vite ready; the final browser regression had no page errors after the finish-button fix |
| Anonymous curl public/status | 200; title, status, published, tokensRegistered, votesCast, turnoutPercent only |
| Anonymous curl admin/ledger | 401 |
| curl all eight removed operations | 404 for every operation |
| SQL-write and log audit | No individual votes/selections/candidate_id persisted or logged; accepted aggregate archive exception retained |
| Playwright browser checks | PASS: 11 checks; all voter traffic intercepted with mocks |
| Existing data after verification | 4 students, 4 tokens, 0 receipts, 2 archives; 0 submission batches and 0 receipt transaction rows |

Browser checks covered live landing/status/turnout, invalid receipt lookup, aliases, admin guard, absence of removed buttons, read-only live ledger verification, 390px layout, and mocked voter dashboard, step URLs, selection refresh, receipt refresh, logout and used-token guard. No browser page errors remained.

Not exercised: real publish/register/open/close/vote transactions, real paid retry/confirmation behavior, and verification of actual stored transaction signatures. These require spending SOL or existing nonempty transaction evidence; this database currently has no receipts. The real Anchor decoder was exercised with unsigned synthetic transaction messages and mocked RPC.

## 4. Risks and decisions

- The current design is not an anonymous secret ballot. Token hashes and candidate indices remain in public transaction instructions. A party with student-token records and the pepper may connect identity to a choice. Explorer-linked receipts can reveal choices when shared. A confidential voting design requires separate protocol/program work and review before actual secret-ballot use.
- PUBLIC_LIVE_RESULTS=false hides tallies through these public application endpoints; it does not hide public Solana account data.
- Only transaction metadata is durable. Full selections remain in browser sessionStorage; clearing the tab/session during partial submission loses that local draft. Confirmed chunks are checked against the resubmitted choices; unavailable chain evidence stops recovery rather than marking a ballot complete. A warning is shown before logout during pending submission.
- Legacy receipts are not assigned to an election by guessing. Unassigned records produce warnings; legacy all-abstain versus lost-evidence cases cannot be reliably distinguished.
- Ledger checks verify consistency and signature status. They do not independently establish every ballot's correctness, election secrecy or the absence of malicious administrative action.
- Partial publish jobs are not automatically resumed across server restarts. Roster changes remain locked and repeated publication is refused while evidence is uncertain; COMELEC must inspect and resolve the partial publish separately.
- Aggregate archive tallies are intentionally retained, as accepted. Searches for the word votes anywhere in the code will still find legitimate result reads and aggregate handling.

## 5. Exact commands and user checklist

Run from the repository root:

```bash
for file in $(rg --files server/src server/tests -g '*.js'); do
  node --check "$file" || exit 1
done
node --check chain/voting-system/relayer/server.js
npm --prefix server test
npm --prefix web run build
npm run dev
```

In a second terminal:

```bash
curl -i http://127.0.0.1:4000/api/public/status
curl -i http://127.0.0.1:4000/api/admin/ledger
while read -r method endpoint; do
  curl -sS -o /dev/null -X "$method" \
    -w "$method $endpoint HTTP %{http_code}\n" \
    "http://127.0.0.1:4000/api/admin$endpoint"
done <<'ROUTES'
POST /students/reset
DELETE /students
DELETE /students/1
PUT /candidates/1
DELETE /candidates/1
DELETE /positions/1
DELETE /tokens/unused
DELETE /tokens/1
ROUTES
rg -n 'votes|selections|candidate_id|console\.(log|error)' server/src
rg -n '(INSERT|UPDATE).*(votes|selections|candidate_id)|console\.(log|error).*\b(votes|selections|candidate_id)\b' server/src
```

Expected: public status 200, anonymous ledger 401, all removed operations 404. The last targeted search returns no matches. The broader search needs review because legitimate in-memory selections and aggregate result reads remain.

Optional browser regression, with npm run dev already running:

```bash
npm install --prefix .browser-tools --no-audit --no-fund playwright
node .browser-tools/node_modules/playwright/cli.js install --with-deps chromium
PLAYWRIGHT_MODULE="$PWD/.browser-tools/node_modules/playwright" \
  node web/tests/browser.cjs
```

The browser test makes live read-only public/admin requests. Every voter API request is intercepted before login, including submit. It cannot send a real vote. If your machine already has Chromium, set BROWSER_EXECUTABLE to its executable path instead of downloading it. Linux hosts need Chromium's system libraries; in this session missing libraries were extracted locally rather than installed system-wide.

Manual checklist without SOL spending:

- [ ] Open http://127.0.0.1:5173/ on desktop and phone; inspect title, status, turnout, result bars and Explorer links.
- [ ] Open /verify and enter an unknown receipt code; confirm the invalid-result message.
- [ ] In a private browser window, open /admin/ledger; confirm redirect to /admin/login.
- [ ] Log in normally and inspect /admin/dashboard, /admin/system and /admin/ledger.
- [ ] Click I-verify on the ledger. This endpoint is read-only on chain and spends no SOL.
- [ ] Confirm Edit/Delete/Reset voted/Delete all/Delete unused buttons are absent from the requested pages.
- [ ] Open /vote/review without a session; confirm token-login redirect and message.
- [ ] Use the mocked browser regression for ballot submission and receipt refresh. Do not click real Publish, Open, Close or Submit during the no-SOL test.
- [ ] Review the privacy notice before deciding whether this architecture is suitable for actual school voting.

Real chain transaction testing and confidential-ballot redesign remain outside this no-SOL verification run.
