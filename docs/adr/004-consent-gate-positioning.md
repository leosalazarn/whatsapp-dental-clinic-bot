# ADR-004: Ley 1581 Consent Gate at DATA_CAPTURE Entry

## Status

Accepted

## Context

Colombian Law 1581/2012 requires explicit informed consent before collecting personal data (full name, email, consultation reason). The bot collects this data in the DATA_CAPTURE phase. A consent gate was required; the question was where in the flow to place it and how to implement it.

## Decision

Insert a CONSENT phase immediately before DATA_CAPTURE entry:

- When a patient transitions from HOOK (positive response) and has not previously granted consent, `flow.js` enters CONSENT phase and returns an interactive WhatsApp button message (`MSG_CONSENT` body + `CONSENT_BUTTONS`) instead of advancing to DATA_CAPTURE.
- `button_reply.id` values (`consent_yes` / `consent_no`) are normalized to text by `extractInboundText()` in `routes/webhook.js` before entering the pipeline, so downstream modules need no changes.
- On `consent_yes`: consent is recorded in the DB (`consent_given: true`, `consent_given_at: timestamp`), phase advances to DATA_CAPTURE.
- On `consent_no`: a polite refusal message is sent; phase stays at CONSENT (no data is collected).
- On free text (patient typed instead of tapping a button): the consent buttons are re-sent; no refusal, no AI call.
- Returning patients with `consent_given = true` in the DB skip the gate entirely.

The gate is placed at DATA_CAPTURE entry (not at conversation START) because consent must be informed and contextual — the patient should understand the purpose of the data collection before being asked.

## Alternatives Considered

- **Consent at START**: Legal but creates friction before any value is delivered; increases drop-off at first contact.
- **Consent via free-text acknowledgement**: Ambiguous; hard to audit.
- **Plain-text buttons (no interactive message)**: Accessible fallback included (`dispatchResponse()` falls back to `sendMessage(phone, response.body)` on WhatsApp API error), but interactive buttons are the primary UX.
- **Single yes/no text message**: No WhatsApp-native affordance; patients frequently ignore plain-text prompts.

## Consequences

- ✅ Fully Ley 1581/2012 compliant — explicit, informed, recorded consent before data capture
- ✅ Native WhatsApp button UX reduces ambiguity
- ✅ Returning patient path is frictionless (consent already on record)
- ✅ Plain-text fallback preserves functionality if Meta's interactive API is unavailable
- ❌ Adds one round-trip to the flow for new patients
- ❌ Interactive button messages require a separate Meta Cloud API call (`sendInteractiveButtons`)
