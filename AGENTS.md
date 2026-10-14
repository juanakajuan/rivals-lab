# Agent instructions

## Worktrees

- Make all changes in a git worktree on its own branch. Do not edit files in the main checkout.
- If your session is not already in a worktree, run `git fetch origin`, then create one with `git worktree add -b <branch> .claude/worktrees/<task-slug> origin/main`. Work only in that path.
- Use one worktree for each task. Do not share a worktree with another agent.
- Run `npm install` in a new worktree before you build or test.
- After the PR merges, remove your worktree with `git worktree remove <path>` and delete its branch with `git branch -D <branch>`. Do not remove a worktree that has uncommitted changes.
- To remove all stale worktrees, run `npm run worktrees:clean -- --dry-run`, examine the list, then run `npm run worktrees:clean`. A worktree is stale if it is clean and its PR is merged or closed, or its branch has no commits beyond `origin/main`.

## Release notes

- For each user-visible change, add a short note to `releases/pending.json` before opening the PR.
- Commit the note on the same branch as the change. If the PR is already open, add the note to that PR.
- Describe what users can now see or do in one short sentence. Omit implementation details.
- Use the existing `{ "id": "...", "text": "..." }` format. Give each new note a unique, stable ID.
- Start every note's `text` with `Feature: ` or `Bug fix: `. Use `Feature: ` for new capabilities and `Bug fix: ` for corrections to existing behavior.
- When revising a pending note, keep its ID. For a later change to a published feature, use a new ID.
- Preserve other pending notes. Skip changes to documentation, tests, or internal code unless they change user-visible behavior.
- Follow the release note format in [README.md](README.md#changelog-publication). The deploy script assigns dates and updates published history.

## Issues and pull requests

- Include screenshots or videos in the description of every new GitHub issue and PR that involves a visible change or bug.
- Show the before and after state when a PR changes existing UI.
- Never commit screenshots or videos to the repo. Attach them through GitHub's upload in the description or comment, and keep local captures out of git.
- To attach media from the command line, run `npm run media:login` once on each machine, then `npm run media:upload -- <PR or issue URL> <files>`. It prints one link per file. Put the links in the description. The login stays in `~/.cache/gh-upload-profile`.
