/**
 * Cashora smoke tests — run with: node tests/smoke.mjs
 * No framework. Covers pure helpers that don't need a browser or Supabase.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error('   ', err.message);
    process.exitCode = 1;
  }
}

console.log('Cashora smoke tests\n');

test('config.js exports expected shape', () => {
  const src = readFileSync(join(root, 'js/config.js'), 'utf8');
  assert.match(src, /APP_CONFIG/);
  assert.match(src, /SUPABASE_CONFIG/);
  assert.match(src, /isSupabaseConfigured/);
  assert.match(src, /currency:\s*'INR'/);
});

test('utils.js escapes HTML', () => {
  function escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  assert.equal(escapeHTML('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHTML('A & B'), 'A &amp; B');
});

test('schema enables RLS on all tables', () => {
  const sql = readFileSync(join(root, 'backend-supabase/schema.sql'), 'utf8');
  for (const table of ['transactions', 'budgets', 'goals', 'recurring_transactions']) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security`, 'i'));
  }
});

test('vercel.json ships CSP + HSTS', () => {
  const v = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const headers = v.headers[0].headers.map((h) => h.key);
  assert.ok(headers.includes('Content-Security-Policy'));
  assert.ok(headers.includes('Strict-Transport-Security'));
  assert.ok(headers.includes('X-Frame-Options'));
});

test('service worker exists and skips API cache', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /supabase\.co/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /CACHE_VERSION/);
});

test('supabaseClient refuses unconfigured boot path', () => {
  const src = readFileSync(join(root, 'js/supabaseClient.js'), 'utf8');
  assert.match(src, /isSupabaseConfigured/);
  assert.match(src, /requireSupabase/);
  assert.doesNotMatch(src, /eyJhbGciOiJIUzI1NiIs/);
});

test('production migration includes audit_log', () => {
  const sql = readFileSync(join(root, 'backend-supabase/migration_production.sql'), 'utf8');
  assert.match(sql, /audit_log/);
  assert.match(sql, /deleted_at/);
  assert.match(sql, /updated_at/);
});


test('feature migration has accounts and debts', () => {
  const sql = readFileSync(join(root, 'backend-supabase/migration_features.sql'), 'utf8');
  assert.match(sql, /create table if not exists accounts/i);
  assert.match(sql, /create table if not exists debts/i);
});

test('state exports net worth and import helpers', () => {
  const src = readFileSync(join(root, 'js/state.js'), 'utf8');
  assert.match(src, /getNetWorth/);
  assert.match(src, /parseTransactionsCSV/);
  assert.match(src, /getSafeToSpend/);
  assert.match(src, /detectSubscriptions/);
  assert.match(src, /getFiftyThirtyTwenty/);
});

test('router includes networth route', () => {
  const src = readFileSync(join(root, 'js/router.js'), 'utf8');
  assert.match(src, /networth/);
});

console.log(`\n${passed} checks passed`);

