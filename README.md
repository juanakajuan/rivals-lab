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

## Board history

Board history stays in the current session and resets on reload. It stores up to
100 edits across undo and redo, plus the current board. New edits discard the
oldest saved entries when needed and clear redo. Unchanged actions preserve history.

Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo. Ctrl+Y also redoes on
Windows/Linux. These shortcuts leave editable fields to native text editing.
