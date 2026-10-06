---
name: verify-rivals-lab
description: Drive the Rivals Lab web app in a disposable browser and capture proof of Position Board, Draft / Comp Builder, and Changelog behavior. Use when changing UI, routes, board edits, saved comps, or changelog rendering, and before calling that behavior done.
---

# Verify Rivals Lab

Rivals Lab is a local web app. A user opens Position Board, Draft / Comp Builder, or Changelog. Saved comps, the open comp, board placements and drawings, custom maps, and icon size stay in that browser's IndexedDB. Board undo history resets on reload.

This skill launches a private Vite dev server and a private Chromium profile, drives them with Playwright, and writes proof under `artifacts/verify/`. It does not replace `npm test` or `npm run test:production`. Those suites cover regressions. This skill is how an agent exercises the running app and keeps evidence.

The release CLI (`npm run deploy`, `npm run deploy:confirm`, `npm run deploy:discard`) is a maintainer command, not a page in the app. Do not drive it here.

## Launch

From the checkout root, with dependencies installed (`npm ci`) and Chromium installed for the locked Playwright (`npx playwright install chromium`):

```bash
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs launch
```

`launch` starts `npm run dev -- --host 127.0.0.1 --port 4183 --strictPort` and opens `http://127.0.0.1:4183/` in a new Chromium profile. Ready output includes `ready http://127.0.0.1:4183` and `title Position Board | Rivals Lab`. The server log is `.cursor/skills/verify-rivals-lab/.run/server.log`. The browser log is `.cursor/skills/verify-rivals-lab/.run/driver.log`.

Override the port or run directory when 4183 is taken or a second instance is required:

```bash
RIVALS_VERIFY_PORT=4185 RIVALS_VERIFY_RUN=/tmp/rivals-lab-verify-b \
  node .cursor/skills/verify-rivals-lab/scripts/verify.mjs launch
```

Both variables must be set together for a second instance. The port must be an integer from 1 to 65535.

Leave these servers alone. They belong to other workflows:

- Vite's default `npm run dev` on port 5173
- `npm test`, which starts its own dev server on `PLAYWRIGHT_DEV_PORT` (default 4173)
- `npm run test:production`, which previews the production build on port 4174

`launch` uses `--strictPort` and exits if its port is taken. It also refuses to start when this run directory already has a live server or browser. A second instance needs its own port, `RIVALS_VERIFY_RUN`, and therefore its own profile. IndexedDB and board session state are not shared across profiles or ports.

To use an installed Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` before `launch`, the same way the Playwright suites do.

## Doctor

Run this before driving, and again whenever the page, port, or profile looks wrong:

```bash
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs doctor
```

Doctor is read-only. It passes only when all of these are true:

- The state file is `.cursor/skills/verify-rivals-lab/.run/state.json` (or `$RIVALS_VERIFY_RUN/state.json`).
- The recorded server pid is alive, its command is `npm`, and its cwd is this checkout.
- That process tree is listening on the recorded port.
- `GET` of the recorded URL returns the dev page titled `Position Board | Rivals Lab`.
- The recorded browser driver is alive and the open page is on that same origin, with the visible label `Rivals Lab` once and the document title `Position Board | Rivals Lab`.

Doctor does not attach to a server it did not launch. If it fails, run `cleanup` and `launch` again. Do not point the verifier at a server you started by hand.

## Drive

Every drive command talks to the browser `launch` already opened. Run them from the checkout root. A new command does not reload the page. Board edits, open dialogs, and unsaved comp fields survive from one command to the next. `reload` and `goto` do load the page again: board undo history is discarded; stored data in this profile's IndexedDB remains.

`assert-visible` waits up to 10 seconds and requires exactly one match. Use `assert-count` when the expected count is zero or more than one.

```bash
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs goto /builder
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs reload
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs url
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Clear"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Delete Verify dive" --accept-dialog
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs fill --label "Comp name" --value "Verify dive"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs fill --role searchbox --name "Search heroes" --value "angela"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs press --key Escape
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs select --label "Draft format" --value mrc
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs set-input-files --label "Upload map image" --file artifacts/verify/choose-map/sample.png
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs text --role button --name "Allies 0"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs assert-visible --role heading --name "Changelog"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs assert-visible --text "October 1, 2026"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs assert-value --label "Comp notes" --value "Hold high ground"
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs assert-count --role button --name "Allies 0" --count 1
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs assert-attribute --role link --name "Position Board" --attribute aria-current --value page
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs snapshot --path artifacts/verify/place-hero/added.aria.yml
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs screenshot --path artifacts/verify/place-hero/added.png
```

`--name` is exact. `--name-pattern` is a JavaScript regular expression and is not exact. `--label` uses the accessible label. Prefer roles and accessible names from the feature map over CSS selectors or coordinates.

`--accept-dialog` accepts the next browser confirm. Without it, Playwright dismisses the confirm and the action is cancelled. Delete, discard, and replacing the Position Board all use confirms.

`set-input-files` paths are resolved from the checkout root. The command can target a file input that is not visible.

`snapshot` and `screenshot` refuse paths outside `artifacts/verify/`. The screenshot is a full-page image and includes the `Rivals Lab` header.

Read [features/README.md](features/README.md) before choosing a recipe. Drive the entry point the task actually changed. A proof of one entry point does not cover the others listed in that feature.

## Evidence

Write proof under `artifacts/verify/<feature-id>/`. `cleanup` does not delete that directory.

For each proof, capture the user action and the state it produced:

- An ARIA snapshot and a full-page screenshot of the resulting screen. The header `Rivals Lab` must be visible in the screenshot.
- The command that performed the action, copied into the notes you report with the artifact paths.
- A second user-facing check of anything that is stored. Saved comps must be loaded again after `reload`. Board edits must be visible on the board after the click and again after `reload`.
- Side effects you can observe without a test-only hook. A downloaded comp file or PNG is a download, not a status string. An IndexedDB save is proven by loading the comp after reload in this same profile.

Do not call session methods, storage adapters, or Playwright fixtures under `tests/`. Do not treat `npm test` output as this skill's proof.

The dev server is the same UI as local development. It is not the production asset build. Clipboard image copy still depends on browser permissions; a status that mentions the clipboard is not proof that a file was written.

## Cleanup

```bash
node .cursor/skills/verify-rivals-lab/scripts/verify.mjs cleanup
```

Cleanup shuts down the browser driver recorded in this run's state file, stops Chromium processes whose command line contains this run's profile directory, and stops the recorded `npm` process group. It then deletes the run directory and the scratch profile under `/tmp/rivals-lab-verify-*` for this run. It does not delete `artifacts/verify/`.

It never signals a process by name. If a recorded pid has been reused by a command that is not this run's `npm` or `verify.mjs`, cleanup leaves that pid alone.

Run cleanup after a failed launch too, so a broken attempt does not keep the port.

## Helpers

The only helper is `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs`. `launch` starts an internal `driver` child; do not invoke `driver` yourself.

| Command            | Effect                                                               |
| ------------------ | -------------------------------------------------------------------- |
| `launch`           | Start the dev server and the private browser.                        |
| `doctor`           | Report whether that instance is safe to drive.                       |
| `cleanup`          | Stop that instance and keep `artifacts/verify/`.                     |
| `goto <path>`      | Open a path on the verification origin.                              |
| `reload`           | Reload the current page.                                             |
| `url`              | Print the current page URL.                                          |
| `click`            | Click one accessible target. Optional `--accept-dialog`.             |
| `fill`             | Replace the target's value. Requires `--value`.                      |
| `press`            | Press a key on the page. Requires `--key`.                           |
| `select`           | Choose a `<select>` option. Requires `--value`.                      |
| `set-input-files`  | Set a file input. Requires `--file`.                                 |
| `text`             | Print the target's visible text.                                     |
| `assert-visible`   | Wait until exactly one target is present.                            |
| `assert-value`     | Wait until one field has `--value`.                                  |
| `assert-count`     | Wait until the target count equals `--count`.                        |
| `assert-attribute` | Wait until one target's attribute equals `--value`.                  |
| `snapshot`         | Write an ARIA snapshot. Requires `--path` under `artifacts/verify/`. |
| `screenshot`       | Write a full-page PNG. Requires `--path` under `artifacts/verify/`.  |
