# ADR-005: Durable Re-engagement via Supabase Queue

## Status

Accepted

## Context

Patients frequently go silent mid-funnel (after HOOK or DATA_CAPTURE). A follow-up message after ~24 hours recovers a measurable percentage of stalled leads. The challenge: the server runs on Render's free plan, which sleeps the container after 15 minutes of inactivity, so in-process timers (`setTimeout`, `setInterval`) are lost on sleep/restart.

## Decision

Implement re-engagement as a durable queue backed by Supabase:

- When a patient goes silent, `reengagement.js` inserts a row into a `reengagement_queue` table with `fire_at = now() + 23h` and `status = 'pending'`.
- A polling loop (60s interval, started at server boot) queries `reengagement_queue` for rows where `fire_at <= now()` and `status = 'pending'`.
- On match: the appropriate re-engagement message is sent (phase-specific copy), the row is marked `status = 'sent'`.
- The timer is reset on any inbound message from the patient (row cancelled, new row inserted if the patient is still in a re-engageable phase).
- 23h was chosen over 24h to avoid timezone-edge conflicts and to feel less mechanical to patients.

## Alternatives Considered

- **In-process `setTimeout`**: Lost on any restart or Render sleep — not viable on the free plan.
- **External cron service (cron-job.org, Render cron jobs)**: Requires a separate service and a public endpoint; adds operational surface area.
- **Supabase Edge Functions + pg_cron**: More elegant but requires a paid Supabase plan and additional deployment configuration.
- **Redis with key expiry**: Would need a Redis instance; adds cost and complexity.

## Consequences

- ✅ Survives container restarts and Render free-plan sleep cycles
- ✅ No external service dependency beyond the Supabase instance already in use
- ✅ Re-engagement state is visible and auditable in the database
- ❌ 60s polling granularity means fire times are accurate to ±60s (acceptable for a 23h window)
- ❌ Polling loop runs even when no re-engagements are due (low overhead, but not zero)
- ❌ If the server is offline for >60s when a row is due, it fires on the next poll (still within acceptable window)
