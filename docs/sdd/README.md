# Software Design Document — Valeria Dental Bot

## Version History

| Version | Date       | Author           | Changes                                                            |
|---------|------------|------------------|--------------------------------------------------------------------|
| 1.0     | 2026-05-12 | Leonardo Salazar | Initial version                                                    |
| 1.1     | 2026-06-06 | Leonardo Salazar | Added model-router, mermaid diagram                                |
| 1.2     | 2026-06-08 | Leonardo Salazar | Multi-layer routing (phase/keyword/length/LLM), wired into flow.js |
| 1.3     | 2026-06-10 | Leonardo Salazar | Router telemetry instrumentation — layer/token/ cost per session   |
| 1.4     | 2026-07-15 | Leonardo Salazar | Payment determinism (MSG_PAYMENT), durable re-engagement queue, consent gate repositioned to DATA_CAPTURE |
| 1.5     | 2026-08-10 | Leonardo Salazar | Security hardening: HMAC webhook validation, rate limiting, audit log, PII logging fixes (CodeQL) |
| 1.6     | 2026-08-29 | Leonardo Salazar | Signal tokens ([IN_PERSON_PAYMENT], [RESENT_DATA]), interactive consent buttons, dead code cleanup |

---

## 1. Introduction

### 1.1 Purpose

Valeria is an AI-powered WhatsApp bot for **Dra. [Doctor Name]'s** aesthetic dentistry practice. It captures leads from
Meta ads, qualifies them, collects patient data, and guides deposit payment for consultation appointments.

### 1.2 Scope

- **In scope:** Lead qualification, data capture, payment guidance, re-engagement, analytics
- **Out of scope:** Appointment scheduling (human receptionist), treatment pricing, clinical diagnosis
- **Gestión Odontológica handoff (pending evaluation):** Valeria captures patient data; clinic staff completes
  scheduling in their existing
  practice management system. Whether an API or webhook exists is unconfirmed — no integration work planned until
  evaluation is complete.

### 1.3 Definitions

| Term          | Definition                                                                            |
|---------------|---------------------------------------------------------------------------------------|
| Lead          | A person who messages the clinic's WhatsApp number                                    |
| Phase         | Stage in the conversion funnel (START → EXTRACTION → HOOK → [CONSENT if not given] → DATA_CAPTURE → PAYMENT → CLOSING) |
| Signal        | Internal AI annotation (NAME:/GOAL:/EXTRACTED:) stripped before delivery              |
| Re-engagement | Automated follow-up message after 23h of silence                                      |

---

## 2. Architecture

### 2.1 High-Level Design

```mermaid
flowchart TD
    P[Patient] --> WA[WhatsApp]
    WA --> M[Meta Cloud API]
    M -->|Webhook POST| S[Express Server]

    S --> classifier
    S --> flow
    S --> session

    classifier --> flow

    flow --> model_router[model-router.js]
    model_router -- SIMPLE --> ai_haiku[ai.js · Haiku]
    model_router -- COMPLEX --> ai_sonnet[ai.js · Sonnet]

    ai_haiku --> Claude
    ai_sonnet --> Claude

    flow --> intent[intent.js]
    intent --> crm[Supabase CRM]

    flow --> validators[validators/index.js]
    flow --> guardrails[guardrails/output.js]

    flow --> whatsapp[whatsapp.js]
    whatsapp --> P

    subgraph "Express Server"
        S
        classifier[classifier.js]
        flow[flow.js]
        session[session.js]
        reengagement[reengagement.js]
    end
```

### 2.2 Design Decisions

| Decision                                  | Rationale                                                                                                                                                                |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Dedicated WhatsApp line                   | Every message is a potential patient — no trigger filtering needed                                                                                                       |
| Phase-based flow                          | Hardcoded hooks reduce AI hallucination at critical conversion points                                                                                                    |
| In-memory session + Supabase              | Low-latency reads with persistence across restarts                                                                                                                       |
| Gestión Odontológica (pending evaluation) | Valeria captures patient data; clinic staff completes scheduling. API availability unconfirmed — no integration work planned until evaluated                             |
| AI signal extraction                      | Claude appends NAME:/GOAL: — avoids separate NER model                                                                                                                   |
| 3-line message limit                      | WhatsApp best practice for engagement rates                                                                                                                              |
| Multi-layer routing                       | Phase override (PAYMENT/CLOSING→COMPLEX) → keyword scan → length heuristic (>120 chars) → LLM-as-judge — saves Sonnet tokens on FAQs, dedicates depth to complex queries |
| Router telemetry                          | Per-session `session.metrics.router` tracks by_layer, by_model, accumulated tokens — enables data-driven threshold calibration after 2-3 weeks of production traffic     |
| Spanish classifier prompt                 | Classification system prompt in Spanish to match bot language — strict JSON-only instruction to avoid parsing errors                                                     |
| Fail-safe fallback                        | Any API error or invalid JSON silently defaults to SIMPLE (Haiku) — protects uptime and cost                                                                             |
| Payment determinism                    | `MSG_PAYMENT()` template injects banking details from env vars at send time — AI never generates payment info, eliminating account hallucination |
| Consent gate at DATA_CAPTURE           | Ley 1581 requires consent before PII collection, not before any conversation — patients can freely ask about prices before consent is requested |
| Durable re-engagement queue            | `reengagement_queue` Supabase table + 60s poller replaces in-memory `setTimeout` — survives Render restarts |
| Signal token pattern                   | AI emits `[TOKEN]` in its response; `flow.js` intercepts before delivery and takes deterministic action — clean separation of intent detection and side effects |
| Interactive consent buttons            | WhatsApp `type: "button"` message for Ley 1581 consent — eliminates free-text ambiguity; `button_reply.id` normalized before pipeline in `extractInboundText()` |

---

## 3. Module Map

See [PROJECT_FILES.md](../PROJECT_FILES.md) for detailed module descriptions.

| Layer       | Module              | Responsibility                                                                     |
|-------------|---------------------|------------------------------------------------------------------------------------|
| Entry       | `server.js`         | Express init, route mounting                                                       |
| Routes      | `routes/webhook.js` | Meta verification + inbound messages + debounce                                    |
| Routes      | `routes/debug.js`   | Health check, lead list, stats, funnel metrics                                     |
| Business    | `flow.js`           | Main pipeline orchestration                                                        |
| Business    | `classifier.js`     | 4-rule message classification                                                      |
| Business    | `intent.js`         | Signal parsing + Supabase upsert                                                   |
| Business    | `model-router.js`   | Multi-layer router — phase/keyword/length/LLM → SIMPLE (Haiku) or COMPLEX (Sonnet) |
| Business    | `reengagement.js`   | Durable re-engagement queue + 60s poller (Supabase-backed)                          |
| Security    | `validators/index.js` | Input sanitization + prompt injection detection (10 patterns)                     |
| Security    | `guardrails/output.js` | AI output safety — bank data leak detection, phone hallucination detection        |
| AI          | `ai.js`             | Claude API wrapper with retry                                                      |
| AI          | `prompt.js`         | Dynamic system prompt builder                                                      |
| Data        | `crm.js`            | Supabase lead data persistence                                                     |
| Data        | `session.js`        | Supabase conversation store                                                        |
| Integration | `whatsapp.js`       | Meta Cloud API sender                                                              |
| Utility     | `utils/logger.js`   | Emoji-prefixed logging                                                             |
| Utility     | `utils/time.js`     | Colombia timezone helpers                                                          |

---

## 4. Data Model

### 4.1 Patients Table

| Column                                | Type    | Notes                                   |
|---------------------------------------|---------|-----------------------------------------|
| phone                                 | TEXT PK | WhatsApp number                         |
| name                                  | TEXT    | Detected during EXTRACTION              |
| aesthetic_goal                        | TEXT    | Dental goal detected by AI              |
| status                                | TEXT    | NEW → PROSPECT → CONSULTATION_SCHEDULED |
| source                                | TEXT    | DIRECT or ORGANIC                       |
| data_complete                         | BOOLEAN | All 3 fields captured                   |
| full_name, email, consultation_reason | TEXT    | Captured in DATA_CAPTURE phase          |
| consent_given                         | BOOLEAN | Ley 1581 data-processing consent (migration 04_consent.sql) |
| consent_given_at                      | TIMESTAMPTZ | Timestamp of consent grant                                  |

### 4.2 Conversations Table

| Column  | Type    | Notes                                                                                                         |
|---------|---------|---------------------------------------------------------------------------------------------------------------|
| phone   | TEXT PK | Foreign key-like relationship                                                                                 |
| phase   | TEXT    | START → EXTRACTION → HOOK → DATA_CAPTURE → PAYMENT → CLOSING                                                  |
| history | JSONB   | Sliding window of 10 messages (MAX_HISTORY)                                                                   |
| metrics | JSONB   | Timestamps, response times, re-engagement tracking, router telemetry (by_layer, by_model, tokens, last_model) |

---

## 5. API Design

| Method | Route                      | Auth                       | Purpose                                              |
|--------|----------------------------|----------------------------|------------------------------------------------------|
| GET    | `/webhook`                 | None                       | Meta webhook verification                            |
| POST   | `/webhook`                 | Meta signature             | Receive WhatsApp messages                            |
| GET    | `/debug/`                  | None                       | Health check                                         |
| GET    | `/debug/leads`             | session OR x-api-key       | All patients                                         |
| GET    | `/debug/stats`             | session OR x-api-key       | Summary by source/status/intent                      |
| GET    | `/debug/metrics`           | session OR x-api-key       | Funnel analytics + router telemetry + cost estimates |
| GET    | `/dashboard/csrf-token`    | None (CSRF token endpoint) | Returns CSRF token for dashboard POST                |
| POST   | `/dashboard/login`         | x-csrf-token               | Authenticate via API key, sets session               |
| GET    | `/dashboard/check-session` | session cookie             | Check if session is authenticated
| POST   | `/debug/reset/:phone`              | x-api-key              | Reset conversation state + clear session cache             |
| DELETE | `/debug/patient/:phone`            | x-api-key              | Full patient erasure — right to erasure (Ley 1581)         |
| GET    | `/dashboard-valeria-statistics`    | Rate-limited (30/15min)| Lead Dashboard UI                                          |                    |

---

## 6. Security Architecture

- **Prompt guardrails** reject jailbreaks, topic diversion, roleplay
- **Anti-flood** caps at 10 messages per burst with 5s debounce
- **Deduplication** prevents Meta retry duplicates (60s TTL)
- **Signal stripping** removes internal annotations before delivery
- **Webhook challenge** sanitized to numeric-only before reflection
- **Non-text rejection** blocks media, locations, contacts from AI pipeline
- **Output guardrail** (`guardrails/output.js`) detects bank data leaks outside PAYMENT phase
- **Input injection detection** (`validators/index.js`) catches 10 patterns (ignore/forget, system prompt, DAN,
  jailbreak)
- **Session-based auth** for dashboard — API key POSTed once, stored in JS variable (not sessionStorage)
- **CSRF protection** via lusca on all `/dashboard/*` POST routes
- **Rate limiting** 30 requests / 15 min per IP on dashboard route
- **Webhook HMAC validation** — `x-hub-signature-256` verified with `crypto.timingSafeEqual`; missing or invalid signature returns `401` (fail closed)
- **Interactive button normalization** — `extractInboundText()` in `src/routes/webhook.js` converts `button_reply.id` to plain text before the pipeline; downstream code needs no changes

---

## 7. Deployment

See [README.md](../../README.md) for deployment instructions.
