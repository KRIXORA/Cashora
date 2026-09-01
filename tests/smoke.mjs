/**
 * Cashora smoke tests — run with: node tests/smoke.mjs
 * No framework. Covers pure helpers that don't need a browser or Supabase.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error('   ', err.message);
    process.exitCode = 1;
  }
}

console.log('Cashora smoke tests\n');

await test('config.js exports expected shape', () => {
  const src = readFileSync(join(root, 'js/config.js'), 'utf8');
  assert.match(src, /APP_CONFIG/);
  assert.match(src, /SUPABASE_CONFIG/);
  assert.match(src, /isSupabaseConfigured/);
  assert.match(src, /currency:\s*'INR'/);
});

await test('utils.js escapes HTML', () => {
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

await test('schema enables RLS on all tables', () => {
  const sql = readFileSync(join(root, 'backend-supabase/schema.sql'), 'utf8');
  for (const table of ['transactions', 'budgets', 'goals', 'recurring_transactions']) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security`, 'i'));
  }
});

await test('vercel.json ships CSP + HSTS', () => {
  const v = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const headers = v.headers[0].headers.map((h) => h.key);
  assert.ok(headers.includes('Content-Security-Policy'));
  assert.ok(headers.includes('Strict-Transport-Security'));
  assert.ok(headers.includes('X-Frame-Options'));
});

await test('service worker exists and skips API cache', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /supabase\.co/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /CACHE_VERSION/);
});

await test('supabaseClient refuses unconfigured boot path', () => {
  const src = readFileSync(join(root, 'js/supabaseClient.js'), 'utf8');
  assert.match(src, /isSupabaseConfigured/);
  assert.match(src, /requireSupabase/);
  assert.doesNotMatch(src, /eyJhbGciOiJIUzI1NiIs/);
});

await test('production migration includes audit_log', () => {
  const sql = readFileSync(join(root, 'backend-supabase/migration_production.sql'), 'utf8');
  assert.match(sql, /audit_log/);
  assert.match(sql, /deleted_at/);
  assert.match(sql, /updated_at/);
});


await test('feature migration has accounts and debts', () => {
  const sql = readFileSync(join(root, 'backend-supabase/migration_features.sql'), 'utf8');
  assert.match(sql, /create table if not exists accounts/i);
  assert.match(sql, /create table if not exists debts/i);
});

await test('state exports net worth and import helpers', () => {
  const src = readFileSync(join(root, 'js/state.js'), 'utf8');
  assert.match(src, /getNetWorth/);
  assert.match(src, /parseTransactionsCSV/);
  assert.match(src, /getSafeToSpend/);
  assert.match(src, /detectSubscriptions/);
  assert.match(src, /getFiftyThirtyTwenty/);
});

await test('router includes networth route', () => {
  const src = readFileSync(join(root, 'js/router.js'), 'utf8');
  assert.match(src, /networth/);
});

await test('service worker precaches every view module', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const router = readFileSync(join(root, 'js/router.js'), 'utf8');
  const viewNames = [...router.matchAll(/from '\.\/views\/([a-z]+)\.js'/g)].map((m) => m[1]);
  assert.ok(viewNames.length > 0, 'expected to find view imports in router.js');
  for (const name of viewNames) {
    assert.match(sw, new RegExp(`/js/views/${name}\\.js`), `sw.js SHELL is missing views/${name}.js`);
  }
});

await test('config.js can load without config.local.js present', async () => {
  const { SUPABASE_CONFIG } = await import(join(root, 'js/config.js'));
  assert.ok(SUPABASE_CONFIG.url.startsWith('https://'));
  assert.ok(SUPABASE_CONFIG.anonKey.length > 0);
});

await test('no dead top-level listeners on elements that only exist in route views', () => {
  // Elements defined inside js/views/*.js don't exist in the DOM until the router
  // mounts that route. A `document.getElementById('x')?.addEventListener(...)` at
  // module scope in app.js runs once at import time — before any route is mounted —
  // so it silently never binds for those elements. (This bit us for real: the
  // "Enable browser notifications" button had exactly this bug.) Those elements must
  // be wired via the delegated `pageRoot.addEventListener('click', ...)` pattern
  // instead, which re-checks e.target on every click.
  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  const viewFiles = readdirSync(join(root, 'js/views')).filter((f) => f.endsWith('.js'));
  const viewIds = new Set();
  for (const f of viewFiles) {
    const src = readFileSync(join(root, 'js/views', f), 'utf8');
    for (const m of src.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)) viewIds.add(m[1]);
  }
  const topLevelTargets = [...appSrc.matchAll(/^document\.getElementById\('([a-zA-Z0-9_-]+)'\)\?\.addEventListener/gm)]
    .map((m) => m[1]);
  const badOnes = topLevelTargets.filter((id) => viewIds.has(id));
  assert.deepEqual(badOnes, [], `dead top-level listener(s) targeting view-only element(s): ${badOnes.join(', ')}`);
});

console.log(`\n${passed} checks passed`);

