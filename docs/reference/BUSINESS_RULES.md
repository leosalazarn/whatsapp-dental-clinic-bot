# Business Rules — Valeria WhatsApp Bot

## ABSOLUTE RULES

- ❌ **NEVER give exact treatment prices** — only approximate ranges when patient insists (configured in
  `config.js TREATMENT_PRICES`)
- ❌ **NEVER ask for ID or additional phone number** — phone is already known from WhatsApp
- ❌ **NEVER confirm or schedule appointments** — only capture data (appointment scheduling is handled manually by clinic
  staff in Gestión Odontológica)
- ✅ Dra. [Doctor Name] is a woman: always "la Dra. [Doctor Name]" or "la doctora"
- ✅ Valeria always uses informal "tú" — natural, warm Colombian Spanish
- ✅ Maximum 3 lines per message
- ✅ Maximum 1 emoji per message
- ✅ Deposit required to confirm the slot — amounts set in env vars (BOOK_PRICE, CONSULTATION_PRICE)

## CONVERSATION FLOW

```
START → EXTRACTION → HOOK → [CONSENT if not given] → DATA_CAPTURE → PAYMENT → CLOSING
```

| Phase        | Entry condition                             | Action                                                                                       |
|--------------|---------------------------------------------|----------------------------------------------------------------------------------------------|
| START        | First ever message                          | Advance to EXTRACTION (patients ask freely before consent)                                   |
| CONSENT      | Entering DATA_CAPTURE without prior consent | Request Ley 1581 consent; on affirmative persist `consent_given` and advance to DATA_CAPTURE |
| EXTRACTION   | No name or no aesthetic_goal                | AI extracts name and goal naturally (commercial Q&A free)                                    |
| HOOK         | Has name + goal AND ≥3 exchanges            | Hardcoded consultation pitch                                                                 |
| DATA_CAPTURE | Patient responds positively to hook         | Asks for full name, email, reason                                                            |
| PAYMENT      | data_complete = true                        | Deterministic `MSG_PAYMENT()` template — AI never generates                                  |
| CLOSING      | payment_info_sent = true + next message     | AI awaits receipt, confirms                                                                  |

## MESSAGE CLASSIFICATION

1. Group message → **IGNORE**
2. Phone status `IN_TREATMENT` → **CURRENT_PATIENT**
3. Active session (phase !== `START`) → **ORGANIC_LEAD**
4. Any new individual contact → **WARM_LEAD**
