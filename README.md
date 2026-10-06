# Rivals Lab

Use Node.js 22.18.0 or later. Install dependencies with `npm ci`.

## Development

- `npm run dev`: start the development server.
- `npm run check`: check TypeScript types.
- `npm run lint`: check code with ESLint.
- `npm run lint:fix`: fix code issues that ESLint can correct automatically.
- `npm run build`: create the production build.
- `npm run deploy`: build and deploy to Cloudflare Workers.
- `npm test`: run browser tests. See [test setup](tests/README.md).
- `npm run test:production`: build and test the production preview in Chromium,
  Firefox, and WebKit. See [browser support and test setup](tests/README.md).

The cf CLI and Vite plugin beta pins require Miniflare `5.20260926.0-alpha`.
The version-scoped override in `package.json` selects the
[patched Miniflare release](https://github.com/cloudflare/workers-sdk/releases/tag/miniflare@5.20260926.1-alpha),
which installs Undici `7.29.1`. This keeps the cf configuration and deploy workflow.
Remove the override when both tools and their dependencies use patched Miniflare.

On 2026-09-30, `npm audit --json` changed from five affected development packages
(one high, four moderate) to zero. `npm audit --omit=dev --json` reported zero
before and after the update. No findings remain in this audit.

## Formatting

- `npm run format`: format supported project files with Prettier.
- `npm run format:check`: check formatting without changing files.

## Linting

ESLint checks JavaScript and TypeScript files, including tests and configuration.
It uses the recommended JavaScript and type-aware TypeScript rules, plus React
hook order and dependency checks. See `eslint.config.mjs`.
It rejects unsafe type assertions and TypeScript suppression comments.
Prettier handles formatting. Generated output and agent files are excluded.

## Deployment

Live app: https://rivalslab.dev/

Sign in to Cloudflare with `npx cf auth login`, then run `npm run deploy`.
The `rivals-lab` Worker serves static files built by Vite. Build output is in
`.cloudflare/output/v0/`. No database or server code is required.

Saved comps stay in each user's browser. Deployment does not add shared storage.

The project uses the default Prettier rules in `.prettierrc.json`.
Dependencies, build output, coverage, and generated test reports are excluded
through `.prettierignore`.

Before a pull request, run `npm run format:check`, `npm run lint`,
`npm run check`, and `npm run build`.
The Release checks workflow runs these checks, the development regressions, and
the production browser flows for pull requests and pushes to `main`. Check both
jobs on the pull request before merge or release. Failed browser runs include
reports, traces, and downloaded images in the `browser-results` Actions artifact.

## Browser support

The app supports current desktop Chrome, Edge, and Firefox. Release checks use
the Chromium, Firefox, and WebKit versions supplied by the locked Playwright
dependency. Image download must work in all three engines. Image clipboard copy
depends on browser support, permissions, and a secure context. A clipboard limit
must not prevent a PNG download.

WebKit is an automated engine check. It does not verify Safari on a physical Mac
or iOS device. Safari and iOS support remains unverified until manual device
testing is complete.

## Board history

`BoardSession` in `src/boardSession.ts` owns committed edits and hidden history.
React keeps selection, tools, messages, confirmations, and icon size. Placement
and map edits receive the current icon size. `boardTokens.ts` shares token bounds
with the canvas.

Board history stays in the current session and resets on reload. It stores up to
100 edits across undo and redo, plus the current board. New edits discard the
oldest saved entries when needed and clear redo. Unchanged actions preserve history.

Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo. Ctrl+Y also redoes on
Windows/Linux. These shortcuts leave editable fields to native text editing.

## Browser data and backups

`src/appData.ts` owns the `rivals-lab` IndexedDB database. Version 2 keeps the
comp library record and adds the Position Board, the open comp, and custom map
images. The board, hero icon size, open comp, and custom maps save as they
change, so a reload keeps them. Undo history still resets on reload. Every write
checks the stored data generation. A tab whose data was replaced in another tab
stops writing and asks for a reload.

Backup in the top bar downloads one JSON file with all of it. Import in the same
dialog previews a file before anything changes. A full backup replaces this
browser's data and reloads the page. A version 1 comps file adds copies, as
before. Backups are capped at 80 MiB.

## Saved comp compatibility

`SavedCompSession` in `src/savedComps.ts` owns library operations, saved revisions,
and the editor baseline. `CompBuilder` keeps display state, file selection,
confirmations, and messages. `comps.ts` validates and migrates stored data.
`compEdits.ts` owns hero choice rules, slot edits, draft resets, map changes, and
comp status. Display code sends typed edits through the saved session. Picker checks
and edits use the same choice rules. The edit module has no mutable state.
The session publishes saved state only after an IndexedDB transaction commits.
Each transaction reads the current library, checks revisions and limits, and
writes the complete JSON envelope. Concurrent tabs keep independent saves.
Library refreshes preserve local edits and stale-save checks. A queued save
rejects if the editor changes before its transaction runs. Edits or loads after
the write starts remain in the editor when the commit completes. Tests use an
async memory storage adapter through the same session interface.

The first transaction copies the exact legacy localStorage value into IndexedDB.
The old key remains as a backup. Later saves use IndexedDB only. Reload older
open tabs after this update. An older app version cannot read later saves; export
the current library before a rollback, then import that file. If IndexedDB is
unavailable, writes fail and local edits remain.

Map, hero, and saved comp IDs are persistent storage keys. Keep these IDs when
names, images, or map pools change. Do not reuse a removed ID for another item.

The version 1 library validates each stored entry separately. Valid comps can
load and save while entries with obsolete IDs, draft rules, or malformed data
stay stored for recovery. These entries count toward storage limits. Both
Export all and the recovery export include them. Imports reject a file if any
entry cannot load; storage does not change.

The current legacy migration is explicit: `decodeDraft` validates sequential
`firstTeam`/`choices` data, then calls `migrateLegacyDraft` to produce team slots.
It keeps the saved comp ID. Valid migrations are saved when the library changes.
Entries without a Deadpool role stay editable; no role is guessed.

For a format or rule change, add an explicit migration at the decode boundary
before current validation. For a new envelope version, add a version-specific
migration in `decodeCompLibrary`. Keep the old decoder or rule definition needed
to validate the source. Add a regression for the old data and the migrated result.
Do not map retired IDs without a known replacement or guess lost draft choices.
If migration cannot preserve meaning, keep the raw entry unavailable for recovery.

## Changelog publication

The public [Changelog](https://rivalslab.dev/changelog) shows the release notes
bundled with the deployed app. `releases/published.json` stores published history.
`releases/pending.json` stores reviewed notes with stable IDs. Add a concise note
for each user-visible change. Keep a pending note's ID when you edit its text.
Use a new ID for a later change to an already published feature.
Start each note's text with `Feature: ` for new capabilities or `Bug fix: ` for
corrections to existing behavior.

`npm run deploy` builds one production candidate and publishes that exact output
with `cf deploy --prebuilt --mode production`. It then checks the unique build ID
and complete feed at the Worker's public `release-manifest.json`. Only a successful
command and matching live manifest promote the candidate to published history.
The command consumes only pending notes with matching IDs and text. Commit the
updated JSON files after publication. Notes whose IDs are already published do
not create another entry. Deployment with no new notes keeps the current history.
Ordinary development and builds include published history only.
Direct `cf deploy` also includes only recorded history. Use `npm run deploy`
to publish new notes.

The release date is the UTC day when the deploy command starts. It is not the
exact time Cloudflare finishes. The first record is an observed site snapshot on
2026-10-01. It does not claim when each feature first became available.

Reviewed notes plus automatic publication keep feature descriptions useful and
bind them to the app bundle. Commit summaries can include internal or undeployed
work. An external feed would require separate storage and a second publication
step. A rollback restores both the older app and its older changelog. A later
deployment publishes the complete history from its source checkout.
The [cf deployment documentation](https://developers.cloudflare.com/cf/projects/#deploy-a-prebuilt-build)
defines the prebuilt output and mode options.

Build or deploy failure leaves the published JSON and pending notes intact.
A local `.release/deploy.lock` prevents builds and deploys from sharing output.
If a process stops without cleanup, check that no build or deploy is running
before removing that directory. A failed build can be retried directly.

An uncertain deployment result, failed live check, or local publication error
leaves `.release/receipt.json` and its candidate directory. The directory holds
the exact feed and built output. Another deploy refuses to start while this
receipt exists. Check the active Worker deployment with `cf workers deployments
list --worker rivals-lab`, then check `release-manifest.json` at
`https://rivals-lab.juanix.workers.dev/`. Compare its `releaseId` with the receipt's
`id` and its full feed with the receipt's `releases`. Use `npm run deploy:confirm`
when the candidate is live. This command verifies the live manifest again and
finishes local publication. If the candidate is not live, use
`npm run deploy:discard` after checking the active deployment, then retry the
deploy. Discard only removes local evidence. It does not roll back Cloudflare.
Do not delete a receipt before you check the live deployment.

`npm run test:releases` tests publication and failure without contacting Cloudflare.
