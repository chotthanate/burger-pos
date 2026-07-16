# Work Status

Updated: 2026-07-17

## Important live-system context

- The mobile dashboard synchronization fix is merged into `main` and deployed through GitHub Pages.
- On 2026-07-16, the live Supabase `products` app-state row was restored from the real Google Sheet catalog after an old four-item test catalog appeared on phones. The restored catalog contained 22 entries when verified.
- Recovery snapshots are stored only in the local ignored `tmp/recovery-2026-07-16/` directory. They must not be committed or deleted automatically.

## Pending work

- No known source-code work is pending. Before changing live product synchronization again, verify which device writes to Supabase and which device uses the Google Sheets fallback.
