# Backup

The `Backup` button in the top bar opens a dialog that downloads all browser data as one JSON file, or imports a backup or comps file.

## Sub-features

- `backup-download` `Download full backup` saves `rivals-lab-backup-YYYY-MM-DD.json` with saved comps, the open comp, the board, custom maps, and icon size.
- `backup-import` `Import file…` (input `Import backup or comps file`) reads a backup or comps file and shows a preview. A full backup shows `Replace everything in this browser?` with `Download this browser’s backup first`, `Cancel`, and `Replace browser data`, which writes the data and reloads the page. A comps file shows `Add N comps as copies?` with `Add comps`, then the status `Imported N comps as copies.` (see `tests/backup.spec.ts`).
- `backup-newer` a file from a newer version is refused with `Import failed. …` and nothing is written. A newer backup `version` gives `This backup was made by a newer version of Rivals Lab. Update and try again.`. A newer board record gives `This data was saved by a newer version of Rivals Lab. Reload the page to update.`.

## How to get to it (user POV)

- On any page, choose `Backup` in the top bar. The dialog title is `Back up everything in this browser`.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Download and import.** Run `node .claude/skills/verify/scripts/drive.mjs backup`. It opens `/board`, adds `Angela` to Allies, chooses `Backup`, then `Download full backup`. The file name matches `rivals-lab-backup-YYYY-MM-DD.json`, its `format` is `rivals-lab-backup`, and its board tokens include `angela`. The file is saved under `artifacts/verify/backup/`. Then, in a second fresh browser context, a copy with `version: 2` is refused, and the real file shows the replace preview. `Replace browser data` reloads the page with `Allies 1`.

## Gotchas

- The date in the file name uses the browser's local time zone. Only `exportedAt` in the file is UTC.
- Import replaces browser data for a full backup. Use a fresh browser context, never a profile with real data.
