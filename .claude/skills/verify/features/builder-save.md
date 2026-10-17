# Comp Builder save

The builder lets users name a comp, pick heroes, write notes, choose a map, and save it to the saved comps list. The open comp also autosaves, so a reload shows the last edits without `Load`.

## Sub-features

- `save-name` the comp name is saved and shown in the saved list.
- `save-heroes` slot hero picks survive reload.
- `save-notes` slot notes and comp notes survive reload.
- `save-map` map choice survives reload (see `tests/compBuilder.spec.ts`).
- `save-autosave` the open comp comes back after a reload with no click.
- `save-load` `Load <name>` opens a saved comp.
- `save-status` the `.save-status` line reads `New comp · not saved`, `Unsaved changes`, `All changes saved`, or the last action, such as `Saved <name>.`, `Loaded <name>.`, or `New comp.`.
- `library` `New comp`, `Search saved comps`, card `Rename`, `Export`, and `Delete`, plus `Import` and `Export all` (see `src/CompLibraryPanel.tsx`, `src/SavedCompCard.tsx`). No flow.
- `draft` the `Draft format` select (Free build, MRC, Ignite) adds ban and save slots (see `tests/draft.spec.ts`). No flow.

## How to get to it (user POV)

- Open `/builder`.
- Choose the `Draft / Comp Builder` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Save, autosave, and load.** Run `node .claude/skills/verify/scripts/drive.mjs builder-save`. It fills `Comp name`, picks `Doctor Strange` for `Allies slot 1: Choose hero`, fills the notes, chooses `Comp map` then `Midtown` (the caption reads `Midtown · Convoy`), and chooses `Save`. The status reads `Saved Verify plan.`. After a reload every field is back and the status reads `All changes saved`. Then it chooses `New comp`, reloads, and chooses `Load Verify plan`. The status reads `Loaded Verify plan.` and every field is back.

## Gotchas

- A hero picker is a dialog; choose the hero inside `dialog`.
- A hero already on a team is disabled in other slots of that team. Its name becomes `<Hero> — Already on this team.`.
- Saved comps and the open comp live in IndexedDB per browser context, so a fresh context starts empty.
- Because of autosave, a reload alone does not prove `Load`. Open an empty comp with `New comp` first.
- Read the builder status from `.save-status`. Other `status` regions can exist on the page.
