-- ==========================================
-- 🦷 Valeria Dental Bot — Re-engagement Queue
-- ==========================================

-- Durable store for pending follow-up messages. Replaces the in-memory
-- setTimeout re-engagement timers that were lost on every deploy/crash.
-- The poller (src/reengagement.js) scans this table and sends due rows.

CREATE TABLE IF NOT EXISTS reengagement_queue (
    id            BIGSERIAL PRIMARY KEY,
    phone         TEXT NOT NULL,
    scheduled_at  TIMESTAMPTZ NOT NULL,
    message       TEXT NOT NULL,
    phase         TEXT,
    sent          BOOLEAN DEFAULT FALSE,
    sent_at       TIMESTAMPTZ,
    cancelled     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Query target for the poller: only rows still pending.
CREATE INDEX IF NOT EXISTS idx_reengagement_pending
    ON reengagement_queue (sent, cancelled, scheduled_at)
    WHERE sent = FALSE AND cancelled = FALSE;
