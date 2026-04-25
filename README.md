# Dental PreCheck (Tauri Desktop)

Desktop app for pre-op psychology and occlusal perception assessment.

## Stack

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2 (Windows/macOS ready)
- Database: SQLite (rusqlite in Rust backend)
- Charts: ECharts

## Commands

```bash
npm install
npm run dev          # tauri dev
npm run build        # frontend build only
npm run tauri:build  # tauri release executable (--no-bundle)
```

## Output

After `npm run tauri:build`, the executable is generated at:

`src-tauri/target/release/dental-precheck-tauri.exe`

## Notes

- The app migrates legacy Electron database automatically on first run:
  - from `%APPDATA%\\dental-precheck-desktop\\data\\dental_precheck.sqlite`
  - to Tauri app data directory.
- Admin default password: `Dental@2026`
