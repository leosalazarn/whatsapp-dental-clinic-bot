# GEMINI.md — Valeria WhatsApp Bot · Dra. [Doctor Name]

→ See [CLAUDE.md](./CLAUDE.md) for full project context · [BUSINESS_RULES.md](./docs/reference/BUSINESS_RULES.md) for
rules and flow · [TECH_STACK.md](./docs/reference/TECH_STACK.md) for stack details

## 1. Project Context

**Valeria** is an AI-powered WhatsApp bot for **Dra. [Doctor Name]'s** aesthetic dentistry practice in Colombia.

- **Goal:** Qualify leads from Meta ads, capture patient data, and guide them to pay a deposit for a consultation.
- **Tone:** Informal Colombian Spanish ("tú"), warm, professional, maximum 3 lines per message, maximum 1 emoji.

## 2. Engineering Standards

- **Modules:** Use ES Modules (`import/export`). No CommonJS.
- **Async:** Always use `async/await` with `try/catch` blocks.
- **Constants:** Centralize all business logic and user-facing text in `src/config.js`.
- **Logging:** Use `src/utils/logger.js` with specific emoji prefixes.
- **Testing:** New features or bug fixes MUST include Vitest tests in `tests/`.

## 3. Development Workflow

1. **Research:** Read `CLAUDE.md` and `docs/PROJECT_FILES.md` for context.
2. **Strategy:** Propose changes before implementation.
3. **Execute:** Surgical edits to relevant modules in `src/`.
4. **Validate:** Run `npm test` and verify no hardcoded strings or sensitive data leaks.

## 4. Key Commands

- `npm test`: Run all Vitest suites.
- `npm start`: Start the production server.
- `npm run dev`: Start with nodemon (if configured).

---
*Created 31/03/2026. This file takes precedence over general defaults.*
