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

## Mac Handoff Notes

- Open this repository as a local Codex project on the Mac.
- Copy `.env.local` from the Windows machine to the Mac manually; do not paste secrets into chat.
- Local Codex memories are per machine. Keep durable project guidance in this file and in checked-in docs instead of relying on old chat/session history.
