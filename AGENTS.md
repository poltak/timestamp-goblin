# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds TypeScript source for the extension: `content.ts`, `popup.ts`, `storage.ts`, and helpers.
- `src/assets/` contains icons and static assets used by the extension.
- `scripts/` contains build and packaging scripts (`build.mjs`, `package.mjs`).
- `dist/` is generated output (MV3 bundle, `popup.html`, and `manifest.json`). Do not edit manually.
- `env.d.ts` and `tsconfig.json` define TypeScript configuration.

## Build, Test, and Development Commands

- `npm install`: install dev dependencies.
- `npm run build`: build a development bundle into `dist/`.
- `npm run dev` or `npm run build:watch`: watch mode rebuilds on changes.
- `npm run build:prod`: production build (minified, `NODE_ENV=production`).
- `npm run package`: production build + zip output to `timestamp-goblin.zip`.
- `npm run check`: TypeScript typecheck only (`tsc --noEmit`).
- `npm run format`: format `ts/json/md` with Prettier.

## Coding Style & Naming Conventions

- TypeScript, ES modules, and 4-space indentation (match existing files).
- Prefer `camelCase` for variables/functions, `PascalCase` for types/interfaces.
- Keep functions small and focused; reuse helpers in `src/util.ts` or `src/youtube.ts`.
- Use Prettier for formatting; avoid manual line wrapping.

## Testing Guidelines

- Vitest is used for unit tests (`src/**/*.test.ts`).
- Run `npm run test:run` for a single pass.
- Use `npm run check` for type checking.

## Commit & Pull Request Guidelines

- Commit messages are short, imperative, sentence case (e.g., "Bump version", "Fix bug in non-watch mode build").
- PRs should describe the change, note user-facing impact, and include screenshots for popup UI updates.
- Link relevant issues if available.

## Security & Configuration Tips

- This is a Chrome MV3 extension; load locally via `chrome://extensions` -> "Load unpacked" and select `dist/`.
- Avoid storing sensitive data in `chrome.storage`; only video metadata/progress is expected.
