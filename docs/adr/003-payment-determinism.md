# ADR-003: Deterministic First-Touch Payment Message + Signal-Token Follow-ups

## Status

Accepted

## Context

The PAYMENT phase sends bank transfer details to the patient. Allowing the AI to compose this message introduces two risks: hallucinated account numbers, and CodeQL flagging the tainted data path from `process.env` banking variables through the AI response to the logger. Follow-up handling (patient says they already paid, patient asks to re-see the data) also needed to be reliable without extra LLM calls.

## Decision

Split PAYMENT into two tiers:

1. **First touch (deterministic)**: When `payment_info_sent` is false, `flow.js` returns `MSG_PAYMENT()` directly — a hardcoded template that injects banking details from environment variables. The AI is never called. `payment_info_sent` is set to `true`.

2. **Follow-up (AI + signal tokens)**: For any subsequent message in PAYMENT phase, the AI is called with instructions to emit one of two signal tokens if applicable:
   - `[IN_PERSON_PAYMENT]` — patient intends to pay at the clinic → `flow.js` intercepts before delivery, advances phase to CLOSING with `MSG_CLOSING_IN_PERSON(name)`, sets `in_person_payment: true`.
   - `[RESENT_DATA]` — patient asks to see payment info again → `flow.js` intercepts, returns `MSG_PAYMENT()` directly, bypasses `auditOutput` (safe: hardcoded content, not AI-generated).

Signal tokens are stripped from the response text before any delivery; the patient never sees them.

## Alternatives Considered

- **Keyword detection for in-person intent**: Brittle — "pago en la clínica" has many synonyms. Replaced in favour of signal tokens.
- **Always AI for follow-ups**: Risk of hallucinating account numbers; CodeQL tainted-data violation.
- **Separate API call to detect intent**: Adds latency and cost with no accuracy benefit over the signal-in-response approach.

## Consequences

- ✅ Bank data is never composed by the AI — eliminates hallucination risk on account numbers
- ✅ Breaks the CodeQL `js/clear-text-logging` tainted-data path (banking env vars never reach the logger)
- ✅ Signal tokens are deterministic and require no extra LLM call
- ✅ `[RESENT_DATA]` correctly bypasses the output guardrail (hardcoded safe content)
- ❌ Signal-token instructions add ~60 tokens to every PAYMENT follow-up prompt
- ❌ The AI must be trusted to emit the correct token — tested via prompt regression suite
