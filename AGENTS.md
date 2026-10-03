# Agent instructions

## GitHub issues and pull requests

- For GitHub issues and pull requests that affect what users see or interact with, include high-quality screenshots or a screen recording when needed to explain the problem or change.
- Upload issue and PR captures directly as GitHub attachments. Keep captures outside the repository. Do not commit them or use `docs/screenshots`.
- Track images only when documentation or test fixtures need them.

## Release notes

- For each user-visible change, add a short note to `releases/pending.json` before opening the PR.
- Commit the note on the same branch as the change. If the PR is already open, add the note to that PR.
- Describe what users can now see or do in one short sentence. Omit implementation details.
- Use the existing `{ "id": "...", "text": "..." }` format. Give each new note a unique, stable ID.
- Start every note's `text` with `Feature: ` or `Bug fix: `. Use `Feature: ` for new capabilities and `Bug fix: ` for corrections to existing behavior.
- When revising a pending note, keep its ID. For a later change to a published feature, use a new ID.
- Preserve other pending notes. Skip changes to documentation, tests, or internal code unless they change user-visible behavior.
- Follow the release note format in [README.md](README.md#changelog-publication). The deploy script assigns dates and updates published history.
