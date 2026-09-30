# Rivals Lab

Use Node.js 22.18.0 or later. Install dependencies with `npm ci`.

## Development

- `npm run dev`: start the development server.
- `npm run check`: check TypeScript types.
- `npm run build`: create the production build.
- `npm run deploy`: build and deploy to Cloudflare Workers.
- `npm test`: run browser tests. See [test setup](tests/README.md).

## Formatting

- `npm run format`: format supported project files with Prettier.
- `npm run format:check`: check formatting without changing files.

## Deployment

Live app: https://rivals-lab.juanix.workers.dev

Sign in to Cloudflare with `npx cf auth login`, then run `npm run deploy`.
The `rivals-lab` Worker serves static files built by Vite. Build output is in
`.cloudflare/output/v0/`. No database or server code is required.

Saved comps stay in each user's browser. Deployment does not add shared storage.

The project uses the default Prettier rules in `.prettierrc.json`.
Dependencies, build output, coverage, and generated test reports are excluded
through `.prettierignore`.

Before a pull request, run `npm run format:check`, `npm run check`, and
`npm run build`.
The Release checks workflow runs these checks for pull requests and pushes to
`main`. Check the pull request status and Actions logs before release.

## Board history

Board history stays in the current session and resets on reload. It stores up to
100 edits across undo and redo, plus the current board. New edits discard the
oldest saved entries when needed and clear redo. Unchanged actions preserve history.

Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo. Ctrl+Y also redoes on
Windows/Linux. These shortcuts leave editable fields to native text editing.

## Saved comp compatibility

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
