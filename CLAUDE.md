# CLAUDE.md — Valeria WhatsApp Bot · Dra. [Doctor Name]

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Status](https://img.shields.io/badge/status-phase--3--conversion-brightgreen)

> This file transfers the full project context to an AI assistant.  
> Created 09/03/2026. Keep it updated with every significant change.

→ See [README.md](./README.md) for setup and deployment · [ROADMAP.md](./docs/ROADMAP.md) for
status · [SECURITY.md](./docs/SECURITY.md) for data
policy · [PROJECT_FILES.md](./docs/PROJECT_FILES.md) for module reference

---

## 1. PROJECT DESCRIPTION

AI-powered WhatsApp bot for **Dra. [Doctor Name]'s** aesthetic dentistry practice in Colombia. The bot is
named **Valeria**.

**Goal:** Capture leads from Meta ads (Click-to-WhatsApp), qualify them, collect their data, and guide them to pay a
deposit to confirm a consultation appointment with the doctor.

**The appointment is confirmed by a human receptionist** — Valeria only captures data and provides payment details.

---

## 2. ABSOLUTE BUSINESS RULES

- ❌ **NEVER give exact treatment prices** — only approximate ranges when patient insists (configured in
  `config.js TREATMENT_PRICES`)
- ❌ **NEVER ask for ID or additional phone number** — phone is already known from WhatsApp
- ❌ **NEVER confirm or schedule appointments** — only capture data (appointment scheduling is handled manually by clinic
  staff in Gestión Odontológica)
- ✅ Dra. Yuri is a woman: always "la Dra. Yuri" or "la doctora"
- ✅ Valeria always uses informal "tú" — natural, warm Colombian Spanish
- ✅ Maximum 3 lines per message
- ✅ Maximum 1 emoji per message
- ✅ Deposit required to confirm the slot — amounts set in env vars (BOOK_PRICE, CONSULTATION_PRICE)

---

## 3. TECH STACK

| Component | Solution                                                                                                                          |
|-----------|-----------------------------------------------------------------------------------------------------------------------------------|
| WhatsApp  | Meta Cloud API (free up to 1k conversations/month)                                                                                |
| AI        | Anthropic Claude — Haiku (`claude-haiku-4-5-20251001`) default, Sonnet (`claude-sonnet-4-6`) for complex queries via model-router |
| Server    | Node.js + Express + express-session + express-rate-limit + lusca (CSRF)                                                           |
| Hosting   | Render.com                                                                                                                        |
| Database  | Supabase (PostgreSQL) — lead data & metrics                                                                                       |

---

## 4. INFRASTRUCTURE

| Component         | Status | Detail                                                             |
|-------------------|--------|--------------------------------------------------------------------|
| GitHub Repo       | ✅      | github.com/[author]/whatsapp-dental-clinic-bot (public)                 |
| Render Deploy     | ✅      | https://your-app.onrender.com                            |
| Anthropic API Key | ✅      | Set in Render env vars                                             |
| Supabase          | ✅      | Lead data & metrics — credentials in Render env vars               |
| Meta App          | ✅      | "valeria-bot" (App ID in Render env vars)                          |
| Webhook verified  | ✅      | Connected and active                                               |
| Meta Token        | ✅     | Permanent token configured                                         |
| WhatsApp Number   | ✅     | Real clinic production number active                               |
| Meta App          | ✅     | Live mode                                                          |
| Render plan       | ⚠️     | Free (sleeps after 15 min) — upgrade to $7/month before going live |

---

## 5. ENVIRONMENT VARIABLES (Render)

```env
ANTHROPIC_API_KEY=sk-ant-...          # Anthropic API key
WA_ACCESS_TOKEN=...                    # Meta permanent token
WA_PHONE_NUMBER_ID=...                 # Meta phone number ID
VERIFY_TOKEN=...                       # Webhook verification token
BANK_HOLDER_NAME=...                   # Account holder full name
BANK_HOLDER_ID=...                     # Account holder national ID number
BANK_ACCOUNT_1=...                     # Primary bank account number
MOBILE_WALLET_NUMBER=...               # Mobile wallet / digital payment number
BANK_ACCOUNT_2=...                     # Secondary bank account number
SUPABASE_URL=...                       # Supabase → Project Settings → API → Project URL
SUPABASE_SERVICE_ROLE_KEY=...          # Supabase → Project Settings → API → server uses a privileged key that bypasses row-level security
DEBUG_API_KEY=...                      # Custom key for metrics protection
```

---

## 6. PROJECT STRUCTURE

See [PROJECT_FILES.md](./docs/PROJECT_FILES.md) for the full file tree and per-module descriptions.

Key layout: `src/` (all modules), `tests/` (Vitest suites), `public/` (dashboard.html), `docs/` (roadmap,
security, files).

---

## 7. KEY CONSTANTS (config.js)

```js
MODEL_SIMPLE = 'claude-haiku-4-5-20251001'  // SIMPLE messages (greetings, FAQs)
MODEL_COMPLEX = 'claude-sonnet-4-6'         // COMPLEX messages (objections, multi-intent)
TOKENS_SIMPLE = 400                         // response token limit for SIMPLE
TOKENS_COMPLEX = 700                        // response token limit for COMPLEX
CLASSIFIER_MAX_TOKENS = 50                  // classification token limit (model-router)
CLASSIFIER_LENGTH_THRESHOLD = 120           // char threshold for length heuristic
CONSULTATION_PRICE = ...              // set in config.js
BOOK_PRICE = ...                      // set in config.js
MIN_RANGE_PRICE = 2_700_000          // lowest treatment range (COP)
MAX_RANGE_PRICE = 24_000_000         // highest treatment range (COP)
CONSULTATION_DURATION_MINUTES = 30   // consultation duration
REENGAGEMENT_DELAY_HOURS = 23        // send re-engagement 1h before Meta's 24h window closes
SESSION_EXPIRY_HOURS = 72            // expire sessions after 72h of total inactivity
```

---

## 8. CONVERSATION FLOW (flow.js)

```
START → EXTRACTION → HOOK → [CONSENT if not given] → DATA_CAPTURE → PAYMENT → CLOSING
```

| Phase        | Entry condition                                      | Action                                                      |
|--------------|------------------------------------------------------|-------------------------------------------------------------|
| START        | First ever message                                   | Advance to EXTRACTION (patients ask freely before consent)  |
| CONSENT      | Entering DATA_CAPTURE without prior consent         | Request Ley 1581 consent; on affirmative persist `consent_given` and advance to DATA_CAPTURE |
| EXTRACTION   | No name or no aesthetic_goal                         | AI extracts name and goal naturally (commercial Q&A free)    |
| HOOK         | Has name + goal AND ≥3 exchanges (MIN_EXCHANGES = 3) | Hardcoded consultation pitch                                |
| DATA_CAPTURE | Patient responds positively to hook                  | Asks for full name, email, reason                           |
| PAYMENT      | data_complete = true                                 | Deterministic `MSG_PAYMENT()` template — AI never generates |
| CLOSING      | payment_info_sent = true + next message              | AI awaits receipt, confirms                                 |

---

## 9. MESSAGE CLASSIFICATION (classifier.js)

1. Group message → **IGNORE**
2. Phone status `IN_TREATMENT` → **CURRENT_PATIENT**
3. Active session (phase !== `START`) → **ORGANIC_LEAD**
4. Any new individual contact → **WARM_LEAD**

## 9b. MODEL ROUTER (model-router.js)

Multi-layer classification: **phase → keyword → length → LLM-as-judge**:

| Layer            | Condition                                     | Route          |
|------------------|-----------------------------------------------|----------------|
| Phase override   | PAYMENT, CLOSING, or HOOK+positive            | COMPLEX        |
| Keyword scan     | Matches COMPLEX_SIGNALS (duele, precio, etc.) | COMPLEX        |
| Length heuristic | text.length > 120 chars                       | COMPLEX        |
| LLM-as-judge     | Ambiguous cases classified by Haiku           | SIMPLE/COMPLEX |

| Route   | Model                       | Max tokens | Use case                                |
|---------|-----------------------------|------------|-----------------------------------------|
| SIMPLE  | `claude-haiku-4-5-20251001` | 400        | Greetings, FAQs, basic scheduling steps |
| COMPLEX | `claude-sonnet-4-6`         | 700        | Objections, multi-intent, deep triage   |

Fallback: on API error or invalid JSON → SIMPLE (Haiku). 15 tests.

**Telemetry:** Each routing decision is persisted to `session.metrics.router` — tracks `by_layer`, `by_model`,
accumulated tokens (`haiku_input`, `haiku_output`, `sonnet_input`, `sonnet_output`), and `last_model` per session.
Aggregated in `GET /metrics` as `router` section with cost estimates vs. all-Sonnet baseline.

---

## 10. ENDPOINTS

| Method | Route                         | Purpose                          | Auth                           |
|--------|-------------------------------|----------------------------------|--------------------------------|
| GET    | /debug/                       | Health check                     | Public                         |
| GET    | /webhook                      | Meta verification                | Public                         |
| POST   | /webhook                      | Receive WhatsApp messages        | Public                         |
| GET    | /debug/leads                  | All patients (Supabase)          | x-api-key or session           |
| GET    | /debug/stats                  | Summary by source/status         | x-api-key or session           |
| GET    | /debug/metrics                | Funnel & response time analytics | x-api-key or session           |
| GET    | /dashboard-valeria-statistics | Lead Dashboard UI                | Rate-limited (30/15 min)       |
| POST   | /dashboard/login              | Validate API key, create session | x-csrf-token + API key in body |
| GET    | /dashboard/csrf-token         | Get CSRF token for POST          | Session cookie                 |
| GET    | /dashboard/check-session      | Check if session is active       | Session cookie                 |
| POST   | /debug/reset/:phone           | Reset conversation & session     | x-api-key                      |
| DELETE | /debug/patient/:phone         | Full patient erasure (Ley 1581)  | x-api-key                      |

Dashboard session cookies are HttpOnly, sameSite lax, 24h expiry. `secure: true` in production
(`NODE_ENV === 'production'`), `false` locally. CSRF via `lusca.csrf()` on `/dashboard/*` POST routes.

---

## 11. TECHNICAL DECISIONS

- **Supabase for capture data:** Persistent storage for leads, conversations, and metrics. Appointment data captured by
  Valeria is handed off to clinic staff, who manage scheduling in Gestión Odontológica (the clinic's existing practice
  management system).
- **Dedicated WhatsApp line:** Simplifies lead routing.
- **Price ranges:** Reduces drop-off by providing estimates without exact quotes.
- **Universal reengagement:** Automated follow-ups after 24h of silence.
- **Multi-layer routing:** Phase override → keyword scan → length heuristic → LLM-as-judge. Free layers catch ~70% of
  cases; paid classifier only for ambiguity.
- **Output guardrail:** Filters AI responses for bank data before sending; PAYMENT phase exempt.
- **Input injection detection:** 10 regex patterns catch prompt injection before reaching LLM.
- **Dashboard dual auth:** Session cookie (primary) + x-api-key fallback for debug endpoints.

---

## 12. ENGINEERING WORKFLOW

1. **Research:** Map modules and identify dependencies.
2. **Strategy:** State the plan before making changes.
3. **Act:** Small, focused edits to files.
4. **Validate:** Run `npm test` and verify no security regressions.
