# MacBook Handoff for Burger POS

Generated on 2026-07-14 from the Windows checkout:

`C:\Users\ADMIN\OneDrive\Documents\New project`

## Goal

Use a MacBook to continue Burger POS work that has been happening on the Windows home computer.

Do not rely on old Codex sessions as the source of truth. The project files, `.env.local`, Supabase, and this handoff are the practical transfer path.

## Repository

Primary remote:

```bash
git clone https://github.com/chotthanate/burger-pos.git
cd burger-pos
```

The Windows checkout is currently on branch `main`.

## Current Windows Working Tree

At handoff creation time, the Windows checkout had uncommitted source changes in:

- `android/app/src/main/java/com/boyburger/pos/ThaiPrinterPlugin.java`
- `android/gradle.properties`
- `scripts/google-apps-script/live/Code.js`
- `src/App.jsx`
- `src/lib/lineNotifications.js`
- `src/lib/nativeThaiPrinter.js`
- `src/lib/posLogic.js`
- `src/lib/printBridge.js`
- `src/lib/sheetExport.js`
- `src/lib/supabaseAppState.js`
- `src/styles.css`

Untracked local artifact folders were also present:

- `designs/`
- `output/`
- `tmp/`

Treat `output/` and `tmp/` as local generated/backups unless the user explicitly asks to recover data from them. Do not commit them by default.

## Required Secret File

Copy `.env.local` from the Windows project root to the Mac project root manually.

Do not commit it and do not paste its values into chat.

Expected variable names:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORE_ID=boy-burger-main
```

If `.env.local` points to the same Supabase project, the Mac will work against the same database. Do not create a new Supabase project unless the goal is to fork the database.

## Mac Setup

Install Node.js on the Mac, then run:

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

For a quick verification:

```bash
npm run build
```

For Android/Capacitor work on Mac, install Android Studio and Android SDK first, then run:

```bash
npm run cap:sync
```

## Codex Setup on Mac

1. Open ChatGPT Desktop / Codex on the MacBook.
2. Add this repo folder as a local project.
3. Enable local memories if desired, but do not assume Windows local Codex memories will be available on the Mac.
4. Start the first task with:

```text
Read AGENTS.md, HANDOFF_FOR_MAC.md, README.md, and supabase/schema.sql. Continue Burger POS work from this Mac checkout. Supabase is the source of truth; Google Sheets is only a secondary copy/report target.
```

## What Not To Transfer

- Do not copy old `~/.codex/sessions` or Windows `C:\Users\ADMIN\.codex\sessions` as the main handoff path.
- Do not commit `.env.local`.
- Do not commit `node_modules/`, `dist/`, `.vite/`, `output/`, or `tmp/`.

## Preferred Transfer Path

Best path:

1. Commit the source changes and these handoff files on the Windows machine.
2. Push a handoff branch to GitHub.
3. Clone or fetch that branch on the Mac.
4. Copy `.env.local` separately.
5. Run `npm install`, `npm run dev`, and `npm run build`.

Fallback path if pushing is not available:

1. Copy the project folder to the Mac through OneDrive, external drive, or zip.
2. Exclude `node_modules/`, `dist/`, `.vite/`, `output/`, and `tmp/`.
3. Copy `.env.local` separately through a private channel.
