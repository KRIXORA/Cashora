/* ==========================================================================
   Cashora — supabaseClient.js
   Loads the Supabase JS client from a pinned CDN URL (no npm install).
   Credentials live in config.js — never commit real keys to a public repo.
   ========================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { SUPABASE_CONFIG, isSupabaseConfigured } from './config.js';

if (!isSupabaseConfigured()) {
  console.error(
    '[Cashora] Supabase is not configured. Open js/config.js and paste your Project URL + anon key.'
  );
}

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Throws a clear error if the client was never configured. */
export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Open js/config.js and add your Project URL and anon key.'
    );
  }
  return supabase;
}


export function getSupabase() {
  return supabase;
}
