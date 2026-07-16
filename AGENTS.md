# Burger POS Agent Guide

## Project Context

- This repository is the canonical Burger POS / BOY Burger local checkout.
- The app is a Vite + React + Tailwind web POS with Capacitor Android support.
- Supabase is the primary data store. Google Sheets is a secondary copy/reporting target through sync jobs, not the source of truth.
- IndexedDB/local storage can contain device-local queues and settings. Do not treat browser/device local state as the canonical database.

## Safety Boundaries

- Never commit `.env.local`, `.env`, or other secret files.
- Use `.env.example` for required variable names only:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_STORE_ID`
- Preserve the existing Supabase/Google Sheets boundary unless the user explicitly asks to redesign storage.
- Before changing live sync or backend write behavior, state which database/table/sheet will be touched.
- Do not move or delete generated backups under `output/` or `tmp/` unless explicitly requested.
- Never use force push (`git push --force` or `git push --force-with-lease`).
- Never discard, overwrite, reset, clean, stash, or delete local work to make Git succeed unless the user explicitly approves the exact action.
- If Git reports a conflict, divergent history, an unexpected branch, or any uncertain state, stop and explain it in plain language before changing anything.

## PC/Mac GitHub Handoff

The user works on one computer at a time. GitHub is the handoff point between the PC and Mac, and `main` is the normal shared branch unless the user explicitly asks for a feature branch.

### When the user says “เก็บงาน”

1. Run `git status --short --branch` and review every tracked and untracked change. Do not assume an unfamiliar file is disposable.
2. Review the actual diff with `git diff` and, after staging, `git diff --cached`. Confirm the commit contains only the intended project work.
3. Check filenames and staged content for passwords, API keys, `.env` files, credentials, private keys, tokens, database dumps, local backups, and other secrets. Never print secret values in chat or terminal output. If anything suspicious is found, stop and explain before committing.
4. Run tests appropriate to the change. For normal source changes, run at least `npm run build`. Run more targeted checks when relevant. If a test cannot run or fails, report that clearly and do not claim the save succeeded.
5. Update `WORK_STATUS.md` only when work remains unfinished or there is important handoff context that cannot be understood from the code and commit history. Do not add routine or redundant status notes.
6. Stage only reviewed files. Commit with a concise message that says what changed in plain language.
7. Push normally to the current upstream branch. Never force push. If no upstream exists or the current branch is unexpected, stop and explain before pushing.
8. Report the branch, commit, tests run, push result, and any remaining problem in simple Thai.

### When the user says “ทำงานต่อ”

1. Before fetching or pulling, run `git status --short --branch` and inspect untracked files too.
2. If there is any unsaved local work, stop. Explain what files are pending and ask the user what to do. Do not stash, delete, reset, commit, or overwrite them automatically.
3. Confirm the repository and current branch are expected. The normal shared branch is `main`.
4. Run `git fetch --prune origin`, then inspect whether local and remote histories differ.
5. Pull with `git pull --ff-only`. Never use a command that silently creates a merge commit or rewrites history. If fast-forward is impossible, stop and explain.
6. Read the latest commit with `git log -1 --stat --oneline` and read `WORK_STATUS.md` if it exists.
7. Summarize briefly in Thai where the work stopped and what will be continued, then continue from that point.

## Handoff Status File

- `WORK_STATUS.md` is optional, not a daily log.
- Create or update it only for unfinished work, manual deployment/data steps, temporary limitations, or important live-system context that is not visible in the repository.
- Keep it concise and never include secrets, credentials, tokens, or `.env` values.
- Remove obsolete entries when the related work is completed and the facts are clear from code/commits.

## Implementation Preferences

- Keep the UI tablet/mobile-first. Primary target devices include Samsung Galaxy Tab A9+, iPad/iPhone, and Android phones.
- Follow the existing patterns in `src/lib/` before adding new abstractions.
- For Thai receipt printing, check the current app print mode and native/bitmap path before recommending hardware changes.
- Keep checkout, order history, shift open/close, void order, printer settings, and sheet sync behavior stable unless the task is explicitly about those areas.

## Common Commands

```bash
npm install
npm run dev
npm run build
npm run build:android
npm run cap:sync
```

Use `npm run build` after source changes. Use `npm run cap:sync` when Android/Capacitor assets need to be refreshed.
This repository uses npm and the tracked `package-lock.json`; do not introduce pnpm or yarn lock/workspace files.

## Mac Handoff Notes

- Open this repository as a local Codex project on the Mac.
- Copy `.env.local` from the Windows machine to the Mac manually; do not paste secrets into chat.
- Local Codex memories are per machine. Keep durable project guidance in this file and in checked-in docs instead of relying on old chat/session history.
