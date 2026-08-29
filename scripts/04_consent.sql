-- Ley 1581 (Colombian data protection) consent tracking.
-- Adds explicit consent flags to the patients table so the bot can prove
-- a patient authorized storage of their personal data (name, email, goal).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;
