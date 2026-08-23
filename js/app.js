/* ==========================================================================
   Cashora — app.js
   Entry point. Guards the page behind auth, boots the router, loads real
   data from the API, and wires state -> render -> DOM events together.

   Only ONE view's markup exists in the DOM at a time (see router.js /
   js/views/*.js), so any listener bound to an element inside a view must
   be delegated from a container that survives navigation (#pageRoot),
   never attached directly to the view's own elements.
   ========================================================================== */

import {
  addTransaction, deleteTransaction, updateTransaction,
  getCategoryBreakdown, getMonthlyBudgetUsage, subscribe,
  exportTransactionsAsCSV, exportFullBackup, initState, isAuthenticated, logout, getCurrentUser,
  getCashFlowSeries, getFinancialHealthScore, getTransactions, getGoals, getBudgets,
  upsertBudget, deleteBudget, addGoal, updateGoal, deleteGoal,
  updateProfile, getInsights, getAllCategoryNames,
  getRecurring, addRecurring, deleteRecurring, advanceDate,
  getAccounts, upsertAccount, deleteAccount, getDebts, upsertDebt, deleteDebt,
  parseTransactionsCSV, importTransactions, getSafeToSpend, seedDemoData, resetAllData, isAccountEmpty, getMonthlySummary, saveCustomCategory, removeCustomCategory, getReminders,
} from './state.js';
import { renderAll, renderCategoryLegend, renderMonthlySummary, renderCategoryManager } from './transactions.js';
import { drawLineChart, drawGauge, drawDonut, drawRing } from './charts.js';
import { showToast, debounce, escapeHTML, registerServiceWorker, initConnectivityBanner } from './utils.js';
import { getSupabase } from './supabaseClient.js';
import { isSupabaseConfigured } from './config.js';
import { icon } from './icons.js';
import { initRouter, setOnRouteChange } from './router.js';

let currentFilter = 'all';
let cashFlowRange = '1M';
let txPage = 1;
let analyticsScope = 'month'; // 'month' | 'all' — for the Analytics category breakdown

const MAX_TRANSACTION_AMOUNT = 1_00_00_000; // ₹1 crore — sane upper bound against fat-finger entry
const MAX_TITLE_LENGTH = 80;

const pageRoot = document.getElementById('pageRoot');

/** Rebuilds a category <select>'s options from live data + a "custom" option, keeping `keep` selected if present. */
function populateCategorySelect(selectEl, keep, { includeCustomOption = true } = {}) {
  if (!selectEl) return;
  const names = getAllCategoryNames();
  selectEl.innerHTML = names.map((n) => {
    const safe = escapeHTML(n);
    return `<option value="${safe}">${safe}</option>`;
  }).join('')
    + (includeCustomOption ? `<option value="__custom__">+ Add custom category&hellip;</option>` : '');
  selectEl.value = keep && names.includes(keep) ? keep : names[0];
}

/** Wires a select + its adjacent "new category name" field so choosing "__custom__" reveals the input. */
function wireCustomCategoryToggle(selectEl, fieldEl, inputEl) {
  selectEl?.addEventListener('change', () => {
    const isCustom = selectEl.value === '__custom__';
    fieldEl.style.display = isCustom ? 'block' : 'none';
    if (isCustom) inputEl.focus();
  });
}

/** Resolves the category to save: either the select's value, or the trimmed custom input if "__custom__" is chosen. */
function resolveCategory(selectEl, inputEl) {
  if (selectEl.value !== '__custom__') return { category: selectEl.value, error: null };
  const name = inputEl.value.trim().slice(0, 40);
  if (!name) return { category: null, error: 'Please name your new category.' };
  return { category: name, error: null };
}

/** Keeps Tab/Shift+Tab cycling within a modal instead of escaping to the page behind it. */
function enableFocusTrap(modalEl) {
  modalEl?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

function renderCharts() {
  drawLineChart(document.getElementById('cashFlowChart'), getCashFlowSeries(cashFlowRange));
  drawGauge(document.getElementById('budgetGauge'), getMonthlyBudgetUsage().percent);
  drawDonut(
    document.getElementById('categoryPieChart'),
    getCategoryBreakdown(analyticsScope).map((c) => ({ label: c.category, value: c.amount }))
  );
  renderCategoryLegend(analyticsScope);
  drawRing(document.getElementById('healthScoreRing'), getFinancialHealthScore().score);
}

function renderUserGreeting() {
  const user = getCurrentUser();
  const heading = document.querySelector('#dashboard .page-section__title');
  const name = user?.user_metadata?.name || user?.name;
  if (heading && name) heading.textContent = `Welcome back, ${name.split(' ')[0]}`;

  const subtitle = document.getElementById('dashboardSubtitle');
  if (subtitle) {
    const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    subtitle.textContent = `Here's your financial overview for ${monthLabel}.`;
  }

  const chip = document.getElementById('dashboardSafeChip');
  if (chip) {
    try {
      const { safe } = getSafeToSpend();
      chip.textContent = `Safe to spend · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(safe)}`;
    } catch (_) {
      chip.textContent = '';
    }
  }
}

/** Re-applies the in-memory filter/range selection to whichever view just mounted. */
function syncActiveTabs() {
  const cashFlowTabGroup = document.getElementById('cashFlowChart')?.closest('.card')?.querySelector('.tab-group');
  cashFlowTabGroup?.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.textContent.trim() === cashFlowRange);
  });

  const recentTxTabGroup = document.getElementById('recentTransactionsBody')?.closest('.card')?.querySelector('.tab-group');
  recentTxTabGroup?.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.textContent.trim().toLowerCase() === currentFilter);
  });

  document.getElementById('txFilterTabs')?.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.textContent.trim().toLowerCase() === currentFilter);
  });

  const analyticsTabGroup = document.getElementById('analyticsScopeTabs');
  analyticsTabGroup?.querySelectorAll('.tab').forEach((t) => {
    const isMonth = t.textContent.trim() === 'This Month';
    t.classList.toggle('is-active', (analyticsScope === 'month') === isMonth);
  });
}

function renderEverything() {
  try { wireSettingsExtras(); } catch (_) {}

  txPage = renderAll(currentFilter, txPage);
  renderCharts();
  renderUserGreeting();
  syncActiveTabs();
  applySearchFilter(); // re-apply any active search after a full re-render
  updateNotifBadge();
}

subscribe(renderEverything);
// Whenever the router swaps in a new view, repopulate it with live data.
setOnRouteChange(renderEverything);

// ---------- Loading overlay ----------
function hideLoader() {
  const loader = document.getElementById('appLoader');
  loader?.classList.add('is-hidden');
  setTimeout(() => loader?.remove(), 300);
}

// ---------- Initial data load ----------

// ---------- Theme (dark / light) ----------
function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('cashora-theme', next); } catch (_) {}
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  if (sun && moon) {
    sun.style.display = next === 'light' ? 'none' : 'block';
    moon.style.display = next === 'light' ? 'block' : 'none';
  }
  // Redraw charts so canvas colors stay readable
  try { renderCharts(); } catch (_) {}
}
applyTheme(getTheme());
document.getElementById('themeToggle')?.addEventListener('click', () => {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

// ---------- Help / How to use ----------
const helpModal = document.getElementById('helpModal');
enableFocusTrap(helpModal);
function openHelp() {
  if (!helpModal) return;
  helpModal.style.display = 'flex';
  try { localStorage.setItem('cashora-help-seen', '1'); } catch (_) {}
}
function closeHelp() {
  if (helpModal) helpModal.style.display = 'none';
}
document.getElementById('helpBtn')?.addEventListener('click', openHelp);
document.getElementById('closeHelpModalBtn')?.addEventListener('click', closeHelp);
document.getElementById('closeHelpModalBtn2')?.addEventListener('click', closeHelp);
helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && helpModal?.style.display === 'flex') closeHelp();
  // ? opens help when not typing
  if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName || '')) {
    e.preventDefault();
    openHelp();
  }
});


// Dismissible disclaimer
(function initDisclaimer() {
  const bar = document.getElementById('disclaimerMarquee');
  const btn = document.getElementById('disclaimerClose');
  if (!bar) return;
  try {
    if (localStorage.getItem('cashora-disclaimer-hidden') === '1') {
      bar.classList.add('is-hidden');
      return;
    }
  } catch (_) {}
  btn?.addEventListener('click', () => {
    bar.classList.add('is-hidden');
    try { localStorage.setItem('cashora-disclaimer-hidden', '1'); } catch (_) {}
  });
})();


pageRoot?.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('[data-action="copy-month-summary"]');
  if (!copyBtn) return;
  try {
    const s = getMonthlySummary();
    const text = [
      `Cashora — ${s.label}`,
      `Income: ${s.income}`,
      `Spent: ${s.expense}`,
      `Saved: ${s.saved} (${s.savingsRate}%)`,
      `Safe to spend: ${s.safeToSpend}`,
      s.topCategory ? `Top category: ${s.topCategory.category} (${s.topCategory.amount})` : '',
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
    showToast('Monthly summary copied.', 'success');
  } catch (err) {
    showToast('Could not copy summary.', 'error');
  }
});

// Category manager
document.getElementById('addCategoryBtn')?.addEventListener('click', () => {});
pageRoot?.addEventListener('click', (e) => {
  if (e.target.id === 'addCategoryBtn' || e.target.closest('#addCategoryBtn')) {
    const input = document.getElementById('newCategoryInput');
    try {
      saveCustomCategory(input?.value || '');
      if (input) input.value = '';
      renderCategoryManager();
      showToast('Category added.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not add category.', 'error');
    }
  }
  const rm = e.target.closest('[data-action="remove-custom-cat"]');
  if (rm) {
    removeCustomCategory(rm.dataset.name);
    renderCategoryManager();
    showToast('Category removed from picker.', 'success');
  }
});


// ---------- MFA (Supabase TOTP) ----------
let _mfaFactorId = null;

async function refreshMfaStatus() {
  const status = document.getElementById('mfaStatus');
  const enrollBtn = document.getElementById('mfaEnrollBtn');
  const unenrollBtn = document.getElementById('mfaUnenrollBtn');
  if (!status) return;
  try {
    const client = getSupabase();
    if (!client) {
      status.textContent = 'Supabase not configured.';
      return;
    }
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    const totp = (data?.totp || []).filter((f) => f.status === 'verified');
    if (totp.length) {
      status.textContent = 'Authenticator enabled on this account.';
      status.className = 'settings-status is-success';
      if (enrollBtn) enrollBtn.style.display = 'none';
      if (unenrollBtn) {
        unenrollBtn.style.display = 'inline-flex';
        unenrollBtn.dataset.factorId = totp[0].id;
      }
    } else {
      status.textContent = 'MFA is not enabled yet.';
      status.className = 'settings-status';
      if (enrollBtn) enrollBtn.style.display = 'inline-flex';
      if (unenrollBtn) unenrollBtn.style.display = 'none';
    }
  } catch (err) {
    status.textContent = err.message || 'Could not read MFA status. Enable MFA in Supabase Auth settings.';
    status.className = 'settings-status is-error';
  }
}

document.getElementById('mfaEnrollBtn')?.addEventListener('click', async () => {
  const box = document.getElementById('mfaEnrollBox');
  const msg = document.getElementById('mfaMsg');
  try {
    const client = getSupabase();
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Cashora' });
    if (error) throw error;
    _mfaFactorId = data.id;
    const qr = document.getElementById('mfaQr');
    if (qr && data.totp?.qr_code) {
      qr.src = data.totp.qr_code;
    }
    if (box) box.style.display = 'flex';
    if (msg) msg.textContent = 'Scan the QR, then enter the code from your app.';
  } catch (err) {
    showToast(err.message || 'MFA enroll failed. Enable MFA in Supabase Dashboard → Auth → MFA.', 'error', 6000);
  }
});

document.getElementById('mfaVerifyBtn')?.addEventListener('click', async () => {
  const code = document.getElementById('mfaVerifyCode')?.value?.trim();
  const msg = document.getElementById('mfaMsg');
  if (!code || code.length < 6) {
    showToast('Enter the 6-digit code.', 'error');
    return;
  }
  try {
    const client = getSupabase();
    const challenge = await client.auth.mfa.challenge({ factorId: _mfaFactorId });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({
      factorId: _mfaFactorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verified.error) throw verified.error;
    document.getElementById('mfaEnrollBox').style.display = 'none';
    if (msg) {
      msg.textContent = 'MFA enabled.';
      msg.className = 'settings-status is-success';
    }
    showToast('Two-factor authentication enabled.', 'success');
    refreshMfaStatus();
  } catch (err) {
    showToast(err.message || 'Invalid code.', 'error');
  }
});

document.getElementById('mfaUnenrollBtn')?.addEventListener('click', async (e) => {
  const factorId = e.currentTarget.dataset.factorId;
  if (!factorId || !confirm('Remove authenticator MFA from this account?')) return;
  try {
    const client = getSupabase();
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    showToast('MFA removed.', 'success');
    refreshMfaStatus();
  } catch (err) {
    showToast(err.message || 'Could not remove MFA.', 'error');
  }
});

document.getElementById('enableBrowserNotifBtn')?.addEventListener('click', async () => {
  const status = document.getElementById('notifPermissionStatus');
  if (!('Notification' in window)) {
    if (status) status.textContent = 'This browser does not support notifications.';
    return;
  }
  const perm = await Notification.requestPermission();
  if (status) status.textContent = perm === 'granted' ? 'Browser notifications allowed.' : `Permission: ${perm}`;
  if (perm === 'granted') {
    try { localStorage.setItem('cashora-browser-notif', '1'); } catch (_) {}
    showToast('Notifications enabled for this browser.', 'success');
    maybeNotifyBills();
  }
});

function maybeNotifyBills() {
  try {
    if (localStorage.getItem('cashora-browser-notif') !== '1') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const due = getReminders().filter((r) => r.kind === 'bill' && r.severity === 'danger');
    if (!due.length) return;
    const key = `cashora-notif-${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    new Notification('Cashora', {
      body: due.map((d) => `${d.title}: ${d.message}`).join(' · '),
      icon: '/assets/icons/icon-192.webp',
    });
  } catch (_) {}
}


function wireSettingsExtras() {
  refreshMfaStatus();
  const notifStatus = document.getElementById('notifPermissionStatus');
  if (notifStatus && 'Notification' in window) {
    notifStatus.textContent = `Permission: ${Notification.permission}`;
  }
}

document.body.addEventListener('click', async (e) => {
  if (e.target.id === 'mfaEnrollBtn' || e.target.closest('#mfaEnrollBtn')) {
    const box = document.getElementById('mfaEnrollBox');
    const msg = document.getElementById('mfaMsg');
    try {
      const client = getSupabase();
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Cashora' });
      if (error) throw error;
      window.__cashoraMfaFactorId = data.id;
      const qr = document.getElementById('mfaQr');
      if (qr && data.totp?.qr_code) qr.src = data.totp.qr_code;
      if (box) box.style.display = 'flex';
      if (msg) msg.textContent = 'Scan the QR, then enter the code from your app.';
    } catch (err) {
      showToast(err.message || 'MFA enroll failed. Enable MFA in Supabase Dashboard → Authentication → MFA.', 'error', 7000);
    }
  }
  if (e.target.id === 'mfaVerifyBtn' || e.target.closest('#mfaVerifyBtn')) {
    const code = document.getElementById('mfaVerifyCode')?.value?.trim();
    if (!code || code.length < 6) { showToast('Enter the 6-digit code.', 'error'); return; }
    try {
      const client = getSupabase();
      const factorId = window.__cashoraMfaFactorId;
      const challenge = await client.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (verified.error) throw verified.error;
      const box = document.getElementById('mfaEnrollBox');
      if (box) box.style.display = 'none';
      showToast('Two-factor authentication enabled.', 'success');
      refreshMfaStatus();
    } catch (err) {
      showToast(err.message || 'Invalid code.', 'error');
    }
  }
  if (e.target.id === 'mfaUnenrollBtn' || e.target.closest('#mfaUnenrollBtn')) {
    const factorId = e.target.closest('#mfaUnenrollBtn')?.dataset?.factorId || e.target.dataset?.factorId;
    if (!factorId || !confirm('Remove authenticator MFA from this account?')) return;
    try {
      const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
      if (error) throw error;
      showToast('MFA removed.', 'success');
      refreshMfaStatus();
    } catch (err) {
      showToast(err.message || 'Could not remove MFA.', 'error');
    }
  }
  if (e.target.id === 'settingsInstallBtn' || e.target.closest('#settingsInstallBtn')) {
    if (isRunningInstalled() || localStorage.getItem('cashora-installed') === '1') {
      showToast('Cashora is already installed.', 'info');
      return;
    }
    if (!deferredInstallPrompt) {
      showToast('Install is not available right now. Use browser menu → Install app / Add to Home Screen.', 'info', 6000);
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') {
      try { localStorage.setItem('cashora-installed', '1'); localStorage.setItem('cashora-install-dismissed', '1'); } catch (_) {}
      hideInstallBanner();
      showToast('Installing…', 'success');
    }
    return;
  }
  if (e.target.id === 'enableBrowserNotifBtn' || e.target.closest('#enableBrowserNotifBtn')) {
    const status = document.getElementById('notifPermissionStatus');
    if (!('Notification' in window)) {
      if (status) status.textContent = 'This browser does not support notifications.';
      return;
    }
    const perm = await Notification.requestPermission();
    if (status) status.textContent = perm === 'granted' ? 'Browser notifications allowed.' : `Permission: ${perm}`;
    if (perm === 'granted') {
      try { localStorage.setItem('cashora-browser-notif', '1'); } catch (_) {}
      showToast('Notifications enabled.', 'success');
      maybeNotifyBills();
    }
  }
});


// ---------- Command palette (Ctrl/Cmd+K) ----------
const COMMANDS = [
  { id: 'dashboard', label: 'Go to Dashboard', hint: 'Home', run: () => { location.hash = '#dashboard'; } },
  { id: 'transactions', label: 'Go to Transactions', hint: 'Ledger', run: () => { location.hash = '#transactions'; } },
  { id: 'budget', label: 'Go to Budgets', hint: 'Limits', run: () => { location.hash = '#budget'; } },
  { id: 'goals', label: 'Go to Goals', hint: 'Savings', run: () => { location.hash = '#goals'; } },
  { id: 'networth', label: 'Go to Net Worth', hint: 'Assets', run: () => { location.hash = '#networth'; } },
  { id: 'analytics', label: 'Go to Analytics', hint: 'Charts', run: () => { location.hash = '#analytics'; } },
  { id: 'insights', label: 'Go to Insights', hint: 'Tips', run: () => { location.hash = '#insights'; } },
  { id: 'settings', label: 'Go to Settings', hint: 'Prefs', run: () => { location.hash = '#settings'; } },
  { id: 'add-expense', label: 'Add expense', hint: 'N', run: () => { openModal(); document.querySelectorAll('#transactionModal .tab').forEach((tab) => tab.classList.toggle('is-active', tab.textContent.trim().toLowerCase() === 'expense')); } },
  { id: 'add-income', label: 'Add income', hint: '', run: () => { openModal(); document.querySelectorAll('#transactionModal .tab').forEach((tab) => tab.classList.toggle('is-active', tab.textContent.trim().toLowerCase() === 'income')); } },
  { id: 'theme', label: 'Toggle theme', hint: 'Light/Dark', run: () => document.getElementById('themeToggle')?.click() },
  { id: 'help', label: 'How to use', hint: '?', run: () => document.getElementById('helpBtn')?.click() },
  { id: 'export', label: 'Export CSV', hint: 'Data', run: () => document.querySelector('[data-action="export-csv"]')?.click() },
];

let cmdIndex = 0;
let cmdFiltered = COMMANDS;

function openCommandPalette() {
  const overlay = document.getElementById('commandPalette');
  const input = document.getElementById('commandInput');
  if (!overlay) return;
  overlay.style.display = 'flex';
  cmdFiltered = COMMANDS;
  cmdIndex = 0;
  renderCommandList();
  input.value = '';
  setTimeout(() => input.focus(), 10);
}

function closeCommandPalette() {
  const overlay = document.getElementById('commandPalette');
  if (overlay) overlay.style.display = 'none';
}

function renderCommandList() {
  const list = document.getElementById('commandList');
  if (!list) return;
  list.innerHTML = cmdFiltered.map((c, i) => `
    <li class="cmd-item ${i === cmdIndex ? 'is-active' : ''}" role="option" data-cmd="${c.id}" aria-selected="${i === cmdIndex}">
      <span>${escapeHTML(c.label)}</span>
      <span class="cmd-item__meta">${escapeHTML(c.hint || '')}</span>
    </li>`).join('') || `<li class="cmd-item">No matches</li>`;
}

function runActiveCommand() {
  const c = cmdFiltered[cmdIndex];
  if (!c) return;
  closeCommandPalette();
  c.run();
}

document.getElementById('commandInput')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  cmdFiltered = !q ? COMMANDS : COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q));
  cmdIndex = 0;
  renderCommandList();
});

document.getElementById('commandList')?.addEventListener('click', (e) => {
  const item = e.target.closest('[data-cmd]');
  if (!item) return;
  const c = COMMANDS.find((x) => x.id === item.dataset.cmd);
  if (c) { closeCommandPalette(); c.run(); }
});

document.getElementById('commandPalette')?.addEventListener('click', (e) => {
  if (e.target.id === 'commandPalette') closeCommandPalette();
});

document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('commandPalette');
  const open = overlay && overlay.style.display === 'flex';
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (open) closeCommandPalette();
    else openCommandPalette();
    return;
  }
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = Math.min(cmdIndex + 1, cmdFiltered.length - 1); renderCommandList(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = Math.max(cmdIndex - 1, 0); renderCommandList(); }
  if (e.key === 'Enter') { e.preventDefault(); runActiveCommand(); }
});


// ---------- PWA install prompt ----------
let deferredInstallPrompt = null;

function isRunningInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
  );
}

function hideInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (banner) {
    banner.hidden = true;
    banner.setAttribute('hidden', '');
    banner.style.display = 'none';
  }
}

function showInstallBanner() {
  if (isRunningInstalled()) return;
  try {
    if (localStorage.getItem('cashora-install-dismissed') === '1') return;
    if (localStorage.getItem('cashora-installed') === '1') return;
  } catch (_) {}
  const banner = document.getElementById('installBanner');
  if (banner) {
    banner.hidden = false;
    banner.removeAttribute('hidden');
    banner.style.display = '';
  }
}

function dismissInstallBanner(permanent = true) {
  hideInstallBanner();
  if (permanent) {
    try { localStorage.setItem('cashora-install-dismissed', '1'); } catch (_) {}
  }
}

// Already installed? never show sticky banner
if (isRunningInstalled()) {
  try { localStorage.setItem('cashora-installed', '1'); } catch (_) {}
  hideInstallBanner();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Update Settings button state if present
  const settingsBtn = document.getElementById('settingsInstallBtn');
  if (settingsBtn) {
    settingsBtn.disabled = false;
    settingsBtn.textContent = 'Install app';
  }
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  try {
    localStorage.setItem('cashora-installed', '1');
    localStorage.setItem('cashora-install-dismissed', '1');
  } catch (_) {}
  hideInstallBanner();
  showToast('Cashora installed. Open it from your home screen.', 'success');
  const settingsBtn = document.getElementById('settingsInstallBtn');
  if (settingsBtn) {
    settingsBtn.disabled = true;
    settingsBtn.textContent = 'Installed';
  }
});

document.getElementById('installDismissBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dismissInstallBanner(true);
});

document.getElementById('installAcceptBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!deferredInstallPrompt) {
    showToast('Use browser menu → Install app / Add to Home Screen. Or open Settings → Install.', 'info', 5000);
    dismissInstallBanner(true);
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallBanner();
  if (outcome === 'accepted') {
    try { localStorage.setItem('cashora-installed', '1'); localStorage.setItem('cashora-install-dismissed', '1'); } catch (_) {}
    showToast('Installing…', 'success');
  } else {
    // User closed the native prompt — treat like dismiss so banner doesn't stick
    dismissInstallBanner(true);
  }
});

// ---------- Scroll reveal ----------
function initScrollReveal() {
  const root = document.getElementById('pageRoot');
  if (!root || !('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('is-inview');
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  const mark = () => {
    root.querySelectorAll('.card, .stat-card, .quick-action, .month-summary, .reminder-chip').forEach((el, i) => {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      if (i % 3 === 1) el.classList.add('reveal-delay-1');
      if (i % 3 === 2) el.classList.add('reveal-delay-2');
      obs.observe(el);
    });
  };
  mark();
  // re-run after route renders
  const mo = new MutationObserver(() => mark());
  mo.observe(root, { childList: true, subtree: false });
}

async function boot() {
  registerServiceWorker();
  initConnectivityBanner();

  if (!isSupabaseConfigured()) {
    hideLoader();
    maybeNotifyBills();
    // MFA status when settings DOM exists later via renderAll/subscribe
    setTimeout(refreshMfaStatus, 500);
    showToast('Supabase is not configured. Open js/config.js and add your Project URL + anon key.', 'error', 8000);
    return;
  }

  const authed = await isAuthenticated();
  if (!authed) {
    window.location.href = 'landing.html';
    return;
  }

  try {
    const { autoPostedCount } = await initState();

    // First visit: auto-load sample data so the product is never an empty shell
    let seeded = false;
    if (isAccountEmpty()) {
      try {
        await seedDemoData({ force: true });
        seeded = true;
        try { localStorage.setItem('cashora-demo-seeded', '1'); } catch (_) {}
      } catch (seedErr) {
        console.warn('Auto sample data skipped:', seedErr.message);
      }
    }

    initRouter(); // mounts the initial view and renders it via setOnRouteChange -> renderEverything
    hideLoader();
    maybeNotifyBills();
    // MFA status when settings DOM exists later via renderAll/subscribe
    setTimeout(refreshMfaStatus, 500);

    if (seeded) {
      showToast('Welcome — sample data is loaded so you can explore every feature. Replace it anytime from Settings.', 'info', 6000);
      // Soft-open how-to once for brand-new sessions
      try {
        if (!localStorage.getItem('cashora-help-seen')) {
          setTimeout(() => document.getElementById('helpBtn')?.click(), 800);
        }
      } catch (_) {}
    } else if (autoPostedCount > 0) {
      showToast(
        `Added ${autoPostedCount} recurring transaction${autoPostedCount > 1 ? 's' : ''} that came due since your last visit.`,
        'info', 5000
      );
    }
  } catch (err) {
    console.error(err);
    hideLoader();
    maybeNotifyBills();
    // MFA status when settings DOM exists later via renderAll/subscribe
    setTimeout(refreshMfaStatus, 500);
    showToast(err.message || 'Something went wrong while loading your data.', 'error', 4000);
    setTimeout(async () => {
      await logout();
      window.location.href = 'landing.html';
    }, 1500);
  }
}
boot();

// ---------- Mobile sidebar toggle ----------
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const menuToggle = document.getElementById('menuToggle');

function openSidebar() {
  sidebar.classList.add('is-open');
  sidebarBackdrop.classList.add('is-visible');
  document.body.classList.add('sidebar-locked');
}
function closeSidebar() {
  sidebar.classList.remove('is-open');
  sidebarBackdrop.classList.remove('is-visible');
  document.body.classList.remove('sidebar-locked');
}

menuToggle?.addEventListener('click', openSidebar);
sidebarBackdrop?.addEventListener('click', closeSidebar);

// Sidebar nav links live outside #pageRoot and are never re-rendered, so a
// direct binding is fine here. Active-state highlighting itself is handled
// by router.js on every navigation.
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', closeSidebar);
});

// ---------- Add Transaction modal ----------
// The modal lives outside #pageRoot too (index.html), so it's safe to bind directly.
const transactionModal = document.getElementById('transactionModal');
const transactionModalTitle = document.getElementById('transactionModalTitle');
enableFocusTrap(transactionModal);
const addTransactionBtn = document.getElementById('addTransactionBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalTabGroup = transactionModal?.querySelector('.tab-group');
const saveRecordBtn = document.getElementById('saveRecordBtn');
const txCategorySelect = document.getElementById('txCategorySelect');
const txCustomCategoryField = document.getElementById('txCustomCategoryField');
const txCustomCategoryInput = document.getElementById('txCustomCategoryInput');
wireCustomCategoryToggle(txCategorySelect, txCustomCategoryField, txCustomCategoryInput);

const txRecurringField = document.getElementById('txRecurringField');
const txRecurringCheckbox = document.getElementById('txRecurringCheckbox');
const txFrequencyField = document.getElementById('txFrequencyField');
const txFrequencySelect = document.getElementById('txFrequencySelect');
txRecurringCheckbox?.addEventListener('change', () => {
  txFrequencyField.style.display = txRecurringCheckbox.checked ? 'block' : 'none';
});

let lastFocusedEl = null;
let editingTransactionId = null;

/** Pass a transaction to edit it; omit to open in "add new" mode. */
function openModal(tx = null) {
  lastFocusedEl = document.activeElement;
  editingTransactionId = tx?.id || null;
  transactionModal.style.display = 'flex';

  const [titleInput, amountInput] = transactionModal.querySelectorAll('.input[type="text"], .input[type="number"]');
  const dateInput = transactionModal.querySelector('.input[type="date"]');
  const today = new Date().toISOString().slice(0, 10);
  dateInput.max = today;

  populateCategorySelect(txCategorySelect, tx?.category);
  txCustomCategoryField.style.display = 'none';
  txCustomCategoryInput.value = '';
  txRecurringCheckbox.checked = false;
  txFrequencyField.style.display = 'none';
  txFrequencySelect.value = 'monthly';
  // Recurring only makes sense when creating a fresh entry, not while editing one.
  txRecurringField.style.display = tx ? 'none' : 'block';

  if (tx) {
    transactionModalTitle.textContent = 'Edit Transaction';
    saveRecordBtn.textContent = 'Update Record';
    titleInput.value = tx.title;
    amountInput.value = tx.amount;
    dateInput.value = tx.date;
    const notesInput = document.getElementById('txNotesInput');
    if (notesInput) notesInput.value = tx.notes || '';
    modalTabGroup.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('is-active', t.textContent.trim().toLowerCase() === tx.type);
    });
  } else {
    transactionModalTitle.textContent = 'Add Transaction';
    saveRecordBtn.textContent = 'Save Record';
    if (!dateInput.value) dateInput.value = today;
  }

  titleInput.focus();
}

function closeModal() {
  transactionModal.style.display = 'none';
  transactionModal.querySelectorAll('.input').forEach((el) => (el.value = ''));
  const notesInput = document.getElementById('txNotesInput');
  if (notesInput) notesInput.value = '';
  txCustomCategoryField.style.display = 'none';
  txRecurringCheckbox.checked = false;
  txFrequencyField.style.display = 'none';
  modalTabGroup?.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('is-active', i === 0));
  editingTransactionId = null;
  lastFocusedEl?.focus();
}

addTransactionBtn?.addEventListener('click', () => openModal());
closeModalBtn?.addEventListener('click', closeModal);
cancelModalBtn?.addEventListener('click', closeModal);
transactionModal?.addEventListener('click', (e) => { if (e.target === transactionModal) closeModal(); });

// Accessibility: Escape closes whichever modal/panel is open.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (transactionModal.style.display === 'flex') closeModal();
  if (budgetModal?.style.display === 'flex') closeBudgetModal();
  if (goalModal?.style.display === 'flex') closeGoalModal();
});
transactionModal?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
    e.preventDefault();
    saveRecordBtn?.click();
  }
});

modalTabGroup?.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    modalTabGroup.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
  });
});

saveRecordBtn?.addEventListener('click', async () => {
  const type = modalTabGroup.querySelector('.tab.is-active').textContent.trim().toLowerCase();
  const [titleInput, amountInput] = transactionModal.querySelectorAll('.input[type="text"], .input[type="number"]');
  const dateInput = transactionModal.querySelector('.input[type="date"]');

  const title = titleInput.value.trim().slice(0, MAX_TITLE_LENGTH);
  const amount = Number(amountInput.value);
  const { category, error: categoryError } = resolveCategory(txCategorySelect, txCustomCategoryInput);
  const date = dateInput.value || new Date().toISOString().slice(0, 10);

  if (!title) {
    showToast('Please enter a title for this transaction.', 'error');
    titleInput.focus();
    return;
  }
  if (categoryError) {
    showToast(categoryError, 'error');
    txCustomCategoryInput.focus();
    return;
  }
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    showToast('Please enter a valid amount greater than zero.', 'error');
    amountInput.focus();
    return;
  }
  if (amount > MAX_TRANSACTION_AMOUNT) {
    showToast('That amount looks too large. Please double-check it.', 'error');
    amountInput.focus();
    return;
  }
  if (new Date(date) > new Date(new Date().toDateString())) {
    showToast('Transaction date cannot be in the future.', 'error');
    dateInput.focus();
    return;
  }

  const isEditing = Boolean(editingTransactionId);
  saveRecordBtn.disabled = true;
  saveRecordBtn.textContent = isEditing ? 'Updating…' : 'Saving…';
  try {
    const notes = document.getElementById('txNotesInput')?.value.trim().slice(0, 200) || '';
    if (isEditing) {
      await updateTransaction(editingTransactionId, { type, title, amount, category, date, notes });
      showToast('Transaction updated.', 'success');
    } else {
      await addTransaction({ type, title, amount, category, date, notes });
      if (txRecurringCheckbox.checked) {
        const frequency = txFrequencySelect.value;
        await addRecurring({ title, category, type, amount, frequency, nextRunDate: advanceDate(date, frequency) });
        showToast(`Transaction added — it'll repeat ${frequency}.`, 'success');
      } else {
        showToast('Transaction added.', 'success');
      }
    }
    closeModal();
  } catch (err) {
    showToast(err.message || 'Could not save transaction. Please try again.', 'error');
  } finally {
    saveRecordBtn.disabled = false;
    saveRecordBtn.textContent = isEditing ? 'Update Record' : 'Save Record';
  }
});

// ---------- View-scoped interactions (delegated from #pageRoot, which survives navigation) ----------

// Toolbar buttons that open modals or reset view-local state.
pageRoot?.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="add-transaction"]')) {
    openModal();
    return;
  }
  if (e.target.closest('[data-action="reset-filters"]')) {
    currentFilter = 'all';
    txPage = 1;
    const desk = document.getElementById('desktopSearchInput');
    const mob = document.getElementById('mobileSearchInput');
    if (desk) desk.value = '';
    if (mob) mob.value = '';
    renderEverything();
    return;
  }
  if (e.target.closest('[data-action="tx-prev-page"]')) {
    txPage = Math.max(1, txPage - 1);
    txPage = renderAll(currentFilter, txPage);
    applySearchFilter();
    return;
  }
  if (e.target.closest('[data-action="tx-next-page"]')) {
    txPage += 1;
    txPage = renderAll(currentFilter, txPage);
    applySearchFilter();
    return;
  }
  if (e.target.closest('[data-action="add-budget"]')) {
    openBudgetModal();
    return;
  }
  if (e.target.closest('[data-action="add-goal"]')) {
    openGoalModal();
  }
});

// Filter / range tabs (Recent Transactions: All/Income/Expense, Cash Flow: 1M/3M/1Y).
pageRoot?.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab-group .tab');
  if (!tab) return;

  const group = tab.parentElement;
  group.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
  tab.classList.add('is-active');

  const label = tab.textContent.trim();
  const lower = label.toLowerCase();
  if (['all', 'income', 'expense'].includes(lower)) {
    currentFilter = lower;
    txPage = 1;
    renderEverything();
  } else if (['1M', '3M', '1Y'].includes(label)) {
    cashFlowRange = label;
    renderCharts();
  } else if (['This Month', 'All Time'].includes(label)) {
    analyticsScope = label === 'This Month' ? 'month' : 'all';
    renderCharts();
  }
});

// Delete / edit delegation for the full transactions table.
pageRoot?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || !['delete', 'edit'].includes(btn.dataset.action)) return;
  const row = btn.closest('tr');
  const id = row?.dataset.id;
  if (!id) return;

  if (btn.dataset.action === 'edit') {
    const tx = getTransactions({ filter: 'all' }).find((t) => t.id === id);
    if (tx) openModal(tx);
    return;
  }

  if (btn.dataset.action === 'delete') {
    if (!confirm('Delete this transaction?')) return;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const snapshot = getTransactions({ filter: 'all' }).find((x) => x.id === id);
      await deleteTransaction(id);
      showToast('Transaction deleted.', 'success', 6000, snapshot ? {
        label: 'Undo',
        onClick: async () => {
          try {
            await addTransaction({
              type: snapshot.type,
              title: snapshot.title,
              amount: snapshot.amount,
              category: snapshot.category,
              date: snapshot.date,
              notes: snapshot.notes || '',
            });
            showToast('Transaction restored.', 'success');
          } catch (err) {
            showToast(err.message || 'Could not restore.', 'error');
          }
        },
      } : null);
    } catch (err) {
      showToast(err.message || 'Could not delete transaction.', 'error');
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
});

// Budget card actions (Edit / Delete) — delegated since #budgetGrid is only in the DOM when active.
pageRoot?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-action="edit-budget"]');
  if (editBtn) {
    openBudgetModal({ category: editBtn.dataset.category, limit: editBtn.dataset.limit });
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete-budget"]');
  if (deleteBtn) {
    if (confirm(`Remove the budget limit for "${deleteBtn.dataset.category}"?`)) {
      try {
        const cat = deleteBtn.dataset.category;
        const prev = getBudgets().find((b) => b.category === cat);
        await deleteBudget(cat);
        showToast('Budget limit removed.', 'success', 6000, prev ? {
          label: 'Undo',
          onClick: async () => {
            try {
              await upsertBudget(prev.category, prev.limit);
              showToast('Budget restored.', 'success');
            } catch (err) {
              showToast(err.message || 'Could not restore budget.', 'error');
            }
          },
        } : null);
      } catch (err) {
        showToast(err.message || 'Could not remove budget.', 'error');
      }
    }
  }
});

// Recurring transaction removal (Settings page).
pageRoot?.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-recurring"]');
  if (!deleteBtn) return;
  if (confirm('Stop this recurring transaction? Past entries it already created will stay.')) {
    try {
      await deleteRecurring(deleteBtn.dataset.id);
      showToast('Recurring transaction removed.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not remove recurring transaction.', 'error');
    }
  }
});

// Goal card actions (Edit / Delete) — delegated since #goalsGrid is only in the DOM when active.
pageRoot?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-action="edit-goal"]');
  if (editBtn) {
    const goal = getGoals().find((g) => g.id === editBtn.dataset.id);
    if (goal) openGoalModal(goal);
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete-goal"]');
  if (deleteBtn) {
    if (confirm('Delete this savings goal? This cannot be undone.')) {
      try {
        const gid = deleteBtn.dataset.id;
        const prev = getGoals().find((g) => g.id === gid);
        await deleteGoal(gid);
        showToast('Goal deleted.', 'success', 6000, prev ? {
          label: 'Undo',
          onClick: async () => {
            try {
              await addGoal({
                name: prev.name,
                target: prev.target,
                saved: prev.saved,
                deadline: prev.deadline || null,
              });
              showToast('Goal restored.', 'success');
            } catch (err) {
              showToast(err.message || 'Could not restore goal.', 'error');
            }
          },
        } : null);
      } catch (err) {
        showToast(err.message || 'Could not delete goal.', 'error');
      }
    }
  }
});

// ---------- Set Budget Limit modal ----------
const budgetModal = document.getElementById('budgetModal');
const budgetModalTitle = document.getElementById('budgetModalTitle');
enableFocusTrap(budgetModal);
const budgetCategoryInput = document.getElementById('budgetCategoryInput');
const budgetLimitInput = document.getElementById('budgetLimitInput');
const saveBudgetBtn = document.getElementById('saveBudgetBtn');
const budgetCustomCategoryField = document.getElementById('budgetCustomCategoryField');
const budgetCustomCategoryInput = document.getElementById('budgetCustomCategoryInput');
wireCustomCategoryToggle(budgetCategoryInput, budgetCustomCategoryField, budgetCustomCategoryInput);
let editingBudgetCategory = null;

function openBudgetModal(existing = null) {
  editingBudgetCategory = existing?.category || null;
  budgetModalTitle.textContent = existing ? 'Edit Budget Limit' : 'Set Budget Limit';
  populateCategorySelect(budgetCategoryInput, existing?.category, { includeCustomOption: !existing });
  budgetCategoryInput.disabled = Boolean(existing); // category is the unique key — lock it on edit
  budgetCustomCategoryField.style.display = 'none';
  budgetCustomCategoryInput.value = '';
  budgetLimitInput.value = existing?.limit ?? '';
  budgetModal.style.display = 'flex';
  budgetLimitInput.focus();
}

function closeBudgetModal() {
  budgetModal.style.display = 'none';
  budgetCategoryInput.disabled = false;
  budgetCustomCategoryField.style.display = 'none';
  budgetCustomCategoryInput.value = '';
  editingBudgetCategory = null;
}

document.getElementById('closeBudgetModalBtn')?.addEventListener('click', closeBudgetModal);
document.getElementById('cancelBudgetModalBtn')?.addEventListener('click', closeBudgetModal);
budgetModal?.addEventListener('click', (e) => { if (e.target === budgetModal) closeBudgetModal(); });

saveBudgetBtn?.addEventListener('click', async () => {
  const { category, error: categoryError } = resolveCategory(budgetCategoryInput, budgetCustomCategoryInput);
  const limit = Number(budgetLimitInput.value);

  if (categoryError) {
    showToast(categoryError, 'error');
    budgetCustomCategoryInput.focus();
    return;
  }
  if (!limit || limit <= 0 || !Number.isFinite(limit)) {
    showToast('Please enter a valid limit greater than zero.', 'error');
    budgetLimitInput.focus();
    return;
  }

  saveBudgetBtn.disabled = true;
  saveBudgetBtn.textContent = 'Saving…';
  try {
    await upsertBudget(category, limit);
    showToast('Budget limit saved.', 'success');
    closeBudgetModal();
  } catch (err) {
    showToast(err.message || 'Could not save budget limit.', 'error');
  } finally {
    saveBudgetBtn.disabled = false;
    saveBudgetBtn.textContent = 'Save Limit';
  }
});

// ---------- Savings Goal modal ----------
const goalModal = document.getElementById('goalModal');
const goalModalTitle = document.getElementById('goalModalTitle');
enableFocusTrap(goalModal);
const goalNameInput = document.getElementById('goalNameInput');
const goalTargetInput = document.getElementById('goalTargetInput');
const goalSavedInput = document.getElementById('goalSavedInput');
const goalDeadlineInput = document.getElementById('goalDeadlineInput');
const saveGoalBtn = document.getElementById('saveGoalBtn');
let editingGoalId = null;

function openGoalModal(existing = null) {
  editingGoalId = existing?.id || null;
  goalModalTitle.textContent = existing ? 'Edit Savings Goal' : 'New Savings Goal';
  goalNameInput.value = existing?.name || '';
  goalTargetInput.value = existing?.target ?? '';
  goalSavedInput.value = existing?.saved ?? 0;
  goalDeadlineInput.value = existing?.deadline || '';
  goalModal.style.display = 'flex';
  goalNameInput.focus();
}

function closeGoalModal() {
  goalModal.style.display = 'none';
  editingGoalId = null;
}

document.getElementById('closeGoalModalBtn')?.addEventListener('click', closeGoalModal);
document.getElementById('cancelGoalModalBtn')?.addEventListener('click', closeGoalModal);
goalModal?.addEventListener('click', (e) => { if (e.target === goalModal) closeGoalModal(); });

saveGoalBtn?.addEventListener('click', async () => {
  const name = goalNameInput.value.trim().slice(0, 80);
  const target = Number(goalTargetInput.value);
  const saved = Number(goalSavedInput.value || 0);
  const deadline = goalDeadlineInput.value || null;

  if (!name) {
    showToast('Please name this goal.', 'error');
    goalNameInput.focus();
    return;
  }
  if (!target || target <= 0 || !Number.isFinite(target)) {
    showToast('Please enter a valid target amount.', 'error');
    goalTargetInput.focus();
    return;
  }
  if (saved < 0 || !Number.isFinite(saved)) {
    showToast('Amount already saved can\u2019t be negative.', 'error');
    goalSavedInput.focus();
    return;
  }

  const isEditing = Boolean(editingGoalId);
  saveGoalBtn.disabled = true;
  saveGoalBtn.textContent = isEditing ? 'Updating…' : 'Saving…';
  try {
    if (isEditing) {
      await updateGoal(editingGoalId, { name, target, saved, deadline });
      showToast('Goal updated.', 'success');
    } else {
      await addGoal({ name, target, saved, deadline });
      showToast('Goal created.', 'success');
    }
    closeGoalModal();
  } catch (err) {
    showToast(err.message || 'Could not save goal.', 'error');
  } finally {
    saveGoalBtn.disabled = false;
    saveGoalBtn.textContent = 'Save Goal';
  }
});

// ---------- Notifications ----------
const notifBtn = document.getElementById('notifBtn');
const notifPanel = document.getElementById('notifPanel');
const notifBadge = document.getElementById('notifBadge');

function updateNotifBadge() {
  const notifBadge = document.getElementById('notifBadge');
  if (!notifBadge) return;
  const n = getInsights().length + getReminders().length;
  notifBadge.style.display = n ? 'block' : 'none';
  notifBadge.textContent = n > 9 ? '9+' : String(n);
}

function renderNotifPanel() {
  const notifPanel = document.getElementById('notifPanel');
  if (!notifPanel) return;
  const insights = getInsights();
  const reminders = getReminders();
  const items = [
    ...reminders.map((r) => ({ title: r.title, message: r.message, icon: r.kind === 'bill' ? 'zap' : 'alert' })),
    ...insights.map((ins) => ({ title: ins.title, message: ins.message, icon: ins.icon || 'info' })),
  ];
  const header = `<div class="notif-panel__header"><span>Alerts</span><span style="font-size:var(--text-xs);color:var(--color-text-muted)">${items.length} active</span></div>`;
  notifPanel.innerHTML = header + (items.length
    ? items.map((ins) => `
      <div class="notif-item">
        <span class="notif-item__icon">${icon(ins.icon, 18)}</span>
        <div>
          <span class="notif-item__title">${escapeHTML(ins.title)}</span>
          <p class="notif-item__message">${escapeHTML(ins.message)}</p>
        </div>
      </div>`).join('')
    : `<div class="notif-empty">You're all caught up — no bills or budget alerts.</div>`);
}

function toggleNotifPanel(show) {
  const isOpen = show ?? notifPanel.style.display === 'none';
  notifPanel.style.display = isOpen ? 'block' : 'none';
  notifBtn.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) renderNotifPanel();
}

notifBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleNotifPanel();
});
document.addEventListener('click', (e) => {
  if (notifPanel?.style.display === 'block' && !e.target.closest('#notifWrap')) {
    toggleNotifPanel(false);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && notifPanel?.style.display === 'block') toggleNotifPanel(false);
});

// ---------- Settings: Save Changes ----------
pageRoot?.addEventListener('click', async (e) => {
  if (!e.target.closest('#saveProfileBtn')) return;
  const btn = e.target.closest('#saveProfileBtn');
  const name = document.getElementById('settingsNameInput')?.value.trim();
  const email = document.getElementById('settingsEmailInput')?.value.trim();

  if (!name) {
    showToast('Please enter your name.', 'error');
    return;
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  const emailChanged = email !== getCurrentUser()?.email;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await updateProfile({ name, email });
    showToast(emailChanged ? 'Saved. Check your new email to confirm the change.' : 'Profile updated.', 'success');
  } catch (err) {
    showToast(err.message || 'Could not update profile.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

// Track manual edits so a background re-render doesn't overwrite what the user is typing.
pageRoot?.addEventListener('input', (e) => {
  if (e.target.matches('#settingsNameInput, #settingsEmailInput')) {
    e.target.dataset.touched = '1';
  }
});
pageRoot?.addEventListener('click', async (e) => {
  if (e.target.closest('[data-action="export-csv"]')) {
    try {
      const csv = exportTransactionsAsCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cashora-transactions.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV export started.', 'success');
    } catch (err) {
      showToast('Could not export CSV.', 'error');
    }
    return;
  }

  if (e.target.closest('[data-action="export-json"]')) {
    try {
      const json = exportFullBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Full backup downloaded.', 'success');
    } catch (err) {
      showToast('Could not export backup.', 'error');
    }
    return;
  }

  if (e.target.closest('#logoutBtn')) {
    if (confirm('Sign out of Cashora?')) {
      try {
        await logout();
        window.location.href = 'landing.html';
      } catch (err) {
        showToast('Could not sign out. Please try again.', 'error');
      }
    }
  }
});





// Dashboard quick actions → open add transaction (income / expense)
pageRoot?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="open-add"]');
  if (!btn) return;
  e.preventDefault();
  const type = (btn.getAttribute('data-type') || 'expense').toLowerCase();
  openModal();
  modalTabGroup?.querySelectorAll('.tab').forEach((tab) => {
    const label = tab.textContent.trim().toLowerCase();
    tab.classList.toggle('is-active', label === type);
  });
});

// ---------- Data: sample / reset ----------
function setDataStatus(msg, type = '') {
  const el = document.getElementById('dataActionStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.remove('is-success', 'is-error');
  if (type) el.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

pageRoot?.addEventListener('click', async (e) => {
  const loadBtn = e.target.closest('[data-action="load-demo"]');
  const resetDemoBtn = e.target.closest('[data-action="reset-and-demo"]');
  const resetBtn = e.target.closest('[data-action="reset-all"]');
  if (!loadBtn && !resetDemoBtn && !resetBtn) return;

  if (loadBtn) {
    if (!confirm('Load sample data?\n\nAdds example salary, expenses, budgets, goals, accounts and debts.\nOnly works if your account is empty.')) return;
    loadBtn.disabled = true;
    const label = loadBtn.textContent;
    loadBtn.textContent = 'Loading…';
    setDataStatus('Loading sample data…');
    try {
      const result = await seedDemoData();
      const msg = `Sample ready — ${result.transactions} transactions, ${result.budgets} budgets, ${result.goals} goals. Explore Dashboard, then edit or delete anything.`;
      setDataStatus(msg, 'success');
      showToast(msg, 'success', 5000);
    } catch (err) {
      setDataStatus(err.message || 'Could not load sample data.', 'error');
      showToast(err.message || 'Could not load sample data.', 'error');
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = label;
    }
    return;
  }

  if (resetDemoBtn) {
    if (!confirm('Reset everything and load sample data?\n\nThis DELETES all your transactions, budgets, goals, accounts and debts, then fills the account with demo numbers.\n\nThis cannot be undone.')) return;
    if (!confirm('Final check: delete all current data and replace with sample data?')) return;
    resetDemoBtn.disabled = true;
    const label = resetDemoBtn.textContent;
    resetDemoBtn.textContent = 'Resetting…';
    setDataStatus('Clearing your data and loading sample…');
    try {
      const result = await resetAllData({ loadDemo: true });
      const msg = `Fresh start with sample data — ${result.transactions} transactions loaded. Change anything you like.`;
      setDataStatus(msg, 'success');
      showToast(msg, 'success', 5000);
    } catch (err) {
      setDataStatus(err.message || 'Reset failed.', 'error');
      showToast(err.message || 'Reset failed.', 'error');
    } finally {
      resetDemoBtn.disabled = false;
      resetDemoBtn.textContent = label;
    }
    return;
  }

  if (resetBtn) {
    if (!confirm('Reset ALL data?\n\nDeletes every transaction, budget, goal, account, debt and recurring rule.\nYour login stays the same.\n\nThis cannot be undone.')) return;
    if (!confirm('Really wipe this account clean? Type-level confirm: OK to delete everything.')) return;
    resetBtn.disabled = true;
    const label = resetBtn.textContent;
    resetBtn.textContent = 'Resetting…';
    setDataStatus('Deleting all data…');
    try {
      await resetAllData({ loadDemo: false });
      const msg = 'All data cleared. Add your own transactions, or tap “Load sample data”.';
      setDataStatus(msg, 'success');
      showToast(msg, 'success', 5000);
    } catch (err) {
      setDataStatus(err.message || 'Reset failed.', 'error');
      showToast(err.message || 'Reset failed.', 'error');
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = label;
    }
  }
});

// ---------- Account modal ----------
const accountModal = document.getElementById('accountModal');
enableFocusTrap(accountModal);
let editingAccountId = null;

function openAccountModal(existing = null) {
  editingAccountId = existing?.id || null;
  document.getElementById('accountModalTitle').textContent = existing ? 'Edit Account' : 'Add Account';
  document.getElementById('accountNameInput').value = existing?.name || '';
  document.getElementById('accountKindSelect').value = existing?.kind || 'asset';
  document.getElementById('accountBalanceInput').value = existing?.balance ?? '';
  accountModal.style.display = 'flex';
  document.getElementById('accountNameInput').focus();
}
function closeAccountModal() {
  accountModal.style.display = 'none';
  editingAccountId = null;
}
document.getElementById('closeAccountModalBtn')?.addEventListener('click', closeAccountModal);
document.getElementById('cancelAccountModalBtn')?.addEventListener('click', closeAccountModal);
accountModal?.addEventListener('click', (e) => { if (e.target === accountModal) closeAccountModal(); });
document.getElementById('saveAccountBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('accountNameInput').value.trim();
  const kind = document.getElementById('accountKindSelect').value;
  const balance = Number(document.getElementById('accountBalanceInput').value);
  if (!name) { showToast('Please name this account.', 'error'); return; }
  if (!Number.isFinite(balance)) { showToast('Enter a valid balance.', 'error'); return; }
  try {
    await upsertAccount({ id: editingAccountId, name, kind, balance });
    showToast('Account saved.', 'success');
    closeAccountModal();
  } catch (err) {
    showToast(err.message || 'Could not save account.', 'error');
  }
});

// ---------- Debt modal ----------
const debtModal = document.getElementById('debtModal');
enableFocusTrap(debtModal);
let editingDebtId = null;

function openDebtModal(existing = null) {
  editingDebtId = existing?.id || null;
  document.getElementById('debtModalTitle').textContent = existing ? 'Edit Debt' : 'Add Debt';
  document.getElementById('debtNameInput').value = existing?.name || '';
  document.getElementById('debtBalanceInput').value = existing?.balance ?? '';
  document.getElementById('debtRateInput').value = existing?.interestRate ?? 0;
  document.getElementById('debtMinInput').value = existing?.minPayment ?? 0;
  debtModal.style.display = 'flex';
  document.getElementById('debtNameInput').focus();
}
function closeDebtModal() {
  debtModal.style.display = 'none';
  editingDebtId = null;
}
document.getElementById('closeDebtModalBtn')?.addEventListener('click', closeDebtModal);
document.getElementById('cancelDebtModalBtn')?.addEventListener('click', closeDebtModal);
debtModal?.addEventListener('click', (e) => { if (e.target === debtModal) closeDebtModal(); });
document.getElementById('saveDebtBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('debtNameInput').value.trim();
  const balance = Number(document.getElementById('debtBalanceInput').value);
  const interestRate = Number(document.getElementById('debtRateInput').value);
  const minPayment = Number(document.getElementById('debtMinInput').value);
  if (!name) { showToast('Please name this debt.', 'error'); return; }
  if (!Number.isFinite(balance) || balance < 0) { showToast('Enter a valid balance.', 'error'); return; }
  try {
    await upsertDebt({ id: editingDebtId, name, balance, interestRate, minPayment });
    showToast('Debt saved.', 'success');
    closeDebtModal();
  } catch (err) {
    showToast(err.message || 'Could not save debt.', 'error');
  }
});

// Net worth page actions
pageRoot?.addEventListener('click', async (e) => {
  if (e.target.closest('[data-action="add-account"]')) { openAccountModal(); return; }
  if (e.target.closest('[data-action="add-debt"]')) { openDebtModal(); return; }

  const editAcc = e.target.closest('[data-action="edit-account"]');
  if (editAcc) {
    const acc = getAccounts().find((a) => a.id === editAcc.dataset.id);
    if (acc) openAccountModal(acc);
    return;
  }
  const delAcc = e.target.closest('[data-action="delete-account"]');
  if (delAcc) {
    if (confirm('Delete this account?')) {
      try { await deleteAccount(delAcc.dataset.id); showToast('Account deleted.', 'success'); }
      catch (err) { showToast(err.message || 'Could not delete.', 'error'); }
    }
    return;
  }
  const editDebt = e.target.closest('[data-action="edit-debt"]');
  if (editDebt) {
    const d = getDebts().find((x) => x.id === editDebt.dataset.id);
    if (d) openDebtModal(d);
    return;
  }
  const delDebt = e.target.closest('[data-action="delete-debt"]');
  if (delDebt) {
    if (confirm('Delete this debt?')) {
      try { await deleteDebt(delDebt.dataset.id); showToast('Debt deleted.', 'success'); }
      catch (err) { showToast(err.message || 'Could not delete.', 'error'); }
    }
  }
});

// Debt method tabs (avalanche / snowball) — re-render only debts section via full render
pageRoot?.addEventListener('click', (e) => {
  const tab = e.target.closest('#debtMethodTabs .tab');
  if (!tab) return;
  tab.parentElement.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
  tab.classList.add('is-active');
  renderEverything();
});

// CSV import
pageRoot?.addEventListener('change', async (e) => {
  const input = e.target.closest('#csvImportInput');
  if (!input?.files?.length) return;
  const file = input.files[0];
  const status = document.getElementById('importStatus');
  try {
    const text = await file.text();
    const rows = parseTransactionsCSV(text);
    if (status) status.textContent = `Found ${rows.length} rows. Importing…`;
    const n = await importTransactions(rows);
    showToast(`Imported ${n} transactions.`, 'success');
    if (status) status.textContent = `Imported ${n} transactions from ${file.name}.`;
  } catch (err) {
    showToast(err.message || 'Import failed.', 'error');
    if (status) status.textContent = err.message || 'Import failed.';
  } finally {
    input.value = '';
  }
});

// Escape closes account/debt modals too
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (accountModal?.style.display === 'flex') closeAccountModal();
  if (debtModal?.style.display === 'flex') closeDebtModal();
});

// ---------- Search (desktop + mobile) ----------
const searchInput = document.getElementById('desktopSearchInput') || document.querySelector('.topbar__search input');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const searchToggle = document.getElementById('searchToggle');
const mobileSearch = document.getElementById('mobileSearch');

function applySearchFilter() {
  const raw = (
    (document.activeElement === mobileSearchInput ? mobileSearchInput?.value : null)
    ?? searchInput?.value
    ?? mobileSearchInput?.value
    ?? ''
  );
  const term = raw.trim().toLowerCase();

  // Keep both inputs in sync
  if (searchInput && mobileSearchInput && searchInput.value !== mobileSearchInput.value) {
    if (document.activeElement === mobileSearchInput) searchInput.value = mobileSearchInput.value;
    else if (document.activeElement === searchInput) mobileSearchInput.value = searchInput.value;
    else {
      // prefer non-empty
      const v = (searchInput.value || mobileSearchInput.value);
      searchInput.value = v;
      mobileSearchInput.value = v;
    }
  }

  const bodies = ['recentTableBody', 'recentTransactionsBody', 'allTransactionsBody'];
  let anyTable = false;
  bodies.forEach((id) => {
    const body = document.getElementById(id);
    if (!body) return;
    anyTable = true;
    body.querySelectorAll('tr[data-id]').forEach((row) => {
      const rowText = row.textContent.toLowerCase();
      row.style.display = !term || rowText.includes(term) ? '' : 'none';
    });
  });

  // If user is typing a search on Dashboard (no full ledger), jump to Transactions once
  if (term && term.length >= 2 && !document.getElementById('allTransactionsBody')) {
    if (location.hash.replace('#', '') !== 'transactions') {
      location.hash = '#transactions';
      // filter after view mounts
      setTimeout(applySearchFilter, 120);
      setTimeout(applySearchFilter, 350);
    }
  }
}

const debouncedSearch = debounce(applySearchFilter, 200);
searchInput?.addEventListener('input', debouncedSearch);
mobileSearchInput?.addEventListener('input', debouncedSearch);

searchToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!mobileSearch) return;
  const open = !mobileSearch.classList.contains('is-open');
  mobileSearch.classList.toggle('is-open', open);
  // force visibility (beats conflicting CSS)
  mobileSearch.style.display = open ? 'block' : 'none';
  searchToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    mobileSearchInput?.focus();
  }
});

// Close mobile search when tapping outside
document.addEventListener('click', (e) => {
  if (!mobileSearch?.classList.contains('is-open')) return;
  if (e.target.closest('#mobileSearch') || e.target.closest('#searchToggle')) return;
  mobileSearch.classList.remove('is-open');
  mobileSearch.style.display = 'none';
  searchToggle?.setAttribute('aria-expanded', 'false');
});

// ---------- Scroll to top ----------
const scrollTopBtn = document.getElementById('scrollTopBtn');
window.addEventListener('scroll', () => {
  const show = window.scrollY > 320;
  scrollTopBtn?.classList.toggle('is-visible', show);
}, { passive: true });
scrollTopBtn?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- Chart resize (orientation / window changes) ----------
window.addEventListener('resize', debounce(() => {
  try { renderCharts(); } catch (_) { /* view may not have canvases */ }
}, 200));

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  // Ignore when typing in inputs
  const tag = (e.target && e.target.tagName) || '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

  // "n" → new transaction
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openModal();
  }
  // "/" → focus search
  if (e.key === '/') {
    e.preventDefault();
    if (window.matchMedia('(max-width: 768px)').matches) {
      mobileSearch?.classList.add('is-open');
      searchToggle?.setAttribute('aria-expanded', 'true');
      mobileSearchInput?.focus();
    } else {
      searchInput?.focus();
    }
  }
});

