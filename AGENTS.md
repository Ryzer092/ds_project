<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes (Next AI Agent)

- Spec: Japanese requirements doc v2.0 (P0 only). See README.md for status and design decisions.
- Never call paid APIs in tests; CI uses fixtures (`SEARCH_MODE=demo`). Never fill live failures with demo data.
- Product data (titles, prices, images) is transient: do not persist it in DB/Redis/logs/browser storage, and never send it to the LLM.
- Source features stay disabled until a reviewed record exists in `lib/policies/source-policies.ts`.
- Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, E2E: `pnpm test:e2e`.
