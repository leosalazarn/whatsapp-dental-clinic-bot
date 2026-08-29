-- ==========================================
-- 🦷 Valeria Dental Bot — Security & Policies (DCL)
-- ==========================================

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- Data API Access Grants
-- Required from May 30, 2026 onward:
-- Supabase no longer exposes "public" tables to the Data API by default.
-- Without these GRANTs, supabase-js returns "42501" errors.
-- ==========================================

-- service_role: backend server role (see src/db/client.js)
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO anon;

-- authenticated role: reserved for future use (e.g. admin dashboard)
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO authenticated;

-- service_role: privileged role for server-side operations
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO service_role;

-- ==========================================
-- Row Level Security Policies
-- ==========================================

-- 1. Conversations Policies
-- Permissive policies for the 'anon' and 'authenticated' Postgres roles.
-- The application server authenticates with a privileged key
-- that bypasses row-level security. All RLS policies are enforced
-- for any other client accessing the database directly.
CREATE
POLICY "Enable all operations for app access on conversations" ON conversations
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Patients Policies
CREATE
POLICY "Enable all operations for app access on patients" ON patients
    FOR ALL USING (true) WITH CHECK (true);

-- Note: In a production environment with patient-facing web apps,
-- you would replace 'USING (true)' with specific phone-based filters.
