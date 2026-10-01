## Setup

Run `npm ci`, then `npx playwright install --with-deps chromium firefox webkit`.
This installs the browser versions for the locked Playwright dependency and
their system libraries. CI uses Ubuntu 24.04. See Playwright's
[supported systems](https://playwright.dev/docs/intro#system-requirements)
if the local install fails.

## Development regressions

Run `npm test`. These Chromium tests use the Vite development server on port 4173. The low-level board tests need the development-only files in
`tests/fixtures/`; these files are not production test pages.
To use an installed Chromium, run
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.
If port 4173 is in use, set `PLAYWRIGHT_DEV_PORT=4175` to start a separate test
server. The value must be an integer from 1 to 65535. Do not stop or reuse a
server from another worktree.

Tests use real browser events and the board interface. They cover drag updates,
late images, resize, map changes, cleanup, and the React caller.

Draft tests cover direct slot edits, team scope, conflicts, and legacy imports.
Builder tests cover browser saves, notes, copies, imports, conflicts, board transfer,
unsaved edits, and recovery when stored data is invalid.
Saved comp session tests use a memory storage adapter. They cover failed writes,
stale revisions, recovery data, storage limits, and edits during file imports
through the session interface.
Board session tests cover placement, map changes, drawing isolation, comp transfer,
edit order, redo invalidation, unchanged edits, and the 100-edit limit. Browser
tests cover drag completion, restore during a drag, text-safe shortcuts, and session reset.

## Production browser flows

Run `npm run test:production`. This command builds the app and starts Vite preview
on port 4174. It fails if that port is already in use. It cannot reuse a running
development server. `playwright.production.config.ts` selects only route tests
and `production.spec.ts`; it does not select the development fixtures.

The same crucial flows run in Chromium, Firefox, and WebKit: direct routes and
refresh, page navigation, comp save/reload, board token drag with undo/redo, and
PNG download. A separate check verifies built JS/CSS assets and excludes the
Vite development client.

Only Chromium receives `clipboard-read` and `clipboard-write` permissions.
Its export test also checks for an image on the clipboard. Firefox and WebKit
use their native clipboard behavior. Their PNG files must still download and
decode; only the app's explicit unsupported/denied clipboard messages are
accepted. Other export errors fail the test. See the
[browser support policy](../README.md#browser-support) for Safari/iOS limits.

The installed Chromium override also works with `npm run test:production` and
affects only the Chromium project. To run one engine, add `-- --project=firefox`
or `-- --project=webkit`.

CI installs all browser/system dependencies, then runs both suites. Failures
appear in pull request checks and Actions logs. Download the `browser-results`
artifact for HTML reports, traces, and PNG files. Run
`npx playwright show-report playwright-report/production` to inspect the
production report, or use `playwright-report/development` for the other suite.
