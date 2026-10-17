# Backup

The `Backup` button in the top bar opens a dialog that downloads all browser data as one JSON file, or imports a backup or comps file.

## Sub-features

- `backup-download` `Download full backup` saves `rivals-lab-backup-YYYY-MM-DD.json` with saved comps, the open comp, the board, custom maps, and icon size.
- `backup-import` `Import file…` reads a backup or comps file, shows a preview, then replaces data or adds comps (see `tests/backup.spec.ts`). No flow.

## How to get to it (user POV)

- On any page, choose `Backup` in the top bar. The dialog title is `Back up everything in this browser`.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Download.** Run `node .claude/skills/verify/scripts/drive.mjs backup`. It opens `/board`, chooses `Backup`, then `Download full backup`. The file name matches `rivals-lab-backup-YYYY-MM-DD.json`, its `format` is `rivals-lab-backup`, and it holds board tokens. The file is saved under `artifacts/verify/backup/`.

## Gotchas

- The date in the file name uses UTC.
- Import replaces browser data for a full backup. Use a fresh browser context, never a profile with real data.
