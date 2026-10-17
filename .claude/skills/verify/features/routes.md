# Page routes

The app has three pages and a not-found page. Each page sets the browser tab title.

## Sub-features

- `routes-canonical` a known path opens with any capitalization or a trailing slash, and the URL changes to the lowercase form. `/` stays `/` and opens the board.
- `routes-title` the tab title is `<page label> | Rivals Lab`.
- `routes-not-found` an unknown path shows `Page not found` with a `Back to the Position Board` link.

## How to get to it (user POV)

- Type a URL, or choose a link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Routes.** Run `node .claude/skills/verify/scripts/drive.mjs routes`. `/BUILDER/` becomes `/builder` with the title `Draft / Comp Builder | Rivals Lab`. `/no-such-page` shows the `Page not found` h1 and the title `Page not found | Rivals Lab`. `Back to the Position Board` opens `/board`, and the `Position Board` link gets `aria-current="page"`.

## Gotchas

- The `Pages` navigation shows on every page, including not-found. A visible nav link does not prove which page is open; check `aria-current` or the h1.
