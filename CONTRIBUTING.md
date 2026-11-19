# Contributing to Carmen

Thanks for your interest in contributing to Carmen.

## Development setup

1. Fork the repository and clone your fork:
   ```powershell
   git clone https://github.com/<your-username>/Carmen.git
   cd Carmen
   npm ci
   ```
2. Preview the React UI with mock data:
   ```powershell
   npm run dev:ui
   ```
3. Or build the renderer and run Electron:
   ```powershell
   npm run build:ui
   npm start
   ```

## Architecture & guidelines

- Follow the repository guidelines in [`AGENTS.md`](AGENTS.md) and architecture notes in [`CLAUDE.md`](CLAUDE.md).
- Keep `src/engine/` independent of Electron and React so core download logic stays unit-testable in Node.
- Keep injected scraper functions (`src/engine/cascade-lucida.mjs`, `src/engine/cascade-monochrome.mjs`) self-contained with no outer scope closures.
- Review [`RELIABILITY.md`](RELIABILITY.md) before modifying retry, queue, or persistence behavior.
- Never commit live runtime `state/` or `logs/` directories.

## Before opening a pull request

Run the test suite and linter locally:

```powershell
npm test
npm run lint
```

If your change touches Electron main-process behavior, IPC, or packaging, also run:

```powershell
npm run test:electron
```

(`npm run test:electron` requires `ffmpeg` on `PATH`.)

In your pull request description, include:
- A concise summary of the behavior change and motivation.
- Links to any relevant issues.
- Validation results (tests run and pass/fail status).
- Screenshots for UI changes.
