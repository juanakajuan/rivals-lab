# Changelog

The changelog page lists published release notes, one entry per date, latest first.

## Sub-features

- `changelog-open` the page loads from navigation and a direct URL.
- `changelog-dates` releases with the same date show as one entry.
- `changelog-published-only` pending notes never show.

## How to get to it (user POV)

- Open `/changelog`.
- Choose the `Changelog` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Open.** Run `node .claude/skills/verify/scripts/drive.mjs changelog`. It opens `/builder`, chooses the `Changelog` link, and asserts the URL `/changelog`, the title `Changelog | Rivals Lab`, `aria-current="page"` on the link, and the `Changelog` h1. It reads `releases/published.json` and `releases/pending/`, then asserts one `.release-entry` per published date, the latest note first, and no `[data-note-id]` for a pending note.

## Gotchas

- The page shows only `releases/published.json`. Pending notes in `releases/pending/` never show, in dev or in production. The deploy script moves them into a dated release.
- `vite.config.ts` reads the feed once when it loads, with no hot reload. After you edit `releases/published.json`, restart the server.
