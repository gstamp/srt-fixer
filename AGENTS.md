# Agent Guidelines (srt-fixer)

Keep it simple and Bun-first. If unsure, ask.

## Commands
- Use Bun instead of Node: `bun <file>`
- Scripts/tests: `bun run <script>`, `bun test`
- Build: `bun build <file.html|file.ts|file.css>`
- Install: `bun install`
- One-off tools: `bunx <package> <command>`
- Do not use dotenv; Bun loads `.env` automatically

## Runtime & APIs
- CLI app only (no server/web stack).
- Files: prefer `Bun.file` and `Bun.write` over `node:fs`.

## Tests
- Use `bun test` and `bun:test`
