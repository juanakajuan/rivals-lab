# Comp Builder save

The builder lets users name a comp, pick heroes, write notes, save to the browser, and load it again after a reload.

## Sub-features

- `save-name` the comp name is saved and shown in the saved list.
- `save-heroes` slot hero picks survive reload.
- `save-notes` slot notes and comp notes survive reload.
- `save-map` map choice survives reload (see `tests/compBuilder.spec.ts`).

## How to get to it (user POV)

- Open `/builder`.
- Choose the `Draft / Comp Builder` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Save and reload.** Run `node .claude/skills/verify/scripts/drive.mjs builder-save`. It fills `Comp name`, picks `Doctor Strange` for `Allies slot 1: Choose hero`, fills the notes, and chooses `Save`. A status reads `Saved Verify plan.`. After reload, `Load Verify plan` restores every field.

## Gotchas

- A hero picker is a dialog; choose the hero inside `dialog`.
- A hero already on a team is disabled in other slots of that team.
- Saved comps live in IndexedDB per browser context, so a fresh context starts empty.
