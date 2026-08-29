-- Ley 1581 (Habeas Data) — PII access audit log.
-- Records every read of patient data with who accessed it and when, so the
-- clinic can demonstrate accountable access to protected health information.
CREATE TABLE IF NOT EXISTS access_log (
    id           BIGSERIAL PRIMARY KEY,
    endpoint     TEXT NOT NULL,
    viewer       TEXT NOT NULL,  -- 'dashboard_session' | 'api_key:<first6chars>' | 'unknown'
    ip_address   TEXT,
    accessed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_log_accessed_at ON access_log (accessed_at DESC);
