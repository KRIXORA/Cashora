/* ==========================================================================
   Cashora — transactions.js
   DOM rendering for transaction-related UI: tables, category list, stats.
   Pure render functions — read from state, write to DOM. No state mutation here.
   ========================================================================== */

import { formatCurrency, formatDate, categoryIcon, escapeHTML, emptyState } from './utils.js';
import { icon } from './icons.js';
import { CATEGORY_PALETTE } from './charts.js';
import {
  getTransactions, getTotals, getMonthlyTotals, getCategoryBreakdown, getMonthlyBudgetUsage,
  getBudgets, getGoals, getFinancialHealthScore, getInsights, getCurrentUser, getRecurring,
  getNetWorth, getAccounts, getDebts, getDebtPayoffPlan, getSafeToSpend, getFiftyThirtyTwenty,
  getUpcomingBills, detectSubscriptions, getMonthComparison, getOnboardingProgress, isAccountEmpty, getMonthlySummary, getCustomCategories, getAllCategoryNames, getReminders,
} from './state.js';

function txRowHTML(t, { withActions = false } = {}) {
  const sign = t.type === 'income' ? '+' : '−';
  const color = t.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)';
  return `
    <tr data-id="${t.id}">
      <td data-label="Date">${formatDate(t.date)}</td>
      <td class="table-row-icon" data-label-heading><span class="icon-badge">${categoryIcon(t.category)}</span> ${escapeHTML(t.title)}</td>
      <td data-label="Category"><span class="badge badge--neutral">${escapeHTML(t.category)}</span></td>
      <td data-label="Amount" style="color:${color}">${sign}${formatCurrency(t.amount)}</td>
      ${withActions ? `<td data-label="Actions">
        <button class="btn btn-ghost btn-sm" data-action="edit">Edit</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" style="color:var(--color-danger)">Delete</button>
      </td>` : ''}
    </tr>`;
}

export function renderRecentTransactions(filter = 'all') {
  const txs = getTransactions({ filter }).slice(0, 6);
  const html = txs.length
    ? txs.map((t) => txRowHTML(t)).join('')
    : `<tr><td colspan="4">${emptyState({ title: 'No activity yet', body: 'Add an income or expense to see it here.', actionLabel: '+ Add transaction', actionAttrs: 'data-action="open-add" data-type="expense"' })}</td></tr>`;
  // Dashboard uses #recentTableBody; older/other views may use #recentTransactionsBody
  ['recentTableBody', 'recentTransactionsBody'].forEach((id) => {
    const body = document.getElementById(id);
    if (body) body.innerHTML = html;
  });
}

const TX_PAGE_SIZE = 15;

export function renderAllTransactions(filter = 'all', page = 1) {
  const body = document.getElementById('allTransactionsBody');
  const paginationEl = document.getElementById('txPagination');
  if (!body) return 1;

  const all = getTransactions({ filter });
  const totalPages = Math.max(1, Math.ceil(all.length / TX_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (clampedPage - 1) * TX_PAGE_SIZE;
  const pageItems = all.slice(start, start + TX_PAGE_SIZE);

  body.innerHTML = pageItems.length
    ? pageItems.map((t) => txRowHTML(t, { withActions: true })).join('')
    : `<tr><td colspan="5">${emptyState({ title: 'No transactions', body: 'Your ledger is empty. Start with salary, rent, or a small expense.', actionLabel: '+ Add transaction', actionAttrs: 'data-action="open-add" data-type="expense"' })}</td></tr>`;

  if (paginationEl) {
    paginationEl.innerHTML = all.length > TX_PAGE_SIZE ? `
      <button class="btn btn-ghost btn-sm" data-action="tx-prev-page" ${clampedPage === 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span class="pagination__label">Page ${clampedPage} of ${totalPages} &middot; ${all.length} transactions</span>
      <button class="btn btn-ghost btn-sm" data-action="tx-next-page" ${clampedPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>
    ` : '';
  }

  return clampedPage;
}

function deltaText(current, previous) {
  if (previous === 0) return current > 0 ? { text: 'New this month', cls: 'stat-card__meta--positive' } : { text: 'No activity last month', cls: '' };
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct}% vs last month`, cls: pct >= 0 ? 'stat-card__meta--positive' : 'stat-card__meta--negative' };
}

export function renderStatCards() {
  const { balance } = getTotals(); // lifetime — "Total Balance" is cumulative by design
  const { income, expense } = getMonthlyTotals(0);
  const prev = getMonthlyTotals(-1);

  const balanceEl = document.getElementById('statBalance');
  const incomeEl = document.getElementById('statIncome');
  const expenseEl = document.getElementById('statExpense');
  const incomeDeltaEl = document.getElementById('statIncomeDelta');
  const expenseDeltaEl = document.getElementById('statExpenseDelta');

  if (balanceEl) balanceEl.textContent = formatCurrency(balance);
  if (incomeEl) incomeEl.textContent = formatCurrency(income);
  if (expenseEl) expenseEl.textContent = formatCurrency(expense);

  if (incomeDeltaEl) {
    const d = deltaText(income, prev.income);
    incomeDeltaEl.textContent = d.text;
    incomeDeltaEl.className = `stat-card__meta ${d.cls}`;
  }
  if (expenseDeltaEl) {
    // For expenses, a rise is the "negative" direction and a drop is "positive" — invert the color logic.
    const d = deltaText(expense, prev.expense);
    expenseDeltaEl.textContent = d.text;
    const invertedCls = d.cls === 'stat-card__meta--positive' ? 'stat-card__meta--negative'
      : d.cls === 'stat-card__meta--negative' ? 'stat-card__meta--positive' : d.cls;
    expenseDeltaEl.className = `stat-card__meta ${invertedCls}`;
  }

  const saved = income - expense;
  const savingsEl = document.getElementById('statSavings');
  const savingsRateEl = document.getElementById('statSavingsRate');
  if (savingsEl) savingsEl.textContent = formatCurrency(saved);
  if (savingsRateEl) {
    const rate = income > 0 ? Math.round((saved / income) * 100) : 0;
    savingsRateEl.textContent = income > 0 ? `${rate}% of income` : 'Add income to see rate';
  }
}

export function renderCategoryList() {
  const categories = getCategoryBreakdown();
  const max = categories[0]?.amount || 1;
  const html = categories.length
    ? categories.slice(0, 5).map((c) => `
      <div class="category-row">
        <div class="category-row__info">
          <div class="category-row__top">
            <span class="category-row__name">${escapeHTML(c.category)}</span>
            <span class="category-row__amount">${formatCurrency(c.amount)}</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.round((c.amount / max) * 100)}%"></div></div>
        </div>
      </div>`).join('')
    : `<p class="empty-hint">No expenses this month yet.</p>`;
  // Dashboard: #categoryBreakdown — other pages may use #categoryList
  ['categoryBreakdown', 'categoryList'].forEach((id) => {
    const list = document.getElementById(id);
    if (list) list.innerHTML = html;
  });
}

export function renderBudgetGaugeText() {
  const usage = getMonthlyBudgetUsage();
  const percentEl = document.querySelector('.gauge__percent');
  const remainingEl = document.querySelector('.gauge__remaining');
  if (percentEl) percentEl.textContent = `${usage.percent}%`;
  if (remainingEl) remainingEl.textContent = `Remaining: ${formatCurrency(usage.remaining)}`;
  return usage;
}

export function renderBudgetPlanner() {
  const grid = document.getElementById('budgetGrid');
  if (!grid) return;
  const budgets = getBudgets();
  grid.innerHTML = budgets.length
    ? budgets.map((b) => {
        const badgeType = b.percent > 90 ? 'badge--danger' : b.percent > 75 ? 'badge--warning' : 'badge--success';
        const fillType = b.percent > 90 ? 'progress-fill--danger' : b.percent > 75 ? 'progress-fill--warning' : '';
        return `
        <div class="card" data-category="${escapeHTML(b.category)}">
          <div class="card__header">
            <span class="card__title">${escapeHTML(b.category)}</span>
            <span class="badge ${badgeType}">${b.percent}% used</span>
          </div>
          <div class="progress-track"><div class="progress-fill ${fillType}" style="width:${b.percent}%"></div></div>
          <p style="margin-top:var(--space-3); font-size:var(--text-sm); color:var(--color-text-secondary)">${formatCurrency(b.spent)} of ${formatCurrency(b.limit)} limit</p>
          <div style="display:flex; gap:var(--space-2); margin-top:var(--space-3)">
            <button class="btn btn-ghost btn-sm" data-action="edit-budget" data-category="${escapeHTML(b.category)}" data-limit="${b.limit}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-action="delete-budget" data-category="${escapeHTML(b.category)}" style="color:var(--color-danger)">Delete</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="card empty-state" style="grid-column:1/-1">
        <span class="empty-state__icon">${categoryIcon('Other')}</span>
        <strong>No budgets set yet</strong>
        <p style="font-size:var(--text-sm)">Tap "Set Limit Threshold" to create your first spending limit.</p>
      </div>`;
}

export function renderGoals() {
  const goals = getGoals();
  const dash = document.getElementById('dashboardGoals');
  const grid = document.getElementById('goalsGrid');
  if (!dash && !grid) return;

  if (!goals.length) {
    if (dash) dash.innerHTML = `<p class="empty-hint">Create a savings goal to track progress.</p>`;
    if (grid) {
      grid.innerHTML = `<div class="card empty-state" style="grid-column:1/-1">
        <span class="empty-state__icon">${categoryIcon('Other')}</span>
        <strong>No savings goals yet</strong>
        <p style="font-size:var(--text-sm)">Tap "+ New Goal" to set your first financial target.</p>
      </div>`;
    }
    return;
  }

  const compact = goals.slice(0, 3).map((g) => {
    const percent = Math.min(Math.round((g.saved / g.target) * 100), 100);
    return `
      <div class="goal-row">
        <div class="goal-row__top">
          <strong>${escapeHTML(g.name)}</strong>
          <span>${percent}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="goal-row__meta">${formatCurrency(g.saved)} / ${formatCurrency(g.target)}</div>
      </div>`;
  }).join('');

  const full = goals.map((g) => {
    const percent = Math.min(Math.round((g.saved / g.target) * 100), 100);
    const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'No deadline';
    return `
      <div class="card goal-card" data-id="${g.id}">
        <div class="goal-card__header">
          <span class="goal-card__title">${escapeHTML(g.name)}</span>
          <span class="goal-card__deadline">${deadline}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="goal-card__amounts">
          <span>${formatCurrency(g.saved)} saved</span>
          <span>Target: ${formatCurrency(g.target)}</span>
        </div>
        <div style="display:flex; gap:var(--space-2); margin-top:var(--space-3)">
          <button class="btn btn-ghost btn-sm" data-action="edit-goal" data-id="${g.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-goal" data-id="${g.id}" style="color:var(--color-danger)">Delete</button>
        </div>
      </div>`;
  }).join('');

  if (dash) dash.innerHTML = compact;
  if (grid) grid.innerHTML = full;
}

export function renderHealthScore() {
  const { score, label, message } = getFinancialHealthScore();
  const scoreEl = document.querySelector('#insights .stat-card__value--accent');
  const msgEl = document.querySelector('#insights .health-score__details p');
  if (scoreEl) scoreEl.textContent = `${score} / 100`;
  if (msgEl) msgEl.textContent = `${label} — ${message}`;
  return score;
}

export function renderInsights() {
  const insights = getInsights();
  const dash = document.getElementById('dashboardInsights');
  const grid = document.getElementById('insightsGrid');
  if (!dash && !grid) return;

  if (!insights.length) {
    const empty = `<p class="empty-hint">Tips appear as you add activity.</p>`;
    if (dash) dash.innerHTML = empty;
    if (grid) grid.innerHTML = empty;
    return;
  }

  const compact = insights.slice(0, 3).map((ins) => `
    <div class="insight-row">
      <span class="insight-row__icon">${icon(ins.icon, 16)}</span>
      <div>
        <strong>${escapeHTML(ins.title)}</strong>
        <p>${escapeHTML(ins.message)}</p>
      </div>
    </div>`).join('');

  const full = insights.map((ins) => `
    <div class="card insight-card">
      <div class="insight-card__icon">${icon(ins.icon, 18)}</div>
      <div class="insight-card__body">
        <strong>${escapeHTML(ins.title)}</strong>
        <p>${escapeHTML(ins.message)}</p>
      </div>
    </div>`).join('');

  if (dash) dash.innerHTML = compact;
  if (grid) grid.innerHTML = full;
}

export function renderCategoryLegend(scope = 'month') {
  const legend = document.getElementById('categoryLegend');
  if (!legend) return;
  const categories = getCategoryBreakdown(scope);
  const total = categories.reduce((s, c) => s + c.amount, 0);

  if (!categories.length) {
    legend.innerHTML = `<p style="color:var(--color-text-muted); font-size:var(--text-sm)">No expenses recorded yet.</p>`;
    return;
  }

  legend.innerHTML = categories.map((c, i) => `
    <div class="legend-row">
      <span class="legend-row__dot" style="background:${CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}"></span>
      <span class="legend-row__label">${escapeHTML(c.category)}</span>
      <span class="legend-row__amount">${formatCurrency(c.amount)}</span>
      <span class="legend-row__percent">${Math.round((c.amount / total) * 100)}%</span>
    </div>`).join('');
}

export function renderSettingsProfile() {
  const nameInput = document.getElementById('settingsNameInput');
  const emailInput = document.getElementById('settingsEmailInput');
  if (!nameInput && !emailInput) return;
  const user = getCurrentUser();
  if (!user) return;
  if (nameInput && !nameInput.dataset.touched && !nameInput.value) {
    nameInput.value = user.user_metadata?.name || '';
  }
  if (emailInput && !emailInput.dataset.touched && !emailInput.value) {
    emailInput.value = user.email || '';
  }
}

export function renderRecurringList() {
  const list = document.getElementById('recurringList');
  if (!list) return;
  const rules = getRecurring();

  if (!rules.length) {
    list.innerHTML = `<p style="font-size:var(--text-sm); color:var(--color-text-muted)">No recurring transactions set up.</p>`;
    return;
  }

  list.innerHTML = rules.map((r) => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding:var(--space-3) 0; border-top:1px solid var(--color-border);">
      <div style="min-width:0;">
        <strong style="display:block; font-size:var(--text-sm);">${escapeHTML(r.title)}</strong>
        <span style="font-size:var(--text-xs); color:var(--color-text-muted);">
          ${r.frequency === 'monthly' ? 'Monthly' : 'Weekly'} &middot; ${formatCurrency(r.amount)} &middot; next on ${formatDate(r.nextRunDate)}
        </span>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="delete-recurring" data-id="${r.id}" style="color:var(--color-danger); flex-shrink:0;">Delete</button>
    </div>`).join('');
}

/** Re-renders every data-driven part of the UI. Call after any state change. */
export function renderAll(activeFilter = 'all', txPage = 1) {
  updateDashboardGreeting();
  renderMonthlySummary();
  renderReminders();
  renderCategoryManager();
  renderStatCards();
  renderRecentTransactions(activeFilter);
  const clampedPage = renderAllTransactions(activeFilter, txPage);
  renderCategoryList();
  renderBudgetGaugeText();
  renderBudgetPlanner();
  renderGoals();
  renderHealthScore();
  renderInsights();
  renderCategoryLegend();
  renderSettingsProfile();
  renderRecurringList();
  renderNetWorth();
  renderAnalyticsExtra();
  renderOnboarding();
  return clampedPage;
}


export function renderNetWorth() {
  const nw = getNetWorth();
  const el = (id, val) => { const n = document.getElementById(id); if (n) n.textContent = formatCurrency(val); };
  el('statNetWorth', nw.netWorth);
  el('statAssets', nw.assets);
  el('statLiabilities', nw.liabilities);

  const safe = getSafeToSpend();
  const safeEl = document.getElementById('safeToSpendValue');
  const safeMeta = document.getElementById('safeToSpendMeta');
  if (safeEl) safeEl.textContent = formatCurrency(safe.safe);
  if (safeMeta) {
    safeMeta.textContent = safe.upcomingBills > 0
      ? `After near-term bills of ${formatCurrency(safe.upcomingBills)}. Monthly left: ${formatCurrency(safe.left)}.`
      : `Based on this month's activity. Cash left: ${formatCurrency(safe.left)}.`;
  }

  const rule = getFiftyThirtyTwenty();
  const ruleEl = document.getElementById('rule502030');
  if (ruleEl) {
    const row = (label, block, target) => `
      <div class="rule-row">
        <div class="rule-row__top"><span>${label} (target ${target}%)</span><span>${formatCurrency(block.amount)} · ${block.pct}%</span></div>
        <div class="progress-track"><div class="progress-fill ${block.pct > target + 5 ? 'progress-fill--danger' : ''}" style="width:${Math.min(block.pct, 100)}%"></div></div>
      </div>`;
    ruleEl.innerHTML = row('Needs', rule.needs, 50) + row('Wants', rule.wants, 30) + row('Savings', rule.savings, 20);
  }

  const accList = document.getElementById('accountsList');
  if (accList) {
    const accounts = getAccounts();
    accList.innerHTML = accounts.length ? accounts.map((a) => `
      <div class="list-row">
        <div>
          <strong>${escapeHTML(a.name)}</strong>
          <span class="badge badge--neutral" style="margin-left:8px">${a.kind}</span>
          <div style="font-size:var(--text-xs); color:var(--color-text-muted)">${formatCurrency(a.balance)}</div>
        </div>
        <div style="display:flex; gap:4px">
          <button class="btn btn-ghost btn-sm" data-action="edit-account" data-id="${a.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-account" data-id="${a.id}" style="color:var(--color-danger)">Delete</button>
        </div>
      </div>`).join('') : `<p style="font-size:var(--text-sm); color:var(--color-text-muted)">No accounts yet. Add bank/cash/investments to track net worth.</p>`;
  }

  const debtMethod = document.querySelector('#debtMethodTabs .tab.is-active')?.dataset?.method || 'avalanche';
  const debtsList = document.getElementById('debtsList');
  if (debtsList) {
    const debts = getDebtPayoffPlan(debtMethod);
    debtsList.innerHTML = debts.length ? debts.map((d) => `
      <div class="list-row">
        <div>
          <strong>#${d.priority} ${escapeHTML(d.name)}</strong>
          <div style="font-size:var(--text-xs); color:var(--color-text-muted)">${formatCurrency(d.balance)} · ${d.interestRate}% APR · min ${formatCurrency(d.minPayment)}</div>
        </div>
        <div style="display:flex; gap:4px">
          <button class="btn btn-ghost btn-sm" data-action="edit-debt" data-id="${d.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-debt" data-id="${d.id}" style="color:var(--color-danger)">Delete</button>
        </div>
      </div>`).join('') : `<p style="font-size:var(--text-sm); color:var(--color-text-muted)">No debts tracked. Add loans or credit cards to plan payoff.</p>`;
  }

  const bills = document.getElementById('upcomingBillsList');
  if (bills) {
    const list = getUpcomingBills(14);
    bills.innerHTML = list.length ? list.map((b) => `
      <div class="list-row">
        <div>
          <strong>${escapeHTML(b.title)}</strong>
          <div style="font-size:var(--text-xs); color:var(--color-text-muted)">${escapeHTML(b.category)} · due ${formatDate(b.due)} (${b.daysUntil}d)</div>
        </div>
        <span style="color:var(--color-danger)">${formatCurrency(b.amount)}</span>
      </div>`).join('') : `<p style="font-size:var(--text-sm); color:var(--color-text-muted)">No recurring bills due in the next 14 days.</p>`;
  }
}

export function renderAnalyticsExtra() {
  const cmp = getMonthComparison();
  const box = document.getElementById('monthCompare');
  if (box) {
    box.innerHTML = `
      <div class="compare-item"><span class="label">Income</span><strong>${formatCurrency(cmp.current.income)}</strong><span class="${cmp.incomeDelta >= 0 ? 'up' : 'down'}">${cmp.incomePct >= 0 ? '+' : ''}${cmp.incomePct}% vs last</span></div>
      <div class="compare-item"><span class="label">Expense</span><strong>${formatCurrency(cmp.current.expense)}</strong><span class="${cmp.expenseDelta <= 0 ? 'up' : 'down'}">${cmp.expensePct >= 0 ? '+' : ''}${cmp.expensePct}% vs last</span></div>
      <div class="compare-item"><span class="label">Last month income</span><strong>${formatCurrency(cmp.previous.income)}</strong></div>
      <div class="compare-item"><span class="label">Last month expense</span><strong>${formatCurrency(cmp.previous.expense)}</strong></div>`;
  }
  const subs = document.getElementById('subscriptionsList');
  if (subs) {
    const list = detectSubscriptions();
    subs.innerHTML = list.length ? list.map((s) => `
      <div class="list-row">
        <div>
          <strong>${escapeHTML(s.title)}</strong>
          <div style="font-size:var(--text-xs); color:var(--color-text-muted)">${s.cadence} · ${s.occurrences} times · last ${formatDate(s.lastDate)}</div>
        </div>
        <span>${formatCurrency(s.amount)}</span>
      </div>`).join('') : `<p style="font-size:var(--text-sm); color:var(--color-text-muted)">No subscription-like patterns yet. Add a few months of recurring expenses to detect them.</p>`;
  }
}


function updateDashboardGreeting() {
  const el = document.getElementById('dashGreeting');
  const sub = document.getElementById('dashboardSubtitle');
  if (!el && !sub) return;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (el) el.textContent = greet;
  if (sub) {
    const now = new Date();
    const month = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    sub.textContent = `${month} · overview of income, spending and goals.`;
  }
  const health = document.getElementById('dashHealthMini');
  if (health) {
    try {
      // soft label only if score function exists via insights path
      health.textContent = 'Cashora home';
    } catch (_) {}
  }
}



export function renderReminders() {
  const strip = document.getElementById('remindersStrip');
  if (!strip) return;
  const items = getReminders();
  if (!items.length) {
    strip.hidden = true;
    strip.innerHTML = '';
    return;
  }
  strip.hidden = false;
  strip.innerHTML = items.slice(0, 4).map((r) => `
    <div class="reminder-chip reminder-chip--${r.severity === 'danger' ? 'danger' : 'warning'}">
      <div>
        <strong>${escapeHTML(r.title)}</strong>
        <span>${escapeHTML(r.message)}</span>
      </div>
    </div>`).join('');
}

export function renderMonthlySummary() {
  const body = document.getElementById('monthSummaryBody');
  const labelEl = document.getElementById('monthSummaryLabel');
  if (!body) return;
  const s = getMonthlySummary();
  if (labelEl) labelEl.textContent = s.label;

  const delta = (pct, invert = false) => {
    if (pct == null) return '<span class="meta">vs last month</span>';
    const good = invert ? pct <= 0 : pct >= 0;
    const cls = good ? 'up' : 'down';
    const sign = pct > 0 ? '+' : '';
    return `<span class="meta ${cls}">${sign}${pct}% vs last month</span>`;
  };

  body.innerHTML = `
    <div class="month-summary__item">
      <span class="label">Income</span>
      <span class="value">${formatCurrency(s.income)}</span>
      ${delta(s.incomeDeltaPct)}
    </div>
    <div class="month-summary__item">
      <span class="label">Spent</span>
      <span class="value">${formatCurrency(s.expense)}</span>
      ${delta(s.expenseDeltaPct, true)}
    </div>
    <div class="month-summary__item">
      <span class="label">Saved</span>
      <span class="value">${formatCurrency(s.saved)}</span>
      <span class="meta">${s.savingsRate}% of income</span>
    </div>
    <div class="month-summary__item">
      <span class="label">Safe to spend</span>
      <span class="value">${formatCurrency(s.safeToSpend)}</span>
      <span class="meta">${s.topCategory ? `Top: ${escapeHTML(s.topCategory.category)}` : 'No expenses yet'}</span>
    </div>
    <div class="month-summary__foot" style="grid-column: 1 / -1">
      <span>${s.categoryCount} active spend categor${s.categoryCount === 1 ? 'y' : 'ies'} this month</span>
      <button type="button" class="btn btn-secondary btn-sm" data-action="copy-month-summary">Copy summary</button>
    </div>`;
}

export function renderCategoryManager() {
  const host = document.getElementById('categoryManagerList');
  if (!host) return;
  const base = new Set(['Food & Groceries', 'Transport', 'Bills & Utilities', 'Shopping', 'Entertainment', 'Health', 'Other', 'Income']);
  const custom = getCustomCategories();
  const all = getAllCategoryNames();
  const rows = all.map((name) => {
    const isCustom = custom.includes(name) || !base.has(name);
    const canRemove = custom.includes(name);
    return `
      <div class="cat-manager-row" data-category="${escapeHTML(name)}">
        <span>${escapeHTML(name)} ${canRemove ? '<span class="tag">custom</span>' : '<span class="tag">built-in</span>'}</span>
        ${canRemove ? `<button type="button" class="btn btn-danger-outline btn-sm" data-action="remove-custom-cat" data-name="${escapeHTML(name)}">Remove</button>` : ''}
      </div>`;
  }).join('');
  host.innerHTML = rows || `<p class="empty-hint">No categories yet.</p>`;
}

export function renderOnboarding() {
  const host = document.getElementById('onboardingChecklist');
  if (!host) return;
  const { steps, done, total, complete } = getOnboardingProgress();
  const empty = isAccountEmpty();

  // Always show demo card when account is empty; otherwise show checklist until complete
  if (complete && !empty) {
    host.style.display = 'none';
    return;
  }
  host.style.display = 'block';

  const demoBlock = empty ? `
    <div class="demo-banner">
      <div>
        <strong>Start exploring</strong>
        <p>Load sample numbers once to see charts and insights, then replace with your own from Settings.</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-action="load-demo">Load sample</button>
    </div>` : '';

  const checklist = complete ? '' : `
    <div class="card__header">
      <span class="card__title">Getting started</span>
      <span class="badge badge--neutral">${done}/${total}</span>
    </div>
    <ul class="onboard-list">
      ${steps.map((s) => `<li class="${s.done ? 'is-done' : ''}">${s.done ? '✓' : '○'} ${escapeHTML(s.label)}</li>`).join('')}
    </ul>`;

  host.innerHTML = `
    <div class="card" style="border-color: rgba(59,130,246,0.35)">
      ${demoBlock}
      ${checklist}
    </div>`;
}

