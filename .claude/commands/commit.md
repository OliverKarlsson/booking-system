---
description: Review the current working tree changes and commit them, splitting into multiple logical commits when the changes cover unrelated concerns.
---

Review and commit the current uncommitted changes in this repository.

## Steps

1. Run `git status` (never `-uall`) and `git diff` (staged and unstaged) to see everything that has changed. Run `git log --oneline -10` to match this repo's existing commit message style.
2. Read through the actual diffs, not just file names, before deciding how to group anything.
3. Decide whether the changes form **one coherent unit of work** or **multiple unrelated concerns**:
   - One commit if the changes are a single logical piece of work, even if it touches many files (e.g. one feature, one refactor, one fix).
   - Multiple commits if the diff mixes unrelated things — e.g. a docs update plus an unrelated bug fix, or a config change plus a feature change. Split along natural seams (by directory, by concern, by file) using `git add <specific files>` per commit rather than `git add -A`.
4. For each commit:
   - Stage only the files relevant to that commit.
   - Write a concise message (1-2 sentences) focused on *why*, following the style of recent commits in `git log`.
   - Use a heredoc for the commit message body.
   - End the message with:
     ```
     Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
     ```
5. After each commit, run `git status` to confirm the working tree state before moving to the next one.

## Rules

- Never use `git add -A` or `git add .` — stage files by name so unrelated or accidental files (secrets, build artifacts, stray scratch files) can't slip in.
- Before staging, check for anything that looks like it could contain secrets (`.env`, credentials, keys) even if the filename looks innocuous — inspect contents before adding.
- Never use `--no-verify`, `--amend`, or other history-rewriting/hook-skipping flags unless explicitly asked.
- If a pre-commit hook fails, fix the underlying issue, re-stage, and create a **new** commit — don't amend.
- Do not push. This command only creates local commits.
- If there is nothing to commit, say so and stop — don't create an empty commit.
- After all commits are made, show a short summary (`git log --oneline` for the new commits) of what was committed and in what order.
