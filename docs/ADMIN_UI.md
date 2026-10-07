# Admin dashboard and login

The admin layout follows the supplied light blue dashboard reference. The supplied HTML is saved in `ui-reference/admin-dashboard.html` for reference; the application uses React components and scoped CSS rather than the reference's Tailwind CDN and sample-data script.

Students, Candidates, Tokens, Blockchain and Ledger now use the same light background, white panels, blue controls, labeled forms, metric cards and contained table scrolling as the dashboard. The Public page and receipt verification use this style with public navigation and the same DepEd/Agusan school branding. Shared presentation components are in `web/src/components/PageUI.jsx` and `PublicHeader.jsx`; the additional responsive styles are in `web/src/pages.css`.

- `/admin/login` provides labeled email/password fields, password visibility, validation, submission feedback and error handling. It uses the existing password-hash verification and eight-hour admin JWT. Existing accounts and passwords remain in the database.
- The login background uses the locally stored Agusan National High School seal as a large watermark with a dark blue overlay. The school branding and welcome text use light colors, while the form remains on a white card. Logo sources are recorded in `web/public/branding/SOURCES.md`.
- Protected admin routes verify `/api/admin/me` before rendering. Anonymous, expired and invalid sessions go to the login page. Logout clears the browser token.
- The shared sidebar includes Dashboard, Students, Candidates, Tokens, Blockchain and Ledger, with the authenticated email in the account area. Mobile navigation uses a drawer. The Public page entry and External access section were removed; the Portal breadcrumb goes to the admin dashboard.
- Dashboard cards use `/admin/stats`. Status, token registration and candidate tallies use `/admin/results`. The title and school year use `/admin/election/settings`. Updates run every five seconds while the admin shell is open; refresh updates all three sources. Errors remain visible and retain the last successful data.
- Election and position filters support the current election and saved archives. CSV export uses the selected aggregate results, escapes spreadsheet formula prefixes, and excludes student/token/account data. Leading/tied badges depend on actual nonzero vote counts.
- Topbar search opens Students with its name/LRN query populated. The notifications panel shows current status and update/registration warnings. The ledger footer links to the existing protected ledger.
- The Public page fills the browser width with summary cards, a results board and a separate participation/announcement panel. On smaller screens these sections stack. Only Refresh appears beside the election heading; the duplicated vote call-to-action and public Admin login link were removed. Receipt verification and Token login remain in the public header.
- Branding uses locally hosted DepEd and Agusan National High School seals in the admin sidebar, login screen and public page. The school seal is also the favicon. See `../web/public/branding/SOURCES.md` for image sources. The dashboard does not display the reference's hardcoded Mainnet or block-height claims. Explorer links follow this project's existing Devnet setup.

The screenshots `ui-reference/admin-dashboard-preview.png` and `ui-reference/admin-login-preview.png` use intercepted sample API data, including a fictional administrator. They illustrate the layout; actual election counts will differ.

## Verification

`npm --prefix web run build` and `npm --prefix server test` cover the production build and backend regressions, including password validation and rejecting voter/invalid sessions on admin endpoints.

`web/tests/admin-browser.cjs` checks guarded login, password visibility, seven summary cards, leading/tie results, archive/position filters, CSV export, refresh, student search, mobile navigation/logout and invalid sessions. Every API request in this test is intercepted; it cannot change real election data or send transactions.

`web/tests/browser.cjs` covers existing public/admin navigation and the voter flow. Admin/public checks read the local API; voter submission is mocked.

Verification completed: production build passed, all 17 backend tests passed, all 6 admin browser checks passed, and all 11 existing browser checks passed. Desktop screenshots were visually inspected; the dashboard and login fit a 390px mobile viewport.

The subsequent full-page redesign passed the production build, those 6 admin and 11 existing browser checks, and 7 additional groups of checks in `web/tests/pages-browser.cjs`. The additional checks use intercepted fixture APIs for student search/add/active status/CSV upload, candidate autofill/create, token generation/print filters, metadata saving/closed-election rules, ledger verification and public result filtering/hidden tallies. All seven redesigned pages fit a 390px viewport without page-level horizontal overflow; wide tables scroll inside their panels. No real voting, publishing, token generation, or record mutation occurs in the additional checks.

Additional preview files in `ui-reference/` are `students-preview.png`, `candidates-preview.png`, `tokens-preview.png`, `blockchain-preview.png`, `ledger-preview.png`, `public-preview.png` and `verify-preview.png`. They use fictional fixture data and are regenerated by `pages-browser.cjs`.

To run browser checks, install Playwright in a local development/test environment and start the app with `npm run dev`. Then run `node web/tests/admin-browser.cjs` and `node web/tests/browser.cjs`. If Playwright is installed outside the normal module path, set `PLAYWRIGHT_MODULE` to its module path; `BROWSER_EXECUTABLE` can point to an existing Chromium installation. Screenshots are regenerated by the admin browser test.

## Voting screens

The three supplied voting HTML files contain the same token-login design. A reference copy is stored in `ui-reference/voter-token-reference.html`; its sample school name, blockchain status and network details are not rendered by the app.

`web/src/pages/Vote.jsx` and `web/src/vote.css` apply the centered white card, light grid background and blue controls to token login, voter welcome, ballot, review and receipt. The requested top navigation and global footer are removed, including the written school name and network/block labels. The real locally hosted DepEd and ANHS logos appear above the title. Token assistance directs voters to COMELEC, and receipt verification links to the existing `/verify` page.

All voting stages now use the token login's same 520px maximum card width, shared card heading, logo/title/description and full-width primary button. The wider ballot/review layout was removed, ballot progress is inside its card, and actual election titles appear inside the authenticated cards. Secondary actions follow the primary button in both visual and keyboard order. Candidate selection, abstain, back/edit controls and receipt printing remain available. The production build and all five voter-browser check groups passed after this alignment; welcome and ballot previews were inspected on desktop and mobile.

The token field shows its eight-character counter, normalizes pasted letters to uppercase and removes separators. Candidate cards use native radio inputs for keyboard selection. Existing API endpoints, per-position selection persistence, submission confirmation, locked retry behavior and receipt recovery remain in place. The existing transaction privacy notice stays visible.

The production build and all 11 existing browser checks passed after this change. `web/tests/voter-browser.cjs` adds five groups of checks for branding/mobile layout, token validation and paste, keyboard candidate selection/abstain, locked submission recovery across reload, and multiple receipt transaction links/session cleanup. Every API request in this additional test is intercepted; no real vote is submitted. Login and ballot previews were visually inspected at desktop and mobile sizes.

Preview screenshots are `ui-reference/voter-login-preview.png`, `voter-login-mobile-preview.png`, `voter-dashboard-preview.png`, `voter-ballot-preview.png`, `voter-ballot-mobile-preview.png`, `voter-review-preview.png` and `voter-receipt-preview.png`. They use fictional fixture data and are regenerated with `node web/tests/voter-browser.cjs`.

## Flexible student CSV import

CSV import now previews records before saving. Common English/Filipino headers, shuffled columns, full names, combined grade/section, Excel separator directives, title rows and multiple encodings are recognized. Unknown/headerless layouts support column mapping, shared grade/section defaults, and editable preview rows. Changing any mapping or record disables import until the preview is updated. The preview panel expands across the content width and its table scrolls inside the panel on mobile.

See `STUDENT_CSV.md` for supported formats and the handling of missing information. Both preview and final import use the same server normalizer; the protected preview endpoint writes nothing. Imports preserve student voting/active status and tokens, and keep the publication lock. Regression coverage includes 30 backend tests, seven page-browser groups and five CSV-browser groups; all import tests use temporary databases or intercepted APIs. The production build passed and desktop/mobile CSV previews were visually inspected.
