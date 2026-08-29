# ADR-002: Multi-Layer Model Router

## Status

Accepted

## Context

Every inbound message requires an AI response. Using Claude Sonnet for all messages would be accurate but expensive; using Haiku for all messages would be cheap but shallow for complex patient objections. The system needed a way to route messages to the right model without adding latency on the critical path.

## Decision

Implement a four-layer classifier in `src/model-router.js` that decides SIMPLE (Haiku) or COMPLEX (Sonnet) per message:

1. **Phase override** — PAYMENT, CLOSING, and positive HOOK responses always route to Sonnet (high-stakes conversion moments).
2. **Keyword scan** — A curated list of Spanish objection/pain keywords (e.g., "duele", "precio", "no puedo") triggers Sonnet.
3. **Length heuristic** — Messages longer than 120 characters are presumed complex and routed to Sonnet.
4. **LLM-as-judge** — Any message that passes layers 1–3 is classified by Haiku itself with a strict JSON-only prompt; the result determines the final model.

Fail-safe: any API error or invalid JSON from the LLM-as-judge falls back silently to SIMPLE.

Per-session telemetry (`session.metrics.router`) tracks routing decisions by layer, by model, and accumulated tokens for data-driven threshold calibration.

## Alternatives Considered

- **Always Sonnet**: Accurate but ~5× more expensive per message; not viable at scale.
- **Always Haiku**: Cheap, but objection handling and closing conversations suffered noticeably in testing.
- **Single keyword list**: Simpler, but misses nuance for messages that are long and complex but contain no objection keywords.
- **External classifier service**: Adds network round-trip and operational complexity with no accuracy gain over the LLM-as-judge approach.

## Consequences

- ✅ Sonnet usage concentrated on the messages that need it most (closing and objections)
- ✅ Fail-safe guarantees uptime even on classifier API failure
- ✅ Telemetry enables threshold tuning after 2–3 weeks of production data
- ❌ LLM-as-judge adds one Haiku call latency when layers 1–3 do not match
- ❌ Keyword list requires manual maintenance as new objection patterns emerge
