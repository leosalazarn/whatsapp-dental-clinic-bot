# 📦 Project Files Overview

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Modules](https://img.shields.io/badge/modules-16-lightgrey)

**Project:** Valeria — AI Assistant · Dra. [Doctor Name]'s clinic
**Repository:** [github.com/[author]/whatsapp-dental-clinic-bot](https://github.com/[author]/whatsapp-dental-clinic-bot)  
**Last updated:** June 10, 2026

→ See [README.md](../README.md) for setup and deployment · [SECURITY.md](../docs/SECURITY.md) for data
policy · [CLAUDE.md](../CLAUDE.md) for full project context

---

## File Structure

```
valeria-dental-bot/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── AGENTS.md           ← AI personas for OpenCode sessions
├── CLAUDE.md            ← context for AI assistants
├── GEMINI.md            ← context for AI assistants
├── README.md            ← entry point
├── assets/              ← static assets
│   └── logo.png     ← practice logo for dashboard header
├── public/              ← client-facing static files
│   └── dashboard.html   ← Lead Dashboard UI (single-file, CSP, ES/EN locales)
├── .github/             ← CI/CD automation
│   └── workflows/
│       └── ci.yml       ← GitHub Actions CI pipeline
├── docs/                ← project documentation
│   ├── ROADMAP.md       ← status and future phases
│   ├── PROJECT_FILES.md ← this file
│   ├── SECURITY.md      ← data policies & auth
│   ├── sdd/             ← Software Design Document
│   │   └── README.md    ← architecture, data model, API design
│   ├── adr/             ← Architecture Decision Records
│   │   ├── README.md    ← ADR index + template
│   │   └── 001-supabase-crm.md
│   ├── api/             ← API documentation
│   │   └── README.md    ← endpoint reference
│   ├── guides/          ← developer guides
│   │   └── README.md    ← index
│   └── reference/       ← canonical DRY sources
│       ├── TECH_STACK.md    ← stack + constants
│       ├── BUSINESS_RULES.md ← rules + flow + classification
│       └── ENDPOINTS.md     ← all API routes
├── scripts/             ← SQL database scripts (DDL/DCL)
│   ├── 01_schema.sql    ← Table & Index definitions
│   └── 02_security.sql  ← RLS Policies & Security
├── tests/               ← Vitest test suite
│   ├── crm.test.js
│   ├── session.test.js
│   ├── classifier.test.js
│   ├── intent.test.js
│   ├── flow.test.js
│   ├── prompt.test.js
    │   ├── validators.test.js
    │   ├── guardrails.output.test.js
    │   ├── model-router.test.js
    │   └── utils/
│       └── time.test.js
└── src/                 ← source code
    ├── config.js        ← constants & env validation
    ├── crm.js           ← Supabase patient CRM
    ├── session.js       ← Supabase session management
    ├── classifier.js    ← message routing rules
    ├── prompt.js        ← dynamic prompt engineering
    ├── ai.js            ← Claude API integration
    ├── whatsapp.js      ← Meta Cloud API integration
    ├── intent.js        ← signal parsing & CRM updates
    ├── flow.js          ← main orchestration logic
    ├── db/              ← database abstraction
    │   └── client.js    ← shared Supabase client singleton
    ├── errors/          ← error handling layer
    │   └── index.js     ← custom error classes
    ├── guardrails/      ← AI output safety
    │   └── output.js    ← bank data leak detection per phase
    ├── model-router.js  ← multi-layer router — phase/keyword/length/LLM → SIMPLE/COMPLEX
    ├── middleware/       ← express middleware
    │   └── auth.js      ← API key authentication
    ├── validators/      ← input validation
    │   └── index.js     ← sanitization helpers + injection detection
    ├── types/           ← JSDoc type definitions
    │   └── index.js     ← shared type annotations
    ├── routes/
    │   ├── webhook.js   ← WhatsApp events & anti-flood
    │   └── debug.js     ← authenticated analytics (session + x-api-key)
    └── utils/
        ├── logger.js    ← emoji-prefixed logging
        └── time.js      ← timezone management
```

---

## Source Modules

| File                    | Responsibility                                                                                                                         |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `server.js`             | Express entry point — mounts routes, session middleware, dashboard login endpoints, starts server                                      |
| `config.js`             | Env vars, business constants, all user-facing message templates                                                                        |
| `crm.js`                | Supabase patient store — persistent lead data (appointment handoff to Gestión Odontológica)                                            |
| `session.js`            | Supabase conversation store — persistent history & phase state                                                                         |
| `classifier.js`         | 4-rule classifier: group → IN_TREATMENT → active session → new contact                                                                 |
| `prompt.js`             | Builds dynamic system prompt with Spanish security guardrails                                                                          |
| `ai.js`                 | Claude API wrapper — 3-retry exponential backoff (2s, 4s) — returns `{ text, input_tokens, output_tokens }`                            |
| `whatsapp.js`           | Sends messages via Meta WhatsApp Cloud API                                                                                             |
| `intent.js`             | Parses `NAME:` / `GOAL:` / `EXTRACTED:` signals from AI responses                                                                      |
| `flow.js`               | Full pipeline: classify → conversion flow → AI → strip signals → send                                                                  |
| `routes/webhook.js`     | Meta verification + inbound messages + 5s debounce + 10-msg anti-flood                                                                 |
| `guardrails/output.js`  | Bank data leak detection — blocks the clinic's configured account numbers and holder ID outside PAYMENT phase                          |
| `validators/index.js`   | Input sanitization + 10-pattern injection detection (ignore/forget, system prompt, DAN, jailbreak)                                     |
| `public/dashboard.html` | Lead Dashboard UI — single-file HTML, Tailwind CSS, Chart.js, CSP, ES/EN locales, session auth                                         |
| `routes/debug.js`       | `/leads`, `/stats`, `/metrics` (funnel + router telemetry + cost estimates) — protected by session OR `x-api-key`                      |
| `model-router.js`       | Multi-layer classifier: phase → keyword → length → LLM-as-judge; returns `{ route, layer }`; telemetry persisted via `recordRouting()` |
| `utils/logger.js`       | Emoji-prefixed console logging — no sensitive data in output                                                                           |
| `utils/time.js`         | Colombia timezone helper (`America/Bogota`)                                                                                            |

---

## Test Suite

![Framework](https://img.shields.io/badge/framework-Vitest-yellow)

```bash
npm test            # run once
npm run test:watch  # watch mode
```

| Suite                       | Tests          | What it covers                                                                    |
|-----------------------------|----------------|-----------------------------------------------------------------------------------|
| `crm.test.js`               | 14             | Patient CRUD, defaults, merging, `data_complete` auto-promotion                   |
| `session.test.js`           | 13             | Lifecycle, `updateSession`, history sliding window, timers                        |
| `classifier.test.js`        | 9              | All 4 classification rules                                                        |
| `intent.test.js`            | 15             | NAME/GOAL extraction, all intent types, EXTRACTED parsing, CRM side effects       |
| `flow.test.js`              | 16             | `stripSignals`, `POSITIVE_RESPONSES`, full pipeline with mocked AI/WhatsApp       |
| `prompt.test.js`            | 20             | Prompt content, phase-specific sections, session context injection                |
| `validators.test.js`        | 3              | Injection pattern detection (10 patterns)                                         |
| `guardrails.output.test.js` | 5              | Bank data leak detection per phase, fallback messaging                            |
| `model-router.test.js`      | 15             | Multi-layer (phase/keyword/length/LLM), routeMessage, invalid JSON + API fallback |
| `utils/time.test.js`        | 7              | ISO output, Colombia timezone offset, edge cases                                  |
| **Total**                   | run `npm test` |                                                                                   |
