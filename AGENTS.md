# Repository Guidelines

## Project Structure & Module Organization

The product is a Next.js and TypeScript app in `workbench/`. Routes and API handlers live in `workbench/app/`; UI components are in `workbench/components/workbench/`; shared logic, provider adapters, validation, and session code are in `workbench/lib/`; browser hooks are in `workbench/hooks/`. Tests are in `workbench/tests/`, and implementation notes are in `workbench/docs/`. Root files such as `prd.md`, `README.md`, and `development-plan.md` describe product context; `design-system/oralign-workbench/MASTER.md` holds visual guidance. Follow the additional `workbench/AGENTS.md` instructions when changing the app.

## Build, Test, and Development Commands

Use Node.js 20.9 or newer. Run these commands from `workbench/`:

- `npm install`: install dependencies from the lockfile.
- `cp .env.example .env.local`: create local configuration; fill in provider keys as described in `docs/api-configuration.md`.
- `npm run dev`: serve the app at `http://127.0.0.1:4173`.
- `npm test`: run the TypeScript tests with `tsx` and Node's test runner.
- `npm run lint` and `npm run typecheck`: check ESLint rules and strict TypeScript types.
- `npm run build`: create a production Next.js build.

## Coding Style & Naming Conventions

Use two-space indentation, double-quoted strings, semicolons, and typed TypeScript interfaces or aliases where they clarify contracts. Keep React components in PascalCase files (for example, `PracticeReview.tsx`), hooks named `useSomething`, and utility modules in kebab-case (for example, `audio-clip.ts`). Use the `@/` alias for imports rooted in `workbench/`. ESLint uses Next.js Core Web Vitals and TypeScript rules; run it before submitting changes.

## Testing Guidelines

Add focused tests in `workbench/tests/` as `*.test.ts`, using `node:test` and `node:assert/strict`. Test provider and API behavior with mocked responses rather than live paid calls. Run `npm test`, `npm run lint`, and `npm run typecheck` for code changes; run `npm run build` when routes or build configuration change. No numeric coverage threshold is defined.

## Commit & Pull Request Guidelines

Recent commits use short, imperative English subjects, sometimes with a `feat:` prefix; keep each commit focused. In pull requests, summarize the user-facing change, list verification commands, link a relevant issue or planning document when one exists, and include screenshots for UI changes.

## Security & Configuration

Keep provider credentials in `workbench/.env.local`; never commit keys, recordings, or generated build files. Preserve server-only handling of API keys and review `workbench/docs/api-configuration.md` before changing provider settings.
