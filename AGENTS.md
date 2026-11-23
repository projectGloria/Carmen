# AGENTS.md — Carmen

Windows-first Electron 44 + React 19 (Vite 8) lossless FLAC audio fetcher and music library organizer driving multi-source webview scraper cascades (Lucida, Monochrome) with Vorbis tagging and M3U8 export.

## Commands
- Install: `npm ci`
- Run / Dev (UI mock on `:5173`): `npm run dev:ui`
- Run (Electron app): `npm run build:ui && npm start`
- Test (all Node unit tests): `npm test`
- Test (single file / pattern): `node --test test/pool.test.mjs` / `node --test --test-name-pattern="cancel" test/controller.test.mjs`
- Test (Electron integration, requires `ffmpeg` on `PATH`): `npm run test:electron`
- Test (packaged smoke check): `npm run pack && npm run test:packaged`
- Lint: `npm run lint`
- Build / Package: `npm run build:ui` (renderer -> `dist/`), `npm run pack` (unpacked dir), `npm run dist:win` / `npm run dist:portable` (outputs to `release/`)

## Architecture
- `main.js` — CommonJS Electron main process owning filesystem access, `will-download` staging/finalization, non-NTFS hard-link fallback, speed limiting, transfer pause/resume, persisted state (`queue`, `config`, `history`, `cache`, `profiles`), JSONL diagnostics, tray, single-instance lock, and the `http-json` CORS proxy.
- `src/engine/` — Pure ESM orchestration (`controller.mjs`, `pool.mjs`, `chain.mjs`, `worker.mjs`, `sources.mjs`, `cascade-lucida.mjs`, `cascade-monochrome.mjs`, `matching.mjs`, `flac-identity.mjs`, `flac-artwork.mjs`, `profile-output.mjs`, `m3u8.mjs`). Must NEVER import Electron, React, or app-window DOM directly; bridge exclusively through `src/engine/electron-bridge.mjs` and `src/engine/renderer-integration.mjs`.
- `src/ui/` — React 19 view layer (`App.jsx`, `views/`, `components/`). `src/ui/engine.js` subscribes to the engine via `useSyncExternalStore` (falling back to `src/ui/mock.js` outside Electron); high-frequency byte progress bypasses the store via `useTransferProgress`.
- `test/` & `scripts/` — `node:test` unit suites (`test/*.test.mjs`), UI fixtures (`test/ui-fixture.jsx`), and real-Electron smoke/qualification scripts (`scripts/smoke-electron.mjs`, `scripts/qualify-sources.mjs`).
- **Version Manifests:** `package.json`, `package-lock.json`, `gloria.toml` (keep versions synced across all listed files).

## Personal Rules (Brain)
- **Commit Format:** Write one plain sentence stating what changed and why; do not use `feat:`/`fix:`/`chore:` conventional-commit prefixes.
- **Commit & Push Policy:** Never run `git commit`, `git tag`, or `git push` unless explicitly asked; never force-push to `main`. When the user says "commit and push", verify the build and tests pass, confirm version manifests are bumped and synced for code/packaging changes, commit on `main`, and push to `origin main` (do not create manual release tags—pushing to `main` triggers `.github/workflows/release.yml` to build with `gloria-setup` and publish to GitHub Releases).
- **Path Privacy:** Always use `C:\Users\you` in documentation, comments, and examples—never hardcode the local machine's real username.
- **Window Chrome:** Disable native OS titlebars; build an integrated frameless titlebar with drag region, double-click maximize, and custom min/max/close controls.
- **Desktop Shell Lock:** Lock the app shell to `100vw x 100vh` (`overflow: hidden`) with internal scroll panes and `user-select: none` on UI chrome.
- **Scrollbars:** Ban raw OS scrollbars; use thin (4–6px) themed scrollbars with transparent tracks and zero layout shift.
- **Interactive Controls:** Custom-style all form controls; define explicit `hover`, `active`, `focus-visible`, and `disabled` states with snappy 120–180ms transitions.
- **Git Branching:** Never create new branches or git worktrees. Always work directly on `main` until explicitly told otherwise.
- **Versioning (Minimal Changes):** When runtime code or packaging changes, bump the alpha number by `+1` (e.g., `0.1.0-alpha.1` -> `0.1.0-alpha.2`) across all version manifests in the repo **at most once per uncommitted change set** (check `git diff HEAD` first—if the working tree version is already ahead of `HEAD`, do not bump again until committed). Skip version bumps on docs-only or read-only tasks.
- **Versioning (Major/Minor Changes):** Before changing minor/major versions or dropping `-alpha` on breaking or major feature work, stop and ask for the exact target version.

## Playbooks (Read Before Task)
- **Building & Packaging (GloriaSetup):** Read `.brain/building-the-project.md` before packaging, compiling release binaries, or building an installer.
- **GitHub Actions & Releases:** Read `.brain/github-actions.md` before creating/modifying `.github/workflows/*.yml`, setting up release automation, or preparing a first release push.

## Repo Guardrails & Gotchas
- **Self-Contained Injected Functions:** Cascade functions serialized via `Function.prototype.toString()` (`cascade-lucida.mjs`, `cascade-monochrome.mjs`, `matching.mjs`) must close over zero module-scope bindings (enforced by `test/injectable.test.mjs`). Keep `base: './'` and `build.minify: false` in `vite.config.mjs`.
- **Webview & Renderer Security Boundary:** The main window uses `nodeIntegration: true`, `contextIsolation: false`, and `webviewTag: true`, while `main.js` strips Node/preload from every attached `<webview>` and enforces `src/engine/network-guard.mjs`. Never loosen `<webview>` isolation.
- **Packaging Allowlist (`build.files`):** `package.json` `build.files` explicitly lists every `src/engine/*` module dynamically imported by `main.js` (and their transitive imports). Update `build.files` whenever main-process engine imports gain a dependency.
- **Live Runtime Data & Persistence Handshake:** In dev, `DATA_ROOT` is the repo root, so `state/` and `logs/` hold live runtime data—never use them as fixtures or commit them. Persistence writes are serialized per destination and flushed on quit/close; any new debounced writer must join that flush.
- **Duplicated Path Sanitization:** Reserved-name and folder-sanitizing rules exist in both `sanitizeFolder` (`src/engine/sources.mjs`) and `WINDOWS_RESERVED` (`main.js`); update both together.
- **UI Selector & Function-Slice Coupling:** `scripts/smoke-electron.mjs` and `test/ui-fixture.jsx` query exact selectors/text (`.nav-item`, `.topbar button` text with counts in `data-count`, `.mode-tab`, `#music-search`, `#profile-search`, `label.switch .track`, `#vol`, `.transfer-pct`, `.transport`), and `test/ui-reliability.test.mjs` `vm`-evaluates slices of `src/ui/views/AddView.jsx` (`toQueueItem`->`formatDuration`, `previewError`->`withoutExisting`, `downloadProfile`->`queuePlaylist`). Keep those functions adjacent and update tests when changing selectors.
- **Code Style & Reliability Context:** Preserve CommonJS in `main.js` and ESM in `src/engine/`, 2-space indentation, single quotes, semicolons, correctness-only ESLint rules (`eslint.config.mjs`), and `catch (e) { /* reason */ }` comments explaining non-obvious failure modes. Consult `RELIABILITY.md` and `review/` before changing retries, rate-limit cooldowns, or persistence.

## Done Criteria
Run `npm run lint` and `npm test` (plus `npm run test:electron` for main-process, IPC, UI, or packaging changes), confirm zero errors, and verify version manifests (`package.json`, `package-lock.json`) are synced when runtime or packaging code changed.

<!-- brain-sync: 8d80a5ed2479 -->