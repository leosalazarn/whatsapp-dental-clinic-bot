-- ==========================================
-- 🦷 Valeria Dental Bot — Database Schema (DDL)
-- ==========================================

-- 1. Patients Table — Persistent CRM data
CREATE TABLE IF NOT EXISTS patients (
    phone               TEXT PRIMARY KEY,
    name                TEXT,
    full_name           TEXT,
    email               TEXT,
    consultation_reason TEXT,
    status              TEXT DEFAULT 'NEW',
    aesthetic_goal      TEXT,
    source              TEXT DEFAULT 'ORGANIC',
    trigger_message     TEXT,
    data_complete       BOOLEAN DEFAULT FALSE,
    last_intent         TEXT DEFAULT 'OTHER',
    notes               TEXT DEFAULT '',
    first_contact       TIMESTAMPTZ DEFAULT NOW(),
    last_interaction    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for patient lookups
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_source ON patients(source);
CREATE INDEX IF NOT EXISTS idx_patients_last_interaction ON patients(last_interaction);

-- 2. Conversations Table — Persistent Chat History & Metrics
CREATE TABLE IF NOT EXISTS conversations (
    phone               TEXT PRIMARY KEY,
    phase               TEXT DEFAULT 'START',
    history             JSONB DEFAULT '[]'::jsonb,
    name                TEXT,
    aesthetic_goal      TEXT,
    source              TEXT DEFAULT 'ORGANIC',
    trigger_message     TEXT,
    full_name           TEXT,
    email               TEXT,
    consultation_reason TEXT,
    data_complete       BOOLEAN DEFAULT FALSE,
    payment_info_sent   BOOLEAN DEFAULT FALSE,
    message_count       INTEGER DEFAULT 0,
    last_interaction    TIMESTAMPTZ DEFAULT NOW(),
    metrics             JSONB DEFAULT '{
        "first_contact": null,
        "first_response_ms": null,
        "reengagement_sent": false,
        "reengagement_recovered": false,
        "phase_timestamps": {
            "START": null,
            "EXTRACTION": null,
            "HOOK": null,
            "DATA_CAPTURE": null,
            "PAYMENT": null,
            "CLOSING": null
        }
    }'::jsonb
);

-- Indexes for conversation performance
CREATE INDEX IF NOT EXISTS idx_conversations_last_interaction ON conversations(last_interaction);
CREATE INDEX IF NOT EXISTS idx_conversations_phase ON conversations(phase);
