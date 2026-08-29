import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY} from '../config.js';

let client = null;

export function getDb() {
    if (!client) {
        client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return client;
}
