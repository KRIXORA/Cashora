/* ==========================================================================
   Cashora — views/networth.js
   Net worth, accounts, debts, safe-to-spend, 50/30/20
   ========================================================================== */

export function template() {
  return `
<section class="page-section" id="networth">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">Net Worth & Planning</h2>
      <p class="page-section__subtitle">Assets, liabilities, safe-to-spend, and the 50/30/20 rule.</p>
    </div>
    <div class="page-section__actions">
      <button class="btn btn-secondary btn-sm" data-action="add-account">+ Account</button>
      <button class="btn btn-primary btn-sm" data-action="add-debt">+ Debt</button>
    </div>
  </div>

  <div class="grid-stats" id="networthStats">
    <div class="card stat-card">
      <div class="stat-card__top"><span class="stat-card__label">Net Worth</span></div>
      <div class="stat-card__value stat-card__value--accent" id="statNetWorth">₹0</div>
      <div class="stat-card__meta">Assets − liabilities</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__top"><span class="stat-card__label">Assets</span></div>
      <div class="stat-card__value" id="statAssets" style="color:var(--color-success)">₹0</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__top"><span class="stat-card__label">Liabilities</span></div>
      <div class="stat-card__value" id="statLiabilities" style="color:var(--color-danger)">₹0</div>
    </div>
  </div>

  <div class="grid-two" style="margin-top:var(--space-5)">
    <div class="card">
      <div class="card__header"><span class="card__title">Safe to Spend</span></div>
      <div class="stat-card__value stat-card__value--accent" id="safeToSpendValue">₹0</div>
      <p id="safeToSpendMeta" style="margin-top:var(--space-2); font-size:var(--text-sm); color:var(--color-text-secondary)"></p>
    </div>
    <div class="card">
      <div class="card__header"><span class="card__title">50 / 30 / 20 This Month</span></div>
      <div id="rule502030" class="rule-bars"></div>
    </div>
  </div>

  <div class="grid-two" style="margin-top:var(--space-5)">
    <div class="card">
      <div class="card__header"><span class="card__title">Accounts</span></div>
      <div id="accountsList"></div>
    </div>
    <div class="card">
      <div class="card__header">
        <span class="card__title">Debts</span>
        <div class="tab-group" id="debtMethodTabs">
          <span class="tab is-active" data-method="avalanche">Avalanche</span>
          <span class="tab" data-method="snowball">Snowball</span>
        </div>
      </div>
      <div id="debtsList"></div>
    </div>
  </div>

  <div class="card" style="margin-top:var(--space-5)">
    <div class="card__header"><span class="card__title">Upcoming Bills (14 days)</span></div>
    <div id="upcomingBillsList"></div>
  </div>
</section>`;
}
