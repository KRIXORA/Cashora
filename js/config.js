/* ==========================================================================
   Cashora — config.js
   App settings + Supabase credentials.

   The anon key is safe to ship in the browser (RLS protects your data).
   NEVER put the service_role / secret key here.
   ========================================================================== */

/** @type {{ currency: string, locale: string, currencySymbol: string, maxAmount: number, writeCooldownMs: number }} */
export const APP_CONFIG = {
  currency: 'INR',
  locale: 'en-IN',
  currencySymbol: '₹',
  maxAmount: 1_00_00_000,
  writeCooldownMs: 400,
};

/**
 * Default Supabase project (from Project Settings → API).
 * Already filled with the keys from a previous build so the app works
 * immediately. If you rotate keys in Supabase, update these two strings —
 * or, better, override them via js/config.local.js (see below) so you
 * never need to touch this file (or accidentally commit new keys to git).
 */
const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://ecaqeccwlnyqeoiyvuod.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYXFlY2N3bG55cWVvaXl2dW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzQxNjksImV4cCI6MjEwMjQ1MDE2OX0.Gjb-9wtqjCSwuEYXLJ8Ejdc4Z-_G47NrPHfduXkZQEk',
};

/**
 * Optional local override — copy js/config.local.example.js to js/config.local.js
 * and fill in your own project's URL + anon key. That file is gitignored, so it
 * never gets committed even by accident. If it doesn't exist, this import
 * rejects and we silently fall back to DEFAULT_SUPABASE_CONFIG above — the app
 * works either way.
 *
 * Top-level `await` here (this file is loaded as an ES module) makes every
 * importer of SUPABASE_CONFIG — including supabaseClient.js, which calls
 * createClient() synchronously at import time — wait for this to resolve
 * first, so the override actually takes effect instead of arriving too late.
 */
let localOverride = null;
try {
  localOverride = await import('./config.local.js');
} catch (_) {
  // No config.local.js present — expected in most setups, not an error.
}

export const SUPABASE_CONFIG = {
  url: localOverride?.SUPABASE_URL || DEFAULT_SUPABASE_CONFIG.url,
  anonKey: localOverride?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_CONFIG.anonKey,
};

export function isSupabaseConfigured() {
  const { url, anonKey } = SUPABASE_CONFIG;
  return (
    Boolean(url) &&
    Boolean(anonKey) &&
    !String(url).includes('YOUR_SUPABASE') &&
    !String(anonKey).includes('YOUR_SUPABASE') &&
    String(url).startsWith('https://')
  );
}
