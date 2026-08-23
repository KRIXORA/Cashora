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
 * Your Supabase project (from Project Settings → API).
 * Already filled with the keys from your previous build so the app works
 * immediately. If you rotate keys in Supabase, update these two strings.
 */
export const SUPABASE_CONFIG = {
  url: 'https://ecaqeccwlnyqeoiyvuod.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYXFlY2N3bG55cWVvaXl2dW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzQxNjksImV4cCI6MjEwMjQ1MDE2OX0.Gjb-9wtqjCSwuEYXLJ8Ejdc4Z-_G47NrPHfduXkZQEk',
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
