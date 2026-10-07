# Read the changelog

Read the changelog lets a user open dated notes for deployed features and return to other pages without losing unsaved builder text from this visit.

## Sub-features

- `changelog-open` opens the Changelog from its route and from the pages navigation.
- `changelog-published` shows published notes, including the 1 October 2026 snapshot.
- `changelog-back` returns to a comp note typed earlier in the same visit.

## How to get to it (user POV)

- Open `/changelog`.
- Choose `Changelog` in the `Pages` navigation.

## Driving it with verify.mjs

Preconditions:

- Doctor reports the verification URL and a private browser profile.
- The dev server was launched after the last edit to `releases/published.json`. Pending notes are not part of the page.

- **Open the route.** Go to `/changelog`. Run `node .claude/skills/verify/scripts/verify.mjs goto /changelog`. The heading `Changelog` is present, the link `Changelog` has `aria-current` `page`, and the text `Updates to deployed features. Latest first. Dates use UTC.` is present.
- **Read a published note.** Check the first recorded release. Run `node .claude/skills/verify/scripts/verify.mjs assert-visible --text "October 1, 2026"` and `node .claude/skills/verify/scripts/verify.mjs assert-visible --text "Feature: First recorded release. Place heroes on maps and draw positions and rotations with undo and redo."`. Both strings are present once.
- **Refresh.** Reload the page. Run `node .claude/skills/verify/scripts/verify.mjs reload`. The link `Changelog` still has `aria-current` `page`.
- **Leave an unsaved note.** Open the builder, type a note, then choose `Changelog`. Run `node .claude/skills/verify/scripts/verify.mjs goto /builder`, `node .claude/skills/verify/scripts/verify.mjs fill --label "Comp notes" --value "Keep after changelog"`, and `node .claude/skills/verify/scripts/verify.mjs click --role link --name "Changelog"`. The heading `Changelog` is present.
- **Come back.** Choose `Draft / Comp Builder`. Run `node .claude/skills/verify/scripts/verify.mjs click --role link --name "Draft / Comp Builder"` and `node .claude/skills/verify/scripts/verify.mjs assert-value --label "Comp notes" --value "Keep after changelog"`. The note typed in this visit is still there.
- **Proof.** Return to the Changelog and capture it. Run `node .claude/skills/verify/scripts/verify.mjs click --role link --name "Changelog"`, `node .claude/skills/verify/scripts/verify.mjs snapshot --path artifacts/verify/changelog/page.aria.yml`, and `node .claude/skills/verify/scripts/verify.mjs screenshot --path artifacts/verify/changelog/page.png`. Both artifacts show `Rivals Lab`, `Changelog`, and `October 1, 2026`.

## Gotchas

- The page shows published notes only. A note that exists solely in `releases/pending.json` is absent.
- The running dev server reads published notes at startup. Restart the verification instance after changing `releases/published.json`, or the page still shows the previous feed.
- Dates are UTC and formatted in English. `2026-10-01` is the visible text `October 1, 2026`. `October 3, 2026` appears on more than one release, so `assert-visible` is the wrong check for that date; `October 1, 2026` is unique.
- `goto /builder` after visiting the Changelog loads the route fresh and clears an unsaved comp note. Use the `Draft / Comp Builder` link to return to the note typed in this visit.
- Reload of the builder also clears that unsaved note. The Changelog recipe's return trip has to stay in the same page session.
