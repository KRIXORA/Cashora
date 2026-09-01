/* ==========================================================================
   Cashora — views/dashboard.js  (primary home experience)
   ========================================================================== */

export function template() {
  return `
<section class="page-section dash" id="dashboard">
  <!-- Hero -->
  <header class="dash-hero">
    <div class="dash-hero__text">
      <p class="dash-hero__eyebrow" id="dashGreeting">Good day</p>
      <h1 class="dash-hero__title">Your money, at a glance</h1>
      <p class="dash-hero__sub" id="dashboardSubtitle">This month’s cash flow and priorities.</p>
    </div>
    <div class="dash-hero__aside">
      <div class="safe-chip safe-chip--hero" id="dashboardSafeChip" title="Safe to spend this month"></div>
      <div class="dash-hero__health" id="dashHealthMini" aria-label="Financial health"></div>
    </div>
  </header>

  <!-- One-tap actions -->
  <nav class="quick-actions" aria-label="Quick actions">
    <button type="button" class="quick-action" data-action="open-add" data-type="expense">
      <span class="quick-action__icon quick-action__icon--danger" aria-hidden="true">−</span>
      <span class="quick-action__label">Add expense</span>
    </button>
    <button type="button" class="quick-action" data-action="open-add" data-type="income">
      <span class="quick-action__icon quick-action__icon--success" aria-hidden="true">+</span>
      <span class="quick-action__label">Add income</span>
    </button>
    <a href="#budget" class="quick-action" data-route="budget">
      <span class="quick-action__icon quick-action__icon--accent" aria-hidden="true">%</span>
      <span class="quick-action__label">Budgets</span>
    </a>
    <a href="#goals" class="quick-action" data-route="goals">
      <span class="quick-action__icon quick-action__icon--accent" aria-hidden="true">◎</span>
      <span class="quick-action__label">Goals</span>
    </a>
  </nav>

  <div id="onboardingChecklist" class="dash-onboard"></div>

  <div class="reminders-strip" id="remindersStrip" hidden></div>

  <article class="card month-summary" id="monthlySummaryCard">
    <div class="card__header">
      <span class="card__title">This month</span>
      <span class="card__hint" id="monthSummaryLabel"></span>
    </div>
    <div class="month-summary__grid" id="monthSummaryBody">
      <p class="empty-hint">Loading summary…</p>
    </div>
  </article>


  <!-- KPI strip -->
  <div class="grid-stats">
    <article class="card stat-card stat-card--hero">
      <div class="stat-card__top">
        <span class="stat-card__label">Balance</span>
        <div class="stat-card__icon stat-card__icon--accent"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z"/><path d="M16 7V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2"/></svg></div>
      </div>
      <div class="stat-card__value stat-card__value--accent" id="statBalance">&#8377;0</div>
      <div class="stat-card__meta">Income − expenses (all time)</div>
    </article>

    <article class="card stat-card">
      <div class="stat-card__top">
        <span class="stat-card__label">Income · this month</span>
        <div class="stat-card__icon stat-card__icon--success"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg></div>
      </div>
      <div class="stat-card__value" id="statIncome">&#8377;0</div>
      <div class="stat-card__meta" id="statIncomeDelta"></div>
    </article>

    <article class="card stat-card">
      <div class="stat-card__top">
        <span class="stat-card__label">Spent · this month</span>
        <div class="stat-card__icon stat-card__icon--danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/></svg></div>
      </div>
      <div class="stat-card__value" id="statExpense">&#8377;0</div>
      <div class="stat-card__meta" id="statExpenseDelta"></div>
    </article>

    <article class="card stat-card">
      <div class="stat-card__top">
        <span class="stat-card__label">Saved · this month</span>
        <div class="stat-card__icon stat-card__icon--accent"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      </div>
      <div class="stat-card__value" id="statSavings">&#8377;0</div>
      <div class="stat-card__meta" id="statSavingsRate"></div>
    </article>
  </div>

  <!-- Charts row -->
  <div class="grid-two dash-charts">
    <article class="card chart-card">
      <div class="card__header">
        <span class="card__title">Cash flow · 6 months</span>
        <span class="card__hint">Income vs spend</span>
      </div>
      <div class="chart-card__canvas-wrap">
        <canvas id="cashFlowChart" role="img" aria-label="Cash flow chart"></canvas>
      </div>
    </article>

    <article class="card chart-card">
      <div class="card__header">
        <span class="card__title">Budget used</span>
        <span class="card__hint" id="budgetGaugeHint">This month</span>
      </div>
      <div class="gauge-wrap">
        <div class="gauge">
          <canvas id="budgetGauge" width="160" height="160" role="img" aria-label="Budget gauge"></canvas>
          <div class="gauge__value">
            <span class="gauge__percent" id="gaugePercent">0%</span>
            <span class="gauge__label">used</span>
          </div>
        </div>
        <p class="gauge__remaining" id="gaugeRemaining">Set budgets to track limits</p>
      </div>
    </article>
  </div>

  <!-- Categories + goals -->
  <div class="grid-two">
    <article class="card">
      <div class="card__header">
        <span class="card__title">Top spending</span>
        <a href="#transactions" class="card__link" data-route="transactions">See all</a>
      </div>
      <div class="category-list" id="categoryBreakdown">
        <p class="empty-hint">Expenses this month will show up here.</p>
      </div>
    </article>

    <article class="card">
      <div class="card__header">
        <span class="card__title">Goals</span>
        <a href="#goals" class="card__link" data-route="goals">Manage</a>
      </div>
      <div class="goal-list" id="dashboardGoals">
        <p class="empty-hint">Create a savings goal to track progress.</p>
      </div>
    </article>
  </div>

  <!-- Insights + recent -->
  <div class="grid-two">
    <article class="card">
      <div class="card__header">
        <span class="card__title">Insights</span>
        <a href="#insights" class="card__link" data-route="insights">More</a>
      </div>
      <div class="insight-list" id="dashboardInsights">
        <p class="empty-hint">Tips appear as you add activity.</p>
      </div>
    </article>

    <article class="card">
      <div class="card__header">
        <span class="card__title">Recent activity</span>
        <a href="#transactions" class="card__link" data-route="transactions">View ledger</a>
      </div>
      <div class="table-wrap">
        <table class="data-table" id="recentTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody id="recentTableBody">
            <tr><td colspan="4" class="empty-hint">No transactions yet.</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  </div>
</section>`;
}
