# Adding a New Phase to the Conversation Flow

## Overview

The Valeria conversation flow has 5 phases defined in `src/flow.js`:

```
EXTRACTION → HOOK → [CONSENT if not given] → DATA_CAPTURE → PAYMENT → CLOSING
```

## Steps to Add a Phase

### 1. Define the phase name

Add it as a string literal in the `handleConversionFlow` function in `src/flow.js`.

### 2. Add entry condition

Insert a new `if` block following the existing pattern:

```js
if (phase === '<DEPENDENCY_PHASE>' && <entry_condition>) {
    await updateSession(phone, {phase: '<NEW_PHASE>'});
    await recordPhase(phone, '<NEW_PHASE>');
    return MSG_<NEW_PHASE>(session.name); // or null to let AI handle it
}
```

### 3. Add hardcoded message (optional)

If the phase needs a fixed message (like the hook or data capture prompt), add a message constant in `src/config.js`:

```js
export const MSG_<NEW_PHASE> = (name) =>
    `Hola ${name}, <message text>`;
```

### 4. Add re-engagement message (optional)

If the new phase should have a custom re-engagement message, add a case in the `resetReengagementTimer` function in
`src/flow.js`.

### 5. Update tests

- Add test cases in `tests/flow.test.js` for the new phase transitions.
- Add test cases in `tests/prompt.test.js` if the prompt changes.

### 6. Update docs

- Update `docs/PROJECT_FILES.md` with any new source modules.
- Update `docs/sdd/README.md` with the new phase in the funnel diagram.
- Update `docs/reference/BUSINESS_RULES.md` if the classification rules change.
- Update `CLAUDE.md` §8 (Flow) if the phase appears in the main flow diagram.

### 7. Consider the signal token pattern

If the new phase needs the AI to detect a patient intent and trigger a deterministic action (rather than keyword matching), use the signal token pattern:

1. Add a token constant to `src/config.js` (e.g., `'[MY_SIGNAL]'`).
2. Instruct the AI in `src/prompt.js` to emit the token when it detects the intent.
3. In `src/flow.js`, check `aiResponse.includes('[MY_SIGNAL]')` after the AI call and handle accordingly.

See `[IN_PERSON_PAYMENT]` and `[RESENT_DATA]` in `src/flow.js` for reference implementations.
