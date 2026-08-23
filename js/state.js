/* ==========================================================================
   Cashora — state.js
   In-memory cache backed by Supabase. Render functions read the cache
   synchronously; CRUD operations are async and hit Supabase directly,
   then update the cache and notify subscribers.
   ========================================================================== */

import { requireSupabase } from './supabaseClient.js';
import { APP_CONFIG } from './config.js';
import { assertWriteAllowed } from './utils.js';
import { formatCurrency } from './utils.js';

let cache = {
  user: null,
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  accounts: [],
  debts: [],
};

const listeners = new Set();
function notify() { listeners.forEach((fn) => fn(cache)); }
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Auth ----------
export async function isAuthenticated() {
  const { data } = await requireSupabase().auth.getSession();
  return Boolean(data.session);
}

export async function signup(name, email, password) {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw new Error(error.message);
  cache.user = data.user;
  return data.user;
}

export async function login(email, password) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  cache.user = data.user;
  return data.user;
}

export async function logout() {
  await requireSupabase().auth.signOut();
  cache = { user: null, transactions: [], budgets: [], goals: [], recurring: [], accounts: [], debts: [] };
}

export async function requestPasswordReset(email) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword) {
  const { error } = await requireSupabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export function getCurrentUser() {
  return cache.user;
}

/** Loads everything needed to render the dashboard. Call once after login / on page load. */
export async function initState() {
  const { data: { user } } = await requireSupabase().auth.getUser();
  if (!user) throw new Error('Not signed in.');
  cache.user = user;

  const [txRes, budgetRes, goalRes, recurringRes, accountsRes, debtsRes] = await Promise.all([
    requireSupabase().from('transactions').select('*').order('date', { ascending: false }),
    requireSupabase().from('budgets').select('*'),
    requireSupabase().from('goals').select('*'),
    requireSupabase().from('recurring_transactions').select('*'),
    requireSupabase().from('accounts').select('*'),
    requireSupabase().from('debts').select('*'),
  ]);

  if (txRes.error) throw new Error(txRes.error.message);
  if (budgetRes.error) throw new Error(budgetRes.error.message);
  if (goalRes.error) throw new Error(goalRes.error.message);

  cache.transactions = txRes.data
    .filter((row) => !row.deleted_at)
    .map(normalizeTx);
  cache.budgets = budgetRes.data
    .filter((b) => !b.deleted_at)
    .map((b) => ({ category: b.category, limit: Number(b.limit_amount) }));
  cache.goals = goalRes.data
    .filter((g) => !g.deleted_at)
    .map((g) => ({ ...g, target: Number(g.target), saved: Number(g.saved) }));

  // Recurring transactions are an optional add-on table — if the migration hasn't been
  // run yet, don't break the whole app over it, just treat recurring as unavailable.
  let postedCount = 0;
  if (recurringRes.error) {
    console.warn('Recurring transactions unavailable (run backend-supabase/migration_recurring.sql):', recurringRes.error.message);
    cache.recurring = [];
  } else {
    cache.recurring = recurringRes.data
      .filter((r) => !r.deleted_at)
      .map(normalizeRecurring);
    postedCount = await processDueRecurring();
  }

  if (accountsRes?.error) {
    console.warn('Accounts table unavailable (run migration_features.sql):', accountsRes.error.message);
    cache.accounts = [];
  } else {
    cache.accounts = (accountsRes.data || []).map((a) => ({
      id: a.id, name: a.name, kind: a.kind, balance: Number(a.balance), notes: a.notes || '',
    }));
  }

  if (debtsRes?.error) {
    console.warn('Debts table unavailable (run migration_features.sql):', debtsRes.error.message);
    cache.debts = [];
  } else {
    cache.debts = (debtsRes.data || []).map((d) => ({
      id: d.id, name: d.name, balance: Number(d.balance),
      interestRate: Number(d.interest_rate), minPayment: Number(d.min_payment),
    }));
  }

  notify();
  return { autoPostedCount: postedCount };
}

function normalizeTx(row) {
  return {
    id: row.id, type: row.type, title: row.title, category: row.category,
    amount: Number(row.amount), date: row.date,
    notes: row.notes || '', tags: row.tags || [],
  };
}

function normalizeRecurring(row) {
  return {
    id: row.id, type: row.type, title: row.title, category: row.category,
    amount: Number(row.amount), frequency: row.frequency, nextRunDate: row.next_run_date,
  };
}

export function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Catches up any recurring entries whose date has passed since the app was last opened.
 *  Returns how many transactions were auto-posted, so the UI can inform the user. */
async function processDueRecurring() {
  const today = new Date().toISOString().slice(0, 10);
  let posted = 0;

  for (const rule of cache.recurring) {
    let safety = 0; // hard cap so a bad rule/date can't loop forever
    while (rule.nextRunDate <= today && safety < 24) {
      const { data, error } = await requireSupabase()
        .from('transactions')
        .insert({
          user_id: cache.user.id, type: rule.type, title: rule.title,
          category: rule.category, amount: rule.amount, date: rule.nextRunDate,
        })
        .select()
        .single();
      if (error) { console.warn('Could not post recurring transaction:', error.message); break; }

      cache.transactions.unshift(normalizeTx(data));
      posted++;
      rule.nextRunDate = advanceDate(rule.nextRunDate, rule.frequency);
      await requireSupabase().from('recurring_transactions').update({ next_run_date: rule.nextRunDate }).eq('id', rule.id);
      safety++;
    }
  }

  return posted;
}


/** Best-effort audit trail (requires migration_production.sql). Never blocks the main action. */
async function logAudit(action, entity, entityId = null, meta = null) {
  try {
    const client = requireSupabase();
    if (!cache.user?.id) return;
    await client.from('audit_log').insert({
      user_id: cache.user.id,
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      meta,
    });
  } catch (_) {
    /* audit table may not exist yet — ignore */
  }
}

// ---------- Transactions ----------
export async function addTransaction({ type, title, amount, category, date }) {
  const { data, error } = await requireSupabase()
    .from('transactions')
    .insert({ user_id: cache.user.id, type, title, category, amount: Number(amount), date })
    .select()
    .single();
  if (error) throw new Error(error.message);
  cache.transactions.unshift(normalizeTx(data));
  notify();
  return data;
}

export async function deleteTransaction(id) {
  assertWriteAllowed(`deleteTransaction:${id}`);
  const { error } = await requireSupabase().from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache.transactions = cache.transactions.filter((t) => t.id !== id);
  notify();
  logAudit('delete', 'transaction', id);
}

export async function updateTransaction(id, updates) {
  assertWriteAllowed(`updateTransaction:${id}`);
  if (updates.amount != null && Number(updates.amount) > APP_CONFIG.maxAmount) {
    throw new Error('Amount exceeds the allowed maximum.');
  }
  const client = requireSupabase();
  let result = await client.from('transactions').update(updates).eq('id', id).select().single();
  if (result.error && updates.notes !== undefined && /notes/i.test(result.error.message)) {
    const { notes, ...rest } = updates;
    result = await client.from('transactions').update(rest).eq('id', id).select().single();
  }
  if (result.error) throw new Error(result.error.message);
  cache.transactions = cache.transactions.map((t) => (t.id === id ? normalizeTx(result.data) : t));
  notify();
  logAudit('update', 'transaction', id);
}

export function getTransactions({ filter = 'all' } = {}) {
  if (filter === 'all') return cache.transactions;
  return cache.transactions.filter((t) => t.type === filter);
}

// ---------- Derived data (sync — reads cache only) ----------

/** True if an ISO date string falls within `monthOffset` months of today (0 = this month, -1 = last month). */
function isInMonth(dateStr, monthOffset = 0) {
  const d = new Date(dateStr);
  const ref = new Date();
  ref.setMonth(ref.getMonth() + monthOffset);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** Income/expense for a single calendar month. monthOffset 0 = current month, -1 = previous month. */
export function getMonthlyTotals(monthOffset = 0) {
  const txs = cache.transactions.filter((t) => isInMonth(t.date, monthOffset));
  const income = txs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, balance: income - expense };
}

/** All-time totals — used only for "Total Balance", which is meant to be cumulative across all history. */
export function getTotals() {
  const income = cache.transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = cache.transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, balance: income - expense };
}

/** Expense-by-category. scope 'month' (default) matches the Budget Planner's monthly limits; pass 'all' for lifetime. */
export function getCategoryBreakdown(scope = 'month') {
  const totals = {};
  cache.transactions
    .filter((t) => t.type === 'expense')
    .filter((t) => (scope === 'month' ? isInMonth(t.date, 0) : true))
    .forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
  return Object.entries(totals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function getMonthlyBudgetUsage() {
  const totalLimit = cache.budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = getCategoryBreakdown().reduce((sum, c) => sum + c.amount, 0);
  const percent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
  return { totalLimit, totalSpent, percent, remaining: Math.max(totalLimit - totalSpent, 0) };
}

// ---------- Cash flow trend (respects 1M / 3M / 1Y range) ----------
export function getCashFlowSeries(range = '1M') {
  const days = range === '1M' ? 30 : range === '3M' ? 90 : 365;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const txs = cache.transactions
    .filter((t) => new Date(t.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!txs.length) return [];

  if (range === '1Y') {
    const byMonth = new Map();
    txs.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const net = t.type === 'income' ? t.amount : -t.amount;
      if (!byMonth.has(key)) {
        byMonth.set(key, { label: d.toLocaleDateString('en-IN', { month: 'short' }), value: 0 });
      }
      byMonth.get(key).value += net;
    });
    return [...byMonth.values()];
  }

  let running = 0;
  const byDate = new Map();
  txs.forEach((t) => {
    running += t.type === 'income' ? t.amount : -t.amount;
    byDate.set(t.date, running);
  });
  return [...byDate.entries()].map(([date, value]) => ({
    label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    value,
  }));
}

// ---------- Financial health score (0-100) ----------
export function getFinancialHealthScore() {
  const { income, expense } = getMonthlyTotals();
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const savingsScore = Math.min(Math.max(savingsRate * 200, 0), 100);

  const budgets = getBudgets();
  const budgetScore = budgets.length
    ? Math.min(Math.max(100 - Math.max(0, (budgets.reduce((s, b) => s + b.percent, 0) / budgets.length) - 80) * 2, 0), 100)
    : 70;

  const goals = getGoals();
  const goalScore = goals.length
    ? Math.min(goals.reduce((s, g) => s + Math.min((g.saved / g.target) * 100, 100), 0) / goals.length, 100)
    : 70;

  const score = Math.round(savingsScore * 0.5 + budgetScore * 0.3 + goalScore * 0.2);

  let label, message;
  if (score >= 80) { label = 'Excellent'; message = 'Your finances are in great shape — keep it up.'; }
  else if (score >= 60) { label = 'Good'; message = savingsRate > 0 ? 'Your savings rate is healthy this month.' : 'Solid overall, but keep an eye on spending.'; }
  else if (score >= 40) { label = 'Fair'; message = 'There\u2019s room to tighten your budget and boost savings.'; }
  else { label = 'Needs attention'; message = income > 0 && expense > income ? 'You\u2019re spending more than you earn this month.' : 'Add more transactions so we can track your trend.'; }

  return { score, label, message };
}

// ---------- Rule-based spending insights ----------
export function getInsights() {
  const insights = [];
  const { income, expense } = getMonthlyTotals();
  const budgets = getBudgets();
  const categories = getCategoryBreakdown();

  if (!cache.transactions.length) {
    return [{
      icon: 'sparkles',
      title: 'Add your first transaction',
      message: 'Once you log income and expenses, Cashora will surface personalized spending insights here.',
    }];
  }

  budgets.filter((b) => b.percent >= 100).forEach((b) => {
    insights.push({
      icon: 'alert',
      title: `${b.category} budget exceeded`,
      message: `You've spent ${formatCurrency(b.spent)} against a ${formatCurrency(b.limit)} limit — ${b.percent}% used.`,
    });
  });

  budgets.filter((b) => b.percent >= 85 && b.percent < 100).forEach((b) => {
    insights.push({
      icon: 'warning',
      title: `${b.category} nearing its limit`,
      message: `${b.percent}% of your ${formatCurrency(b.limit)} budget is used. ${formatCurrency(b.limit - b.spent)} left this month.`,
    });
  });

  if (categories.length) {
    const top = categories[0];
    const totalExpense = categories.reduce((s, c) => s + c.amount, 0);
    const share = Math.round((top.amount / totalExpense) * 100);
    if (share >= 35) {
      insights.push({
        icon: 'sparkles',
        title: `${top.category} is your biggest expense`,
        message: `It makes up ${share}% of your total spending (${formatCurrency(top.amount)}).`,
      });
    }
  }

  if (income > 0 && expense > income) {
    insights.push({
      icon: 'alert',
      title: 'Spending more than you earn',
      message: `Expenses (${formatCurrency(expense)}) have crossed income (${formatCurrency(income)}) this period.`,
    });
  } else if (income > 0) {
    const rate = Math.round(((income - expense) / income) * 100);
    if (rate >= 20) {
      insights.push({
        icon: 'sparkles',
        title: 'Strong savings rate',
        message: `You're saving about ${rate}% of your income — well above the recommended 20%.`,
      });
    }
  }

  if (!budgets.length) {
    insights.push({
      icon: 'sparkles',
      title: 'Set your first budget',
      message: 'Add category limits in the Budget Planner to get overspending alerts automatically.',
    });
  }

  return insights.slice(0, 4);
}

const BASE_CATEGORIES = ['Food & Groceries', 'Transport', 'Bills & Utilities', 'Shopping', 'Entertainment', 'Health', 'Other'];

/** Union of built-in categories and any custom ones the user has already used — so a
 *  custom category typed once shows up as a normal option from then on. */
export function getAllCategoryNames() {
  const used = new Set(BASE_CATEGORIES);
  getCustomCategories().forEach((c) => used.add(c));
  cache.transactions.forEach((t) => { if (t.category) used.add(t.category); });
  cache.budgets.forEach((b) => { if (b.category) used.add(b.category); });
  return [...used].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
}

/** Rich monthly snapshot for the home summary card. */
export function getMonthlySummary() {
  const cur = getMonthlyTotals(0);
  const prev = getMonthlyTotals(-1);
  const cats = getCategoryBreakdown('month');
  const top = cats[0] || null;
  const safe = getSafeToSpend();
  const rate = cur.income > 0 ? Math.round(((cur.income - cur.expense) / cur.income) * 100) : 0;
  const now = new Date();
  const label = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const expDelta = prev.expense === 0 ? null : Math.round(((cur.expense - prev.expense) / prev.expense) * 100);
  const incDelta = prev.income === 0 ? null : Math.round(((cur.income - prev.income) / prev.income) * 100);
  return {
    label,
    income: cur.income,
    expense: cur.expense,
    saved: cur.income - cur.expense,
    savingsRate: rate,
    topCategory: top,
    safeToSpend: safe.safe,
    incomeDeltaPct: incDelta,
    expenseDeltaPct: expDelta,
    categoryCount: cats.length,
  };
}

const CUSTOM_CAT_KEY = 'cashora-custom-categories';

export function getCustomCategories() {
  try {
    const raw = localStorage.getItem(CUSTOM_CAT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch (_) {
    return [];
  }
}

export function saveCustomCategory(name) {
  const n = String(name || '').trim().slice(0, 40);
  if (!n) throw new Error('Enter a category name.');
  const list = getCustomCategories();
  if (list.some((x) => x.toLowerCase() === n.toLowerCase())) return list;
  if (BASE_CATEGORIES.some((x) => x.toLowerCase() === n.toLowerCase())) return list;
  list.push(n);
  localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(list));
  return list;
}

export function removeCustomCategory(name) {
  const list = getCustomCategories().filter((x) => x !== name);
  localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(list));
  return list;
}


export function getRecurring() {
  return cache.recurring;
}

export async function addRecurring({ title, category, type, amount, frequency, nextRunDate }) {
  const { data, error } = await requireSupabase()
    .from('recurring_transactions')
    .insert({
      user_id: cache.user.id, type, title, category,
      amount: Number(amount), frequency, next_run_date: nextRunDate,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  cache.recurring.push(normalizeRecurring(data));
  notify();
}

export async function deleteRecurring(id) {
  assertWriteAllowed(`deleteRecurring:${id}`);
  const { error } = await requireSupabase().from('recurring_transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache.recurring = cache.recurring.filter((r) => r.id !== id);
  notify();
  logAudit('delete', 'recurring', id);
}

export function getBudgets() {
  const spendByCategory = Object.fromEntries(getCategoryBreakdown().map((c) => [c.category, c.amount]));
  return cache.budgets.map((b) => ({
    ...b,
    spent: spendByCategory[b.category] || 0,
    percent: Math.min(Math.round(((spendByCategory[b.category] || 0) / b.limit) * 100), 100),
  }));
}

export async function upsertBudget(category, limit) {
  assertWriteAllowed(`upsertBudget:${category}`);
  if (Number(limit) > APP_CONFIG.maxAmount) throw new Error('Limit exceeds the allowed maximum.');
  const { error } = await requireSupabase()
    .from('budgets')
    .upsert({ user_id: cache.user.id, category, limit_amount: Number(limit) }, { onConflict: 'user_id,category' });
  if (error) throw new Error(error.message);
  const existing = cache.budgets.find((b) => b.category === category);
  if (existing) existing.limit = Number(limit);
  else cache.budgets.push({ category, limit: Number(limit) });
  notify();
  logAudit('upsert', 'budget', category, { limit: Number(limit) });
}

export async function deleteBudget(category) {
  assertWriteAllowed(`deleteBudget:${category}`);
  const { error } = await requireSupabase().from('budgets').delete().eq('user_id', cache.user.id).eq('category', category);
  if (error) throw new Error(error.message);
  cache.budgets = cache.budgets.filter((b) => b.category !== category);
  notify();
  logAudit('delete', 'budget', category);
}

// ---------- Goals ----------
export function getGoals() {
  return cache.goals;
}

export async function addGoal({ name, target, saved = 0, deadline }) {
  assertWriteAllowed('addGoal');
  if (Number(target) > APP_CONFIG.maxAmount) throw new Error('Target exceeds the allowed maximum.');
  const { data, error } = await requireSupabase()
    .from('goals')
    .insert({ user_id: cache.user.id, name, target: Number(target), saved: Number(saved), deadline: deadline || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  cache.goals.push(data);
  notify();
  logAudit('create', 'goal', data.id);
  return data;
}

export async function updateGoal(id, { name, target, saved, deadline }) {
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (target !== undefined) updates.target = Number(target);
  if (saved !== undefined) updates.saved = Number(saved);
  if (deadline !== undefined) updates.deadline = deadline || null;

  const { data, error } = await requireSupabase().from('goals').update(updates).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  cache.goals = cache.goals.map((g) => (g.id === id ? { ...g, ...data, target: Number(data.target), saved: Number(data.saved) } : g));
  notify();
  logAudit('update', 'goal', id);
  return data;
}

export async function deleteGoal(id) {
  assertWriteAllowed(`deleteGoal:${id}`);
  const { error } = await requireSupabase().from('goals').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache.goals = cache.goals.filter((g) => g.id !== id);
  notify();
  logAudit('delete', 'goal', id);
}

// ---------- Profile ----------
/** Updates display name and/or email. Changing email triggers Supabase's confirmation flow. */
export async function updateProfile({ name, email }) {
  const payload = {};
  if (name !== undefined) payload.data = { name };
  if (email !== undefined && email !== cache.user?.email) payload.email = email;

  if (!Object.keys(payload).length) return cache.user;

  const { data, error } = await requireSupabase().auth.updateUser(payload);
  if (error) throw new Error(error.message);
  cache.user = data.user;
  notify();
  return data.user;
}

// ---------- Export ----------
function csvField(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function exportTransactionsAsCSV() {
  const header = 'Date,Title,Category,Type,Amount,Notes\n';
  const rows = cache.transactions
    .map((t) => [t.date, t.title, t.category, t.type, t.amount, t.notes || ''].map(csvField).join(','))
    .join('\n');
  return header + rows;
}

// ---------- Accounts (Net Worth) ----------
export function getAccounts() {
  return cache.accounts;
}

export function getNetWorth() {
  const assets = cache.accounts.filter((a) => a.kind === 'asset').reduce((s, a) => s + a.balance, 0);
  const liabilities = cache.accounts.filter((a) => a.kind === 'liability').reduce((s, a) => s + a.balance, 0)
    + cache.debts.reduce((s, d) => s + d.balance, 0);
  return { assets, liabilities, netWorth: assets - liabilities };
}

export async function upsertAccount({ id, name, kind, balance, notes }) {
  assertWriteAllowed('upsertAccount');
  const client = requireSupabase();
  const payload = {
    user_id: cache.user.id,
    name: String(name).slice(0, 100),
    kind,
    balance: Number(balance) || 0,
    notes: notes || null,
  };
  if (id) {
    const { data, error } = await client.from('accounts').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    cache.accounts = cache.accounts.map((a) => (a.id === id ? { id: data.id, name: data.name, kind: data.kind, balance: Number(data.balance), notes: data.notes || '' } : a));
  } else {
    const { data, error } = await client.from('accounts').insert(payload).select().single();
    if (error) throw new Error(error.message);
    cache.accounts.push({ id: data.id, name: data.name, kind: data.kind, balance: Number(data.balance), notes: data.notes || '' });
  }
  notify();
  logAudit(id ? 'update' : 'create', 'account', id || null);
}

export async function deleteAccount(id) {
  assertWriteAllowed(`deleteAccount:${id}`);
  const { error } = await requireSupabase().from('accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache.accounts = cache.accounts.filter((a) => a.id !== id);
  notify();
  logAudit('delete', 'account', id);
}

// ---------- Debts ----------
export function getDebts() {
  return cache.debts;
}

/** Simple avalanche (highest interest first) vs snowball (lowest balance first). */
export function getDebtPayoffPlan(method = 'avalanche') {
  const debts = [...cache.debts].filter((d) => d.balance > 0);
  if (method === 'snowball') debts.sort((a, b) => a.balance - b.balance);
  else debts.sort((a, b) => b.interestRate - a.interestRate);
  return debts.map((d, i) => ({ ...d, priority: i + 1 }));
}

export async function upsertDebt({ id, name, balance, interestRate, minPayment }) {
  assertWriteAllowed('upsertDebt');
  const client = requireSupabase();
  const payload = {
    user_id: cache.user.id,
    name: String(name).slice(0, 100),
    balance: Number(balance) || 0,
    interest_rate: Number(interestRate) || 0,
    min_payment: Number(minPayment) || 0,
  };
  if (id) {
    const { data, error } = await client.from('debts').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    cache.debts = cache.debts.map((d) => (d.id === id ? {
      id: data.id, name: data.name, balance: Number(data.balance),
      interestRate: Number(data.interest_rate), minPayment: Number(data.min_payment),
    } : d));
  } else {
    const { data, error } = await client.from('debts').insert(payload).select().single();
    if (error) throw new Error(error.message);
    cache.debts.push({
      id: data.id, name: data.name, balance: Number(data.balance),
      interestRate: Number(data.interest_rate), minPayment: Number(data.min_payment),
    });
  }
  notify();
}

export async function deleteDebt(id) {
  assertWriteAllowed(`deleteDebt:${id}`);
  const { error } = await requireSupabase().from('debts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache.debts = cache.debts.filter((d) => d.id !== id);
  notify();
}

// ---------- Safe to spend ----------
/** Rough "safe to spend" = this month income - expenses - remaining budget reserved OR just income - expense. */
export function getSafeToSpend() {
  const { income, expense } = getMonthlyTotals(0);
  const { remaining } = getMonthlyBudgetUsage();
  const upcomingBills = getUpcomingBills(14).reduce((s, b) => s + b.amount, 0);
  const left = income - expense;
  // Prefer budget remaining when budgets exist; else cash left this month minus near-term bills
  const budgets = getBudgets();
  const safe = budgets.length ? Math.max(remaining - upcomingBills, 0) : Math.max(left - upcomingBills, 0);
  return { safe, income, expense, left, upcomingBills, remaining };
}

// ---------- Upcoming bills from recurring expenses ----------
export function getUpcomingBills(withinDays = 30) {
  const today = new Date();
  const end = new Date();
  end.setDate(end.getDate() + withinDays);
  return cache.recurring
    .filter((r) => r.type === 'expense')
    .map((r) => {
      const d = new Date(r.nextRunDate);
      return { ...r, due: r.nextRunDate, daysUntil: Math.ceil((d - today) / 86400000) };
    })
    .filter((r) => {
      const d = new Date(r.due);
      return d >= new Date(today.toDateString()) && d <= end;
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// ---------- 50/30/20 rule ----------
const NEEDS = new Set(['Food & Groceries', 'Transport', 'Bills & Utilities', 'Health', 'Rent', 'Housing', 'Insurance', 'Utilities']);
const WANTS = new Set(['Entertainment', 'Shopping', 'Dining', 'Travel', 'Subscriptions']);


/** Unified reminders: bills due soon + budget pressure (for bell + home). */
export function getReminders() {
  const bills = getUpcomingBills(7).map((b) => {
    const when = b.daysUntil === 0 ? 'Today' : b.daysUntil === 1 ? 'Tomorrow' : `In ${b.daysUntil} days`;
    return {
      id: `bill-${b.id || b.title}`,
      kind: 'bill',
      title: b.title || 'Upcoming bill',
      message: `${when} · ₹${Number(b.amount).toLocaleString('en-IN')}`,
      amount: b.amount,
      date: b.due,
      severity: b.daysUntil <= 1 ? 'danger' : 'warning',
    };
  });
  const usage = getMonthlyBudgetUsage();
  const percent = usage.percent ?? 0;
  const remaining = usage.remaining ?? 0;
  const budgetAlerts = [];
  if (percent >= 100) {
    budgetAlerts.push({
      id: 'budget-over',
      kind: 'budget',
      title: 'Over budget',
      message: "This month's spending has crossed your total budget limits.",
      severity: 'danger',
    });
  } else if (percent >= 85) {
    budgetAlerts.push({
      id: 'budget-high',
      kind: 'budget',
      title: 'Budget nearly used',
      message: `${Math.round(percent)}% of budget used.`,
      severity: 'warning',
    });
  }
  return [...bills, ...budgetAlerts].slice(0, 12);
}


export function getFiftyThirtyTwenty() {
  const { income } = getMonthlyTotals(0);
  const cats = getCategoryBreakdown('month');
  let needs = 0, wants = 0, other = 0;
  cats.forEach((c) => {
    if (NEEDS.has(c.category)) needs += c.amount;
    else if (WANTS.has(c.category)) wants += c.amount;
    else other += c.amount; // treat uncategorized/other as flexible savings pressure
  });
  const savings = Math.max(income - needs - wants - other, 0);
  const totalOut = needs + wants + other;
  const pct = (n) => (income > 0 ? Math.round((n / income) * 100) : 0);
  return {
    income,
    needs: { amount: needs, pct: pct(needs), target: 50 },
    wants: { amount: wants, pct: pct(wants), target: 30 },
    savings: { amount: savings, pct: pct(savings), target: 20 },
    other: { amount: other, pct: pct(other) },
    totalOut,
  };
}

// ---------- Subscription detector (heuristic from expense history) ----------
export function detectSubscriptions() {
  const expenses = cache.transactions.filter((t) => t.type === 'expense');
  const byKey = new Map();
  expenses.forEach((t) => {
    const key = `${t.title.trim().toLowerCase()}|${t.category}|${t.amount}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t.date);
  });
  const subs = [];
  byKey.forEach((dates, key) => {
    if (dates.length < 2) return;
    const sorted = [...dates].sort();
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // ~weekly (5-10d) or ~monthly (25-35d)
    if ((avgGap >= 5 && avgGap <= 10) || (avgGap >= 25 && avgGap <= 35)) {
      const [title, category, amount] = key.split('|');
      subs.push({
        title: expenses.find((t) => t.title.trim().toLowerCase() === title)?.title || title,
        category,
        amount: Number(amount),
        occurrences: dates.length,
        avgDays: Math.round(avgGap),
        cadence: avgGap <= 10 ? 'weekly' : 'monthly',
        lastDate: sorted[sorted.length - 1],
      });
    }
  });
  return subs.sort((a, b) => b.amount - a.amount);
}

// ---------- Month comparison ----------
export function getMonthComparison() {
  const cur = getMonthlyTotals(0);
  const prev = getMonthlyTotals(-1);
  const delta = (a, b) => a - b;
  const pctChange = (a, b) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));
  return {
    current: cur,
    previous: prev,
    incomeDelta: delta(cur.income, prev.income),
    expenseDelta: delta(cur.expense, prev.expense),
    incomePct: pctChange(cur.income, prev.income),
    expensePct: pctChange(cur.expense, prev.expense),
  };
}

// ---------- CSV Import ----------
/** Parse a simple CSV string of transactions. Expected headers include Date, Title, Category, Type, Amount (Notes optional). */
export function parseTransactionsCSV(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row.');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const idx = (names) => names.reduce((found, n) => (found >= 0 ? found : headers.indexOf(n)), -1);
  const iDate = idx(['date']);
  const iTitle = idx(['title', 'description', 'name', 'memo']);
  const iCat = idx(['category']);
  const iType = idx(['type']);
  const iAmt = idx(['amount']);
  const iNotes = idx(['notes', 'note']);
  if (iDate < 0 || iTitle < 0 || iAmt < 0) {
    throw new Error('CSV must include Date, Title (or Description), and Amount columns.');
  }

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of lines[li]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur);
    const amountRaw = (cols[iAmt] || '').replace(/[₹,\s]/g, '');
    const amount = Math.abs(Number(amountRaw));
    if (!amount || !Number.isFinite(amount)) continue;
    let type = (iType >= 0 ? cols[iType] : '').trim().toLowerCase();
    if (!type) type = Number(amountRaw) < 0 ? 'expense' : 'expense';
    if (type !== 'income' && type !== 'expense') type = 'expense';
    const date = (cols[iDate] || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      type,
      title: (cols[iTitle] || 'Imported').trim().slice(0, 80),
      category: (iCat >= 0 ? cols[iCat] : 'Other').trim().slice(0, 40) || 'Other',
      amount,
      date,
      notes: iNotes >= 0 ? (cols[iNotes] || '').trim().slice(0, 200) : '',
    });
  }
  return rows;
}

export async function importTransactions(rows) {
  assertWriteAllowed('importTransactions', 2000);
  if (!rows.length) throw new Error('No valid rows to import.');
  const client = requireSupabase();
  let imported = 0;
  // Batch in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map((r) => ({
      user_id: cache.user.id,
      type: r.type,
      title: r.title,
      category: r.category,
      amount: r.amount,
      date: r.date,
    }));
    let { data, error } = await client.from('transactions').insert(chunk).select();
    if (error) throw new Error(error.message);
    (data || []).forEach((row) => cache.transactions.unshift(normalizeTx(row)));
    imported += (data || []).length;
  }
  cache.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  notify();
  logAudit('import', 'transaction', null, { count: imported });
  return imported;
}

// ---------- Full JSON backup ----------
export function exportFullBackup() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: cache.transactions,
    budgets: cache.budgets,
    goals: cache.goals,
    recurring: cache.recurring,
    accounts: cache.accounts,
    debts: cache.debts,
  }, null, 2);
}

// ---------- Filtered transactions helper ----------
export function getFilteredTransactions({ filter = 'all', category = null, q = '', from = null, to = null } = {}) {
  let list = getTransactions({ filter });
  if (category) list = list.filter((t) => t.category === category);
  if (from) list = list.filter((t) => t.date >= from);
  if (to) list = list.filter((t) => t.date <= to);
  if (q) {
    const term = q.toLowerCase();
    list = list.filter((t) =>
      t.title.toLowerCase().includes(term)
      || t.category.toLowerCase().includes(term)
      || (t.notes || '').toLowerCase().includes(term)
    );
  }
  return list;
}

export function getOnboardingProgress() {
  const steps = [
    { id: 'tx', label: 'Add your first transaction', done: cache.transactions.length > 0 },
    { id: 'budget', label: 'Set a budget limit', done: cache.budgets.length > 0 },
    { id: 'goal', label: 'Create a savings goal', done: cache.goals.length > 0 },
    { id: 'account', label: 'Add an account for net worth', done: cache.accounts.length > 0 },
    { id: 'recurring', label: 'Set up a recurring bill', done: cache.recurring.length > 0 },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}

// ---------- Demo / sample data ----------
/** Realistic INR sample dataset so a new user can explore every screen immediately. */

/**
 * Wipe all finance data for the current user, then optionally re-seed demo data.
 * Order: child tables first; ignores missing tables (migrations not run).
 */
export async function resetAllData({ loadDemo = false } = {}) {
  assertWriteAllowed('resetAllData', 3000);
  if (!cache.user?.id) throw new Error('Not signed in.');
  const client = requireSupabase();
  const uid = cache.user.id;

  const tables = [
    'transactions',
    'budgets',
    'goals',
    'recurring_transactions',
    'accounts',
    'debts',
  ];

  for (const table of tables) {
    try {
      const { error } = await client.from(table).delete().eq('user_id', uid);
      if (error) console.warn(`reset ${table}:`, error.message);
    } catch (err) {
      console.warn(`reset ${table}:`, err.message);
    }
  }

  cache.transactions = [];
  cache.budgets = [];
  cache.goals = [];
  cache.recurring = [];
  cache.accounts = [];
  cache.debts = [];
  notify();
  logAudit('reset', 'all', null, { loadDemo });

  if (loadDemo) {
    return seedDemoData();
  }
  return { transactions: 0, budgets: 0, goals: 0 };
}

export async function seedDemoData({ force = false } = {}) {
  assertWriteAllowed('seedDemoData', 3000);
  if (!cache.user?.id) throw new Error('Not signed in.');
  if (!force && cache.transactions.length > 0) {
    throw new Error('You already have data. Use Settings → Reset & load sample data to start over.');
  }

  const client = requireSupabase();
  const uid = cache.user.id;
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const daysFromNow = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  // Base columns only — works even if migration_features.sql (notes) was not run yet.
  const sampleTx = [
    { type: 'income', title: 'Salary — Acme Corp', category: 'Income', amount: 75000, date: daysAgo(3) },
    { type: 'income', title: 'Freelance design', category: 'Income', amount: 12000, date: daysAgo(12) },
    { type: 'expense', title: 'BigBasket groceries', category: 'Food & Groceries', amount: 3240, date: daysAgo(1) },
    { type: 'expense', title: 'Swiggy dinner', category: 'Food & Groceries', amount: 480, date: daysAgo(2) },
    { type: 'expense', title: 'Metro card top-up', category: 'Transport', amount: 500, date: daysAgo(4) },
    { type: 'expense', title: 'Uber to office', category: 'Transport', amount: 220, date: daysAgo(5) },
    { type: 'expense', title: 'Electricity bill', category: 'Bills & Utilities', amount: 1850, date: daysAgo(6) },
    { type: 'expense', title: 'Airtel broadband', category: 'Bills & Utilities', amount: 999, date: daysAgo(8) },
    { type: 'expense', title: 'Netflix', category: 'Entertainment', amount: 649, date: daysAgo(10) },
    { type: 'expense', title: 'Movie — PVR', category: 'Entertainment', amount: 750, date: daysAgo(15) },
    { type: 'expense', title: 'Amazon order', category: 'Shopping', amount: 2199, date: daysAgo(7) },
    { type: 'expense', title: 'Decathlon shoes', category: 'Shopping', amount: 3499, date: daysAgo(20) },
    { type: 'expense', title: 'Pharmacy', category: 'Health', amount: 560, date: daysAgo(9) },
    { type: 'expense', title: 'Gym membership', category: 'Health', amount: 1500, date: daysAgo(25) },
    { type: 'income', title: 'Salary — Acme Corp', category: 'Income', amount: 75000, date: daysAgo(35) },
    { type: 'expense', title: 'BigBasket groceries', category: 'Food & Groceries', amount: 2800, date: daysAgo(32) },
    { type: 'expense', title: 'Rent', category: 'Bills & Utilities', amount: 18000, date: daysAgo(33) },
    { type: 'expense', title: 'Petrol', category: 'Transport', amount: 2000, date: daysAgo(30) },
  ];

  const payload = sampleTx.map((t) => ({
    user_id: uid,
    type: t.type,
    title: t.title,
    category: t.category,
    amount: t.amount,
    date: t.date,
  }));

  let { data: txData, error: txErr } = await client.from('transactions').insert(payload).select();
  if (txErr) throw new Error(txErr.message);
  cache.transactions = (txData || []).map(normalizeTx).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Budgets
  const budgetRows = [
    { category: 'Food & Groceries', limit_amount: 10000 },
    { category: 'Transport', limit_amount: 4000 },
    { category: 'Entertainment', limit_amount: 3000 },
    { category: 'Shopping', limit_amount: 5000 },
  ];
  const { data: bData, error: bErr } = await client
    .from('budgets')
    .upsert(budgetRows.map((b) => ({ user_id: uid, ...b })), { onConflict: 'user_id,category' })
    .select();
  if (!bErr && bData) {
    cache.budgets = bData.map((b) => ({ category: b.category, limit: Number(b.limit_amount) }));
  }

  // Goals
  const { data: gData, error: gErr } = await client
    .from('goals')
    .insert([
      { user_id: uid, name: 'Emergency Fund', target: 150000, saved: 62000, deadline: daysFromNow(180) },
      { user_id: uid, name: 'Goa trip', target: 40000, saved: 12500, deadline: daysFromNow(90) },
    ])
    .select();
  if (!gErr && gData) {
    cache.goals = gData.map((g) => ({ ...g, target: Number(g.target), saved: Number(g.saved) }));
  }

  // Recurring (optional table)
  try {
    const { data: rData, error: rErr } = await client
      .from('recurring_transactions')
      .insert([
        {
          user_id: uid, type: 'expense', title: 'Netflix', category: 'Entertainment',
          amount: 649, frequency: 'monthly', next_run_date: daysFromNow(5),
        },
        {
          user_id: uid, type: 'expense', title: 'Rent', category: 'Bills & Utilities',
          amount: 18000, frequency: 'monthly', next_run_date: daysFromNow(8),
        },
        {
          user_id: uid, type: 'income', title: 'Salary — Acme Corp', category: 'Income',
          amount: 75000, frequency: 'monthly', next_run_date: daysFromNow(27),
        },
      ])
      .select();
    if (!rErr && rData) cache.recurring = rData.map(normalizeRecurring);
  } catch (_) { /* table may not exist */ }

  // Accounts + debts (optional)
  try {
    const { data: aData, error: aErr } = await client
      .from('accounts')
      .insert([
        { user_id: uid, name: 'HDFC Savings', kind: 'asset', balance: 124500 },
        { user_id: uid, name: 'Cash wallet', kind: 'asset', balance: 3500 },
        { user_id: uid, name: 'EPF (approx)', kind: 'asset', balance: 210000 },
      ])
      .select();
    if (!aErr && aData) {
      cache.accounts = aData.map((a) => ({
        id: a.id, name: a.name, kind: a.kind, balance: Number(a.balance), notes: a.notes || '',
      }));
    }
  } catch (_) {}

  try {
    const { data: dData, error: dErr } = await client
      .from('debts')
      .insert([
        { user_id: uid, name: 'Personal loan', balance: 85000, interest_rate: 12.5, min_payment: 4500 },
        { user_id: uid, name: 'Credit card', balance: 22000, interest_rate: 36, min_payment: 2000 },
      ])
      .select();
    if (!dErr && dData) {
      cache.debts = dData.map((d) => ({
        id: d.id, name: d.name, balance: Number(d.balance),
        interestRate: Number(d.interest_rate), minPayment: Number(d.min_payment),
      }));
    }
  } catch (_) {}

  notify();
  logAudit('seed', 'demo', null, { transactions: sampleTx.length });
  return {
    transactions: sampleTx.length,
    budgets: budgetRows.length,
    goals: 2,
  };
}

/** True when the account has no user data yet (safe to offer demo seed). */
export function isAccountEmpty() {
  return (
    cache.transactions.length === 0
    && cache.budgets.length === 0
    && cache.goals.length === 0
    && cache.accounts.length === 0
    && cache.debts.length === 0
  );
}

