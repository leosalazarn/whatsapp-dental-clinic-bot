# Security Policy — Valeria WhatsApp Bot

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Security](https://img.shields.io/badge/security-hardened-brightgreen)

→ See [README.md](../README.md) for setup · [PROJECT_FILES.md](./PROJECT_FILES.md) for module reference

---

## Supported Versions

Only the latest version deployed on Render.com is actively maintained and receives security updates.

| Version              | Supported |
|----------------------|-----------|
| latest (main branch) | ✅        |
| older commits        | ❌        |

---

## Sensitive Data Policy

### Data Classification

| Data                     | Classification     | Storage               |
|--------------------------|--------------------|-----------------------|
| Anthropic API key        | Critical           | Render env vars only  |
| Meta access token        | Critical           | Render env vars only  |
| Webhook verify token     | Critical           | Render env vars only  |
| Debug API key            | Critical           | Render env vars only  |
| Banking account numbers  | Critical           | Render env vars only  |
| Account holder name / ID | Sensitive          | Render env vars only  |
| Patient data             | Personal / Medical | Supabase (PostgreSQL) |

### Rules

- **No sensitive data in source code** — ever. All secrets via environment variables exclusively.
- **No sensitive data in documentation** — `CLAUDE.md`, `README.md`, and all markdown files committed to the repository
  must contain only placeholder values.
- **No sensitive data in logs** — `logger.js` logs only truncated message text and masked phone numbers.
- **Banking details** are injected into the AI prompt at runtime from env vars and are never persisted to disk or
  version control.
- **Patient data persistence** is handled by Supabase with Row Level Security (RLS) or internal API access.

---

## Credential Management

### Storage

All credentials are stored exclusively as **Render environment variables** (encrypted at rest, not visible in build
logs).  
The `.env` file is listed in `.gitignore` and must never be committed.  
`.env.example` contains only placeholder keys (`...`) — no real values.

### Authentication

Access to debug endpoints (`/debug/leads`, `/debug/stats`, `/debug/metrics`) requires one of:

- **Session cookie** (recommended for dashboard): established by `POST /dashboard/login` with valid API key in body.
  Returns an HttpOnly, sameSite lax, 24-hour session — no API key stored on the client.
  Cookie uses `secure: true` in production (`NODE_ENV === 'production'`), `false` locally for HTTP dev.
  Server trusts first proxy (`app.set('trust proxy', 1)`) for Render HTTPS termination.
- **`x-api-key` header** (for external/scripted access): matches `DEBUG_API_KEY` env var.

The dashboard (`/dashboard-valeria-statistics`) uses the session-based flow exclusively: API key is posted once,
validated server-side, and never persisted in `sessionStorage` or `localStorage`. It is also rate-limited to 30
requests per 15 minutes per IP.

### CSRF Protection

All state-changing requests under `/dashboard/*` are protected by `lusca.csrf()` middleware (scoped via
`app.use('/dashboard', lusca.csrf())`). The client must send a valid `x-csrf-token` header on POST requests,
fetched from `GET /dashboard/csrf-token` at page load. This protects against cross-site request forgery
(CWE-352, CodeQL `js/missing-token-validation`).

### Token Types

The Meta access token should be a **permanent token** generated via:  
`Meta Business Suite → Settings → System Users → Generate token → whatsapp_business_messaging`

---

## Input Validation & Injection Prevention

| Control                        | Implementation                                                                                                                                                                                         |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Prompt guardrails              | System prompt includes explicit instructions in Spanish to reject jailbreaks and off-topic requests.                                                                                                   |
| Injection detection            | `validators/index.js` — 10 regex patterns detect `ignore/forget`, system prompt extraction, DAN, and jailbreak attempts before reaching the LLM                                                        |
| Webhook challenge sanitization | `hub.challenge` validated against `/^\d+$/` before reflection — prevents XSS on verification endpoint                                                                                                  |
| Webhook signature verification | `routes/webhook.js` — `verifyMetaSignature()` validates Meta `x-hub-signature-256` HMAC-SHA256 over the raw body using `crypto.timingSafeEqual`; missing/invalid signature returns `401` (fail closed) |
| Non-text message rejection     | Only `type === 'text'` messages reach the AI pipeline.                                                                                                                                                 |
| Anti-Flood Mechanism           | Debounce of 5s, hard cap of 5 messages before immediate processing, and an absolute max of 10 messages per burst to prevent token exhaustion and prompt clutter.                                       |
| Signal stripping               | `NAME:`, `GOAL:`, `EXTRACTED:` signals removed from AI responses via `stripSignals()` before delivery to patient                                                                                       |
| Output guardrails              | `guardrails/output.js` — scans AI responses for the clinic's configured bank account numbers and holder ID; blocks leaks outside PAYMENT phase                                                         |
| SIMPLE/COMPLEX routing         | `model-router.js` classifies messages via Haiku — invalid JSON or API error silently falls back to SIMPLE (Haiku), preventing misrouting                                                               |

---

## Patient Privacy

- Valeria operates on a **dedicated WhatsApp line**.
- Patient data is persisted in **Supabase**, allowing for seamless conversation recovery after server restarts.
- The bot **never asks for national ID (cédula)** or additional phone numbers.
- Conversation history uses a **sliding window of 20 messages** to manage context efficiency.

---

## Vulnerability Reporting

If you discover a security vulnerability, please contact the repository owner directly via private message. Do not open
public issues for security flaws.
