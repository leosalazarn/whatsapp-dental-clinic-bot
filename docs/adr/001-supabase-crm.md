# ADR-001: Supabase as Patient CRM

## Status

Accepted

## Context

The bot needed persistent storage for patient data and conversation history that:

- Survives server restarts (Render free plan sleeps after 15min)
- Provides SQL querying for analytics endpoints
- Has Row Level Security for patient data protection
- Is cost-effective for early-stage deployment

## Decision

Use Supabase (PostgreSQL) as the primary data store for:

- `patients` table — lead/patient CRM data
- `conversations` table — session state, history, metrics

The application uses an in-memory `Map()` as a read cache with Supabase as the write-through persistence layer.

## Alternatives Considered

- **SQLite**: File-based, doesn't survive Render's ephemeral filesystem
- **MongoDB Atlas**: More complex, overkill for relational patient data
- **PostgreSQL directly**: Would require managing own instance (Aiven, etc.)
- **Redis**: Great for sessions but no query capability for analytics

## Consequences

- ✅ Free tier handles the current volume (200+ conversations)
- ✅ Built-in REST API for direct queries
- ✅ RLS ready when multi-clinic support is needed
- ❌ Two Supabase clients instantiated (`crm.js` + `session.js`) — should be singleton
- ❌ In-memory cache creates dual-write complexity (noted as TODO in `session.js:9`)
