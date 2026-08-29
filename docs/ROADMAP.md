# 🗺️ Valeria AI — Project Plan & Roadmap

This document tracks the evolution of Valeria, the AI Assistant for **Dra. [Doctor Name]**.

## 📊 Current Status: **Phase 3 — Conversion**

**Last Update:** August 29, 2026
**Overall Progress:** ~99% to Production Launch

---

## 🚦 Pre-Launch Checklist

Everything below must be green before the first real patient receives a message.

- [x] Meta permanent WhatsApp token configured
- [x] Real clinic production number active
- [x] Meta App status → Live
- [x] All critical hallucination guardrails in place (payment, phone, dates, double-message)
- [x] **Fix `[BUG]`:** Removed phone-question line from `src/prompt.js` DATA_CAPTURE block (honors
  no-phone business rule; commit `9f7426b`)
- [ ] **Render upgrade:** Move to $7/mo paid instance — free tier sleeps after 15 min, hurting
  first-contact conversion (detail + priority in Phase 3 — `[P0] Render Upgrade`)
- [x] **Supabase grants:** `scripts/02_security.sql` executed in Supabase — RLS enabled and
  `SELECT/INSERT/UPDATE/DELETE` granted on `conversations` + `patients` for anon/authenticated/service_role.
  Clears the Oct 30, 2026 hard-deadline blocker (tracked in Maintenance Deadlines).
- [x] **Consent & privacy notice (Ley 1581):** Bot requests explicit data-processing consent at the `DATA_CAPTURE` entry (not at first contact), so patients can freely ask commercial questions — prices, treatments — before any PII is collected. Implemented via `MSG_CONSENT` in the `HOOK → DATA_CAPTURE` transition in `src/flow.js`; if `consent_given` is not yet set it diverts to `CONSENT`, and on an affirmative reply it persists `consent_given` + `consent_given_at` to `patients` via `src/crm.js` (migration `scripts/04_consent.sql`) and advances to `DATA_CAPTURE`. A returning patient with `consent_given = true` skips the prompt. (`MSG_CONSENT` rephrased to a mid-conversation request.)
- [x] **Supabase migrations executed in production:** `scripts/04_consent.sql` (consent columns on `patients`) and `scripts/05_audit_log.sql` (`access_log` table + index) confirmed run in Supabase production dashboard.

---

## ✅ Phase 1: Stabilization (COMPLETE)

*Goal: Core functionality, basic CRM integration, and bug fixing.*

- [x] Fix phase transition bugs and "voice" consistency.
- [x] Implement Supabase (PostgreSQL) lead storage.
- [x] Adaptive debounce (5s) and deduplication (60s).
- [x] Basic dynamic prompt builder.
- [x] Centralized business rules in `config.js`.

---

## ✅ Phase 2: Security & Robustness (COMPLETE)

*Goal: Protect patient data, prevent AI abuse, and prepare for high traffic.*

- [x] **Guardrails:** Prevent prompt injection, jailbreaks, and off-topic chatter.
- [x] **Endpoint Auth:** Secure `/leads`, `/stats`, and `/metrics` with `DEBUG_API_KEY`.
- [x] **Webhook Auth:** Inbound `/webhook` POST validates Meta `x-hub-signature-256` HMAC (fail closed).
- [x] **Anti-Flood:** Limit message bursts to 10 messages per session.
- [x] **Sanitization:** Clean user input from control characters.
- [x] **Refactor:** Remove all hardcoded logic into `src/config.js`.
- [x] **DB Persistence:** Robust lead storage with Supabase (zero-data-loss).

---

## ⚖️ Phase 2.x: Compliance & Legal ✅ (COMPLETE)

*Goal: Meet Colombian data-protection law (Ley 1581 / Habeas Data) and Meta platform policy.*

- [x] **Webhook signature validation:** Verify Meta `x-hub-signature-256` HMAC on inbound POST in
  `src/routes/webhook.js` (`verifyMetaSignature` + gate in `handleInboundWebhook`). Reject on mismatch with
  `crypto.timingSafeEqual`. Fail closed — missing/invalid signature returns `401`. Closes the BLOCKER.
- [x] **[HIGH] Rate limiting on `POST /webhook` (CodeQL #8):** Added a dedicated `webhookLimiter`
  (`express-rate-limit`) mounted via `app.use('/webhook', webhookLimiter, ...)` in `server.js`, with the
  ceiling externalized to `src/config.js` (`WEBHOOK_RATE_LIMIT_MAX` per IP window, env-backed). Kept
  separate from the dashboard limiter (`DASHBOARD_RATE_LIMIT_MAX`). Closes CodeQL CWE-770. (commit 5901807)
- [x] **[HIGH] Clear-text logging of PII in `log.lead()` (CodeQL #10, CWE-312):**
  `src/utils/logger.js` `log.lead()` was logging the full `intentJson` object including
  patient name, email, and goal. Fixed in three passes: (a) replaced full JSON with a
  structural `safe` object (commit `9f9b920`); (b) removed `data_complete` /
  `payment_info_sent` still traced as tainted by CodeQL (commit `f93ad69`); (c) removed
  all `has_*` boolean fields derived from PII-named properties; added
  `lgtm[js/clear-text-logging]` suppression on `log.trigger()` (commit `0d88587`).
  `log.lead()` now emits only `phase` and `source`.
- [x] **[HIGH] CSRF scope (CodeQL #6) — RESOLVED as false positive:** CodeQL flags the `express-session`
  setup in `server.js` because `POST /webhook` and `POST /debug/reset/:phone` lack `lusca.csrf()`. Both are
  machine-to-machine routes, not browser sessions:
  - `/webhook` is authenticated by Meta HMAC (`x-hub-signature-256`) — CSRF is irrelevant for non-browser callers.
  - `/debug/reset/:phone` is API-key authenticated (`x-api-key` header); it is called by the clinic team via
    `curl`/script (no dashboard UI exists for it). Adding `lusca.csrf()` to `/debug` would have broken that flow.
  Fix: added `// lgtm[js/missing-token-validation]` suppression comments at `src/routes/webhook.js:157` and
  above the reset handler in `src/routes/debug.js`. Did **not** extend `lusca.csrf()` to `/debug`. (commit ee87e22)
- [x] **[P1] PII access audit log:** Every patient-data read is now recorded with who
  accessed it and when. `logAccess(endpoint, req)` in `src/crm.js` derives `viewer` as
  `dashboard_session` (authenticated session), `api_key:<first6chars>` (x-api-key header — only the
  first 6 chars are stored, never the full key), or `unknown`, plus the client IP, and fire-and-forgets
  an insert into a new `access_log` table. Wired into `GET /debug/leads`, `GET /debug/stats`,
  `GET /debug/metrics` (`src/routes/debug.js`) and `GET /dashboard-valeria-statistics` (`server.js`).
  Migration: `scripts/05_audit_log.sql`.
- [x] **[P0] LEGAL BLOCKER Consent & privacy notice:** Send a short data-processing consent message on first contact
  (`src/flow.js` START phase) and persist `consent_given` on `patients` (`src/crm.js`). A returning patient who
  already granted consent skips the prompt. Migration: `scripts/04_consent.sql`. (commit `fcbeb67`)
- [x] **[P1] Data retention & deletion:** Right-to-erasure implemented — `DELETE /debug/patient/:phone`
  (auth-protected, reuses `DEBUG_API_KEY`) permanently erases the patient from `patients`, `conversations`,
  and `reengagement_queue` via `deletePatient()` in `src/crm.js` + the endpoint in `src/routes/debug.js`.
  Honor of right-to-erasure: satisfied. Automated retention/TTL policy not yet implemented — track separately if required.

---

## 🔄 Phase 3: Conversion (CURRENT)

*Goal: Optimize the funnel from "Interested Lead" to "Paying Patient".*

- [x] **Lead Dashboard UI:** Deployed at `/dashboard-valeria-statistics` — single-file HTML dashboard with Tailwind CSS
  and Chart.js. Features: 4 KPI cards, horizontal funnel bar chart, response time/reengagement cards, leads table with
  expandable rows, CSV export, auto-refresh toggle, ES/EN locales via `localStorage`.
- [x] **Dashboard Security Hardening:** CSP meta tag (`, `frame-ancestors 'none'`), rate limiting (30 req/15 min via
  `express-rate-limit`), non-obvious route (`/dashboard-valeria-statistics`), server-side sessions (`express-session`
  with HttpOnly cookie) instead of `sessionStorage` for API key storage.
- [x] **CSRF Protection:** `lusca.csrf()` scoped to `/dashboard/*` — validates POST via `x-csrf-token` header.
- [x] **Secure Session Cookie:** `secure: true` in production (`NODE_ENV` check) + `trust proxy` for Render HTTPS.
- [x] **Model Router (model-router.js):** Multi-layer classification (phase → keyword → length → LLM-as-judge). Free
  layers catch ~70% of cases without API cost. SIMPLE → Haiku (400 tokens), COMPLEX → Sonnet (700 tokens). Fallback to
  SIMPLE on API error or invalid JSON. 15 tests. All routing constants centralized in `config.js`.
- [x] **Router Telemetry:** Per-session tracking of layer distribution, model usage, and accumulated tokens.
  Stored in `session.metrics.router` (Supabase JSONB). Aggregated and exposed in `GET /metrics` with cost
  estimates vs. all-Sonnet baseline. `callValeria` now returns `{ text, input_tokens, output_tokens }`.
  `classifyMessage` returns `{ route, layer }` per-layer identification. `recordRouting()` persist function.
- [x] **Price Hallucination (fixed):** `src/prompt.js` `## MANEJO DE PRECIOS` rewritten to always
  respond with a treatment-agnostic general range. Regression test added.
- [x] **Meta Verification:** Permanent WhatsApp token configured. Real clinic production number active.
- [x] **Re-engagement durability:** Replaced in-memory `setTimeout` follow-ups with a durable
  DB-backed queue. `scripts/03_reengagement_queue.sql` creates `reengagement_queue` with a partial
  index on pending rows. `src/reengagement.js` exports `scheduleReengagement`, `cancelReengagement`,
  and `startReengagementPoller` (60s scan, recovers pre-crash rows on startup). `src/flow.js` uses
  the new async functions; old `setReengagementTimer`/`clearReengagementTimer` in `session.js` remain
  exported but are now dead code (safe to remove in a future cleanup pass).
- [x] **Payment determinism:** `MSG_PAYMENT()` added to `src/config.js` — all banking details sourced
  from env vars. `src/flow.js` PAYMENT branch now returns this template directly; the AI never
  generates payment info. Eliminates Nequi/account hallucination at the root.
- [x] **Hallucinated phone guardrail:** `src/guardrails/output.js` now detects invented 10-digit
  Colombian numbers (`3xxxxxxxxx`) not in the known bank-value set and blocks the response in any phase.
- [x] **Appointment date hallucination (fixed):** `MSG_CLOSING(name)` added to `src/config.js` and
  returned deterministically on the first PAYMENT→CLOSING transition. `src/prompt.js` adds
  `## FECHAS Y HORARIOS — REGLA ABSOLUTA` forbidding the AI from mentioning dates or times (it has
  no calendar access).
- [x] **Double-message hallucination (fixed):** `src/prompt.js` adds `## TURNO ÚNICO — REGLA ABSOLUTA`
  preventing the AI from simulating a patient reply within the same message turn.
- [x] **Terminology fix:** All uses of "blanqueamiento" in `src/prompt.js` replaced with
  "aclaramiento dental" (the clinically precise term used by Dra. [Doctor Name]).
- [x] **Dashboard live polling:** `public/dashboard.html` polls every 8 seconds, updates the
  conversation list in place, shows a `(N)` unread badge in the browser tab, and pauses on tab hide.
- [x] **Conversation reset endpoint:** `POST /debug/reset/:phone` (auth-protected) resets all
  conversation fields in Supabase, clears the in-memory session cache, and cancels pending
  re-engagement rows. Allows the clinic team to restart a patient's flow without losing the
  Supabase record.
- [x] ** [P0] BUG - DATA_CAPTURE prompt asks for phone number:** Removed the
  contradictory "Para el teléfono: pregunta si usamos..." line from `src/prompt.js`
  DATA_CAPTURE block. Phone is already known from WhatsApp; asking again contradicts
  the `CLAUDE.md` business rule. (commit `9f7426b`)
- [x] **[P1] Dashboard UX — non-technical login:** The login field was labeled "API Key", which is
   meaningless for a dental assistant or receptionist. Renamed to **"Clave de acceso"** and updated the
   placeholder to "Ingresa la clave que te proporcionó el administrador" (ES) / "Enter the access key
   provided by your administrator" (EN) in `public/dashboard.html`. The error strings were also
   de-technicalized ("Clave de acceso inválida" / "Invalid access key"). No security change — purely
   cosmetic. Reduces friction for clinic staff who will use the dashboard daily.
- **[P0] Render Upgrade:** Move to a $7/mo instance to prevent cold starts and ensure 24/7
   responsiveness. Free tier sleeps after 15 min of inactivity — directly kills conversion on first
   patient contact. Status: pending manual action on Render dashboard — the only remaining hard
   blocker before public launch. All other pre-launch items are complete. Awaiting feedback from
    Dra. [Doctor Name] before opening to real patients.
- [x] **[P0] In-person payment path:** Some patients do not know how to make electronic
    transfers (Nequi / Bancolombia / Davivienda). Feedback from Dra. [Doctor Name] confirms
   this is a real drop-off cause. Implemented: on any PAYMENT follow-up the AI is called and may
   emit the `[IN_PERSON_PAYMENT]` signal token; `src/flow.js` intercepts it, sets
   `payment_in_person = true`, and advances to CLOSING with the deterministic
   `MSG_CLOSING_IN_PERSON(name)` template. The online-payment CLOSING path is unchanged. The
   earlier keyword-based `IN_PERSON_PAYMENT_SIGNALS` list was removed — the signal token is the
   sole detection mechanism.
- [x] **[P1] Interactive consent buttons:** Replaced the plain-text Ley 1581 consent prompt with a WhatsApp `type: "button"` interactive message — two buttons: "✅ Sí, autorizo" / "❌ No, gracias". `sendInteractiveButtons()` added to `src/whatsapp.js`; `button_reply.id` normalized to text in `extractInboundText()` (`src/routes/webhook.js`) before the pipeline; `dispatchResponse()` helper in `src/flow.js` dispatches interactive vs. plain; CONSENT handler branches on `consent_yes` / `consent_no` / free text (re-sends buttons instead of assuming refusal — fixes the Pilar Cerquera drop-off). `MSG_CONSENT` kept as plain-text fallback for older clients. 11 new tests across `flow.test.js`, `whatsapp.test.js`, `webhook.test.js`.
- [x] **[P1] `RESENT_DATA` signal:** When a patient in PAYMENT or CLOSING asks for payment data to be resent, the AI emits `[RESENT_DATA]`; `src/flow.js` intercepts it and returns `MSG_PAYMENT()` directly. The AI is never asked to reproduce banking details. `auditOutput` bypass in CLOSING is deliberate — `MSG_PAYMENT()` is hardcoded safe content, not AI-generated. (commit `5542dc4`)
- [x] **[P1] Real-time Notifications — Receptionist handoff:** When a lead
   reaches the PAYMENT phase for the **first time** (`!session.payment_info_sent`),
   Valeria fires a WhatsApp notification to the clinic receptionist. Payload:
   patient `name`, `aesthetic_goal`, and WhatsApp `phone` — captured PII only, read
   from the live session, never from logs. `RECEPTIONIST_PHONE` env var added;
   `sendReceptionistAlert()` helper in `src/whatsapp.js` (no-op + `console.warn`
   when `RECEPTIONIST_PHONE` is unset). Fired fire-and-forget (`.catch(log.error)`)
   so it never blocks the patient's payment response. `MSG_RECEPTIONIST_ALERT`
   template in `src/config.js`.
- [x] **[P0] BUG — Silent DB failures (`anon` → `service_role` key):** Root cause
   of `access_log` and `reengagement_queue` never being populated. `src/db/client.js`
   was using `SUPABASE_ANON_KEY` (blocked by RLS); switched to
   `SUPABASE_SERVICE_ROLE_KEY` (the server uses a privileged key that bypasses row-level security). Error logging added to
   `scheduleReengagement`, `cancelReengagement`, and `logAccess` to surface future
   failures. (post-commit `023454d`)
- [x] **[P1] BUG — Phone format mismatch in debug endpoints:** `POST /debug/reset/:phone`
   and `DELETE /debug/patient/:phone` returned `success: true` even when no row was found.
   Root cause: URL-encoded `%2B573...` decoded to `+573...` but DB stores `573...`.
   Fix: strip leading `+` after `decodeURIComponent`. Both endpoints now return `404`
   when phone not found.
- [x] **[P1] Architecture Decision Records (ADR 002–005):** Created `docs/adr/` with
   ADR 002 (multi-layer model router), ADR 003 (payment determinism), ADR 004 (consent
   gate positioning), ADR 005 (durable re-engagement). `docs/adr/README.md` index added.
   (commit `bfe8bf9`)
- [x] **[P1] Postman collection:** `valeria-dental-bot.postman_collection.json` — 11
   requests across 3 folders (Public, Debug/Protected, Dashboard) with collection-level
   variables `base_url`, `api_key`, `phone`.
- **[P1] Comprobante image handler:** When patient sends an image or document in PAYMENT
   phase, bot confirms receipt and sends a secondary alert to receptionist. In-person
   payment path (`[IN_PERSON_PAYMENT]`) also triggers its own receptionist alert. Two new
   message templates (`MSG_RECEPTIONIST_COMPROBANTE`, `MSG_RECEPTIONIST_IN_PERSON`) in
   `src/config.js`. Status: in progress.
- [x] **[P1] Dead code cleanup:** (a) Removed duplicate `MSG_REENGAGEMENT` export in `src/config.js`
   (identical to and unused vs `MSG_REENGAGEMENT_HOOK`). (b) Removed 6 dead banking imports
(`MOBILE_WALLET_NUMBER`, `BANK_ACCOUNT_1`, `BANK_ACCOUNT_2`, `BANK_HOLDER_NAME`,
`BANK_HOLDER_ID`, `TREATMENT_PRICES`) from `src/prompt.js` after the payment-determinism
   refactor — reduces AI context exposure. `guardrails/output.js` still imports the bank-value set
   for leak detection, so those `config.js` exports were left intact.
- [x] **[P1] `startReengagementPoller()` error handling:** Added `.catch(err => log.error('reengagement poller failed to start', err))` at the `startReengagementPoller()` call site in `server.js`. Startup failures now surface in logs instead of being silently swallowed. (commit `c8e58b4`)
- [x] **[P1] Meta 24h window compliance:** Reduced `REENGAGEMENT_DELAY_HOURS` from 24 to 23 in `src/config.js` (`REENGAGEMENT_DELAY_MINUTES` derives automatically to 1380). Re-engagement messages now fire 1h before Meta's free-form window closes, eliminating silent rejection at the boundary. Long-term fix (approved Meta template) remains option (b) for Phase 4+. (commit `ed57d69`)
- **[P2] `reengagement_queue` cleanup policy:** `sent` and `cancelled` rows accumulate indefinitely.
  Add a periodic cleanup (e.g. a daily Supabase scheduled function) to delete rows older than 30 days
  where `sent = true` or `cancelled = true`.
- **[P2] Enhanced Re-engagement:** Implement different follow-up strategies based on drop-off reason
  (price objection vs. timing). Requires real traffic data to identify patterns — defer until post-launch.
- **[P2] Message A/B experimentation:** Framework to test `MSG_HOOK` / `MSG_REENGAGEMENT_*` variants
  (`src/config.js:109-118`) and measure funnel lift. Requires meaningful traffic volume — defer until
  post-launch.
- **[P2] Session store persistence:** `express-session` uses in-memory `MemoryStore` — loses dashboard
  sessions on restart. Low urgency on single-instance Render; replace with `connect-pg-simple` before
  scaling past one process.

---

## 🚀 Phase 4: Automation (2-3 Months)

*Goal: Remove manual steps from the doctor's team.*

- **Gestión Odontológica — CSV/flat-file sync (evaluation complete):** Direct API integration was
  evaluated and declined by the clinic management team (security / data-leakage concerns). Agreed
  alternative: Gestión Odontológica exports a plain-text or CSV availability file periodically
  (format: `fecha,hora,disponible`), containing only slot availability for consultations — no
  patient records, no clinical data. Valeria reads this file to answer availability queries and,
  in a future phase, to offer autonomous appointment booking. Delivery mechanism (shared folder,
  email attachment, SFTP) pending agreement with the management team. Implementation requires:
  (a) agreeing on file format and delivery cadence; (b) a `src/availability.js` reader that parses
  the CSV and exposes `getAvailableSlots(date)`; (c) injecting availability context into the AI
  prompt when the patient asks about appointment times. Status: blocked on file delivery agreement.
- **Human handoff signal:** Add `[HANDOFF_TO_HUMAN]` intent detection so Valeria gracefully routes patients to a human
  when needed.
- **Media Handling — Multimodal:** Two distinct flows. Claude Haiku/Sonnet are already vision-capable — no model change required.

  **Outbound (clinic → patient):** Valeria sends before/after clinical photos as social proof. Consent is
  governed by the signed informed consent form collected at the valoración appointment (in-person, not over
  WhatsApp). Three tiers from that record: teeth-only photos are the default (no facial identity); full-face
  photos only if `consent_full_photo: true`; no photos if `consent_photo: false`. Implementation: upload
  assets to Meta Media API, store `media_id` in config or Supabase asset table, send as WhatsApp `image`
  message type via `src/whatsapp.js`.

  **Inbound (patient → bot):** Patient sends a photo of their smile for a preliminary visual assessment.
  Implementation: `src/routes/webhook.js` detects `messages[0].type === 'image'`, downloads the media URL
  from Meta's `GET /{media-id}` endpoint, base64-encodes it, and passes it as an `image` content block to
  Claude alongside the system prompt. Valeria responds with a warm, non-diagnostic observation that reinforces
  conversion ("Veo algo muy trabajable — exactamente el tipo de caso que manejamos ✨"). **Critical
  constraint:** the image is never persisted — no Supabase storage, no disk write. Ephemeral in-memory
  processing only. Informed consent for clinical image use is signed at the valoración, not over WhatsApp.
  **Legal constraint (Colombia):** Any visual assessment of dental condition — even framed as
  "warm and non-diagnostic" — may constitute unlicensed practice of dentistry under Colombian law.
  Before implementing, validate response copy with Dra. [Doctor Name] and legal counsel. Valeria's reply
  must be strictly motivational ("Nos encantaría conocer tu caso") and must never describe,
  evaluate, or comment on the patient's dental condition.
- **Tone Calibration:** Valeria's responses are occasionally over-the-top effusive.
  Requires a `prompt.js` tone pass — warm and professional, not excessive.
  Status: blocked on stakeholder review cycle. Low priority, non-blocking.

---
## 📈 Phase 5: Scale & Analytics (3-6 Months)

*Only if >500 consultations/month or multiple clinics.*

- **Voice Messages:** Integrate STT (Speech-to-Text) to allow patients to send audio notes.
- **Analytics:** Post-launch data analysis to identify conversion drop-off patterns and optimize the funnel. Scope and tooling to be defined once real traffic data is available.

---

## 🧰 Phase 6: Tooling & DX (Ongoing)

*Goal: Improve operational visibility and team experience.*


- **LLM Rate Limiting:** Per-phone rate limiter on AI calls (separate from debounce buffer).
  Prevents rapid-fire injection attempts that bypass the debounce window.
  Defer until traffic justifies it (Phase 5+).
- **CI/CD pipeline:** Add `.github/workflows/ci.yml` — run `npm test` (Vitest, NNN tests) + lint on
  every PR. `husky` is wired (`package.json:14`) but no pipeline exists yet.
- **Lint/typecheck scripts:** Add `lint`/`typecheck` to `package.json` (AGENTS.md requires them; none
  defined today).
- **Runtime error alerting:** Forward caught errors (`src/flow.js:125`, `src/routes/webhook.js:134`)
  to Sentry/Slack — a Claude API outage currently fails silently for patients.
- **Cost guardrails:** Add Claude token budget cap + alert when `/metrics` estimated cost
  (`src/routes/debug.js:135`) exceeds threshold.
- [x] **Dependency scanning — Dependabot:** `.github/dependabot.yml` configured for
   weekly npm dependency updates. Pending: `npm audit` gate in CI pipeline.
- [x] **Repo security — private production + public portfolio:** Production repo
   (`[author]/valeria-dental-bot`) made private. Public portfolio fork
   (`[author]/whatsapp-dental-clinic-bot`) created with clinic identity extracted to
   `BOT_PERSONA` env var, `PRACTICE_NAME`/`PRACTICE_LOCATION` generalized, patient-facing
   messages de-branded, SQL security comments sanitized, and `README.md` "Demo version"
   callout added. 176 tests pass. (commit `744a12c`)
- **Supabase backups:** Enable PITR / scheduled backups (Maintenance table only covers grants today).
- **[P1] Enum constants for phase/classification/route strings:** 28 hardcoded
  string literals (`'EXTRACTION'`, `'HOOK'`, `'DATA_CAPTURE'`, `'PAYMENT'`,
  `'CLOSING'`, `'START'`, `'WARM_LEAD'`, `'ORGANIC_LEAD'`, `'SIMPLE'`,
  `'COMPLEX'`) are scattered across `flow.js` (21), `prompt.js` (4), and 3 other
  files. Create `src/constants/index.js` with `Object.freeze` enum objects
  (`Phase`, `Classification`, `Route`) and replace all literals with typed
  references. Improves refactoring safety and IDE autocomplete.
- **[P1] Flow state diagram:** No formal documentation of the conversation state
  machine exists. Create `docs/FLOW.md` describing the full
  START → EXTRACTION → HOOK → [CONSENT if not given] → DATA_CAPTURE → PAYMENT → CLOSING lifecycle,
  including classifier outputs (`WARM_LEAD`, `ORGANIC_LEAD`, `CURRENT_PATIENT`,
  `IGNORE`), transition triggers, and deterministic message injection points.

---

## 🔭 Future Considerations

*Revisit only if the product scales beyond a single clinic or exceeds ~500 consultations/month.*

- **Signal-token refactor for keyword-based flow transitions:** Phase transitions in `src/flow.js` that currently rely on keyword matching (e.g., detecting a positive patient response to the HOOK pitch before advancing to `DATA_CAPTURE`) are brittle — a keyword can match out of context. Replace with the same signal-token pattern used for `[IN_PERSON_PAYMENT]` and `[RESENT_DATA]`: the AI prompt instructs the model to emit a specific token when intent is confirmed; `flow.js` intercepts it and advances the phase. Eliminates false positives and false negatives without adding an extra LLM API call. Best tackled in the same pass as the `[IN_PERSON_PAYMENT]` and `[RESENT_DATA]` signal-token implementation.
- **Distributed architecture:** Evaluate microservices extraction (Python/FastAPI for AI, Java for persistence) when a Node.js monolith becomes a bottleneck. Not a current constraint.
- **Enterprise AI infrastructure:** RAG pipelines, vector search, and managed LLM infrastructure — only relevant at multi-clinic or enterprise scale.
- **Multi-tenant support:** Replicate Valeria for additional clinics with per-tenant config and isolated data.


These items are intentionally unspecified. Architecture decisions at this scale depend on team size, traffic patterns, and business model — none of which are defined today.

---

## ⏰ Maintenance Deadlines

| Date             | Item                     | Status      | Action                                                                                                                                                                 |
|------------------|--------------------------|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Oct 30, 2026** | Supabase Data API grants | ✅ Executed | `scripts/02_security.sql` run — RLS enabled + `SELECT/INSERT/UPDATE/DELETE` grants on `conversations`/`patients` for anon/authenticated/service_role. Blocker cleared. |

## 🛠️ Tech Stack Reminder

See [TECH_STACK.md](./reference/TECH_STACK.md) for the full stack and constants.
