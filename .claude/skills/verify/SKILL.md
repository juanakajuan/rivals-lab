---
name: verify
description: Launch and drive the Rivals Lab web app (Position Board, Draft / Comp Builder, Changelog) in a real Chromium to prove a change works. Use after any UI or behavior change, or when asked to run, screenshot, or confirm the app.
---

# Verify Rivals Lab

Rivals Lab is a Vite + React single-page app served at `/board`, `/builder`, and `/changelog`. There is no backend; saved comps live in the browser's IndexedDB. Drive it with Playwright in Chromium, and prove behavior with screenshots plus asserted state.

Run every command from the repo root. Feature recipes are in [features/README.md](features/README.md); read the matching file before driving.

## Launch

```bash
node .claude/skills/verify/scripts/server.mjs up
```

This starts a private Vite dev server on `127.0.0.1:4181` (override with `VERIFY_PORT`), writes its pid to `.claude/skills/verify/.run/server.pid`, and prints the URL when `/board` answers. Logs go to `.claude/skills/verify/.run/server.log`. It refuses to reuse a port this run did not start. Do not use port 4173 or 4174: tests and other worktrees own them.

## Doctor

```bash
node .claude/skills/verify/scripts/server.mjs doctor
```

Read-only. Prints JSON and exits non-zero if the pid file is missing, the URL does not answer, or the page is not served by Vite. Run it first whenever a drive fails.

## Drive

```bash
node .claude/skills/verify/scripts/drive.mjs <flow>
```

Flows: `builder-save`, `board-undo`, `export-png`, `changelog`. Each opens a fresh Chromium context (empty IndexedDB), asserts state, and exits non-zero on failure. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` if the Playwright browser is not installed.

For a feature with no flow, copy a flow in `scripts/drive.mjs`. Use stable handles: ARIA roles and names (`Comp name`, `Allies slot 1: Choose hero`, `Undo`, `Redo`, `Download & Copy`), `.coordinates`, `.selection-name strong`, `.stage-host canvas`. The board canvas is 1200 units wide; scale mouse coordinates by `bounds.width / 1200`.

## Evidence

Each flow writes to `artifacts/verify/<flow>/` (gitignored): numbered screenshots, `console.log` with browser console and page errors, and the downloaded PNG for `export-png`. Proof standards:

- Use the real UI path (clicks, typing, mouse drag). Do not call app internals.
- Capture the action and the resulting state, not only the last screen.
- For persistence, reload the page and assert the stored value comes back.
- For export, check the downloaded file exists and is a real PNG, not only the status text.
- Attach media to PRs with `npm run media:upload`. Never commit it.

## Cleanup

```bash
node .claude/skills/verify/scripts/server.mjs down
```

Stops the server this run started (kills its process group by pid, never by name) and removes the pid file. It leaves `artifacts/verify/` in place as proof. Run it after every failed attempt too.

## Isolation

Each drive uses a fresh browser context, so two drives never share saved comps. Two servers can run if they use different `VERIFY_PORT` values. Never drive a server this run did not start.
