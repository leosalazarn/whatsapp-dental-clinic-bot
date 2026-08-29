# Tech Stack — Valeria WhatsApp Bot

| Component  | Solution                                                                                                       |
|------------|----------------------------------------------------------------------------------------------------------------|
| WhatsApp   | Meta Cloud API (free up to 1k conversations/month)                                                             |
| AI         | Anthropic Claude (models: `claude-haiku-4-5-20251001` default, `claude-sonnet-4-6` for complex queries)        |
| Server     | Node.js + Express (ES Modules) + express-session + express-rate-limit + lusca (CSRF)                           |
| Hosting    | Render.com                                                                                                     |
| Database   | Supabase (PostgreSQL) — lead data & metrics                                                                    |
| Scheduling | Gestión Odontológica — clinic staff manages appointments manually in their existing practice management system |
| Tests      | Vitest — full suite, run with `npm test`                                                                       |

## Model Router (`src/model-router.js`)

| Feature        | Details                                                                                              |
|----------------|------------------------------------------------------------------------------------------------------|
| Layers         | Phase → keyword → length (>120 chars) → LLM-as-judge (Haiku) — returns `{ route, layer }`            |
| Classification | SIMPLE (Haiku) or COMPLEX (Sonnet) based on message complexity                                       |
| Fallback       | Silently defaults to `SIMPLE` on invalid JSON or API error                                           |
| Telemetry      | `recordRouting()` persists layer, model, token counts into `session.metrics.router` (Supabase JSONB) |
| Metrics        | Aggregated in `GET /metrics` — by_layer, by_model, LLM%, cost estimate vs. all-Sonnet baseline       |
| Test coverage  | 15 tests (4 phase, 3 keyword, 1 length, 4 LLM, 3 routeMessage)                                       |

## Key Constants

| Constant                      | Value                       |
|-------------------------------|-----------------------------|
| `MODEL_SIMPLE`                | `claude-haiku-4-5-20251001` |
| `MODEL_COMPLEX`               | `claude-sonnet-4-6`         |
| `TOKENS_SIMPLE`               | 400                         |
| `TOKENS_COMPLEX`              | 700                         |
| `CLASSIFIER_MAX_TOKENS`       | 50                          |
| `CLASSIFIER_LENGTH_THRESHOLD` | 120                         |
| `CONSULTATION_DURATION`       | 30 min                      |
| `REENGAGEMENT_DELAY`          | 23 hours                    |
| `SESSION_EXPIRY`              | 72 hours                    |
| `MAX_HISTORY`                 | 10 messages                 |
| `DEBOUNCE_MS`                 | 5000ms                      |
| `BUFFER_HARD_CAP`             | 5 messages                  |
| `MAX_BUFFER_SIZE`             | 10 messages                 |
