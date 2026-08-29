# Architecture Decision Records

An Architecture Decision Record (ADR) captures why a specific architectural decision was made, including context,
alternatives considered, and consequences.

## ADR Index

| ID  | Title                                                                                 | Date       | Status   |
|-----|---------------------------------------------------------------------------------------|------------|----------|
| 001 | [Supabase as Patient CRM](./001-supabase-crm.md)                                      | 2026-03-09 | Accepted |
| 002 | [Multi-Layer Model Router](./002-multi-layer-model-router.md)                         | 2026-08-29 | Accepted |
| 003 | [Deterministic Payment + Signal Tokens](./003-payment-determinism.md)                 | 2026-08-29 | Accepted |
| 004 | [Ley 1581 Consent Gate at DATA_CAPTURE Entry](./004-consent-gate-positioning.md)      | 2026-08-29 | Accepted |
| 005 | [Durable Re-engagement via Supabase Queue](./005-durable-reengagement.md)             | 2026-08-29 | Accepted |

## Template

```markdown
# ADR-NNN: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded]

## Context

[What is the issue motivating this decision?]

## Decision

[What decision was made?]

## Alternatives Considered

[What other options were evaluated?]

## Consequences

[What are the trade-offs and implications?]
```
