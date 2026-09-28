# Project instructions

## AI workflow: manual feature testing

When using `$ai-workflow` in this project:

- After implementation and checks are complete, start `npm run dev` from the task worktree before the user handoff. Keep it running as a task-owned persistent background process so it remains available after the Codex turn ends.
- Wait for the task worktree's server to be ready. Read its actual local URL from the output and verify that it responds. Open that exact URL in the user's default browser with the operating system's default URL opener (for example, `xdg-open` on Linux or `open` on macOS). Include the URL with the PR link. If startup or browser access fails, report the failure; do not claim it opened.
- Record the server's worktree, URL, log path, and process identity in the PR's existing progress section. On resume, check the live state and reuse the task's server if it is still running. Do not reuse a server from another worktree or stop an unrelated server to free a port.
- Leave the server running while the user tests the feature. During cleanup, verify the recorded server still belongs to this task, stop it and its child processes, and confirm they have stopped before removing the worktree. Preserve user-owned terminals and unrelated processes.
