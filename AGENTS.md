# Agent instructions

## Release notes

- For each user-visible change, add one file `releases/pending/<id>.json` before opening the PR. The file name is the note ID. Use lowercase letters, digits, and single hyphens.
- Commit the note on the same branch as the change. If the PR is already open, add the note to that PR.
- Describe what users can now see or do in one short sentence. Omit implementation details.
- Put only `{ "text": "..." }` in the file. Give each new note a unique, stable ID.
- Start every note's `text` with `Feature: ` or `Bug fix: `. Use `Feature: ` for new capabilities and `Bug fix: ` for corrections to existing behavior.
- When revising a pending note, keep its file name. For a later change to a published feature, use a new ID.
- Do not edit other notes' files. Skip changes to documentation, tests, or internal code unless they change user-visible behavior.
- `npm run test:releases` fails when a note has no prefix or uses an ID that is already in `releases/published.json`.
- Follow the release note format in [README.md](README.md#changelog-publication). The deploy script assigns dates and updates published history.

## Issues and pull requests

- Run `npm run verify` before you push a branch for a PR. It must exit 0.
- Include screenshots or videos in the description of every new GitHub issue and PR that involves a visible change or bug.
- Show the before and after state when a PR changes existing UI.
- Never commit screenshots or videos to the repo. Attach them through GitHub's upload in the description or comment, and keep local captures out of git.
- To attach media from the command line, run `npm run media:login` once on each machine, then `npm run media:upload -- <PR or issue URL> <files>`. It prints one link per file. Put the links in the description. The login stays in `~/.cache/gh-upload-profile`.
- The `check-pr` job fails a PR that breaks one of these rules. Run `npm run check:pr -- <PR number>` to check an open PR.
  - A change to `src/` code needs a change under `tests/`, or a `no-test: <reason>` line in the PR body.
  - A `.tsx` or `.css` change needs a media link in the PR body, or a `No visible change` line.
  - A change to `AGENTS.md`, `CLAUDE.md`, or `.claude/**` needs the scope `agents` in the PR title, for example `docs(agents): <summary>`.
