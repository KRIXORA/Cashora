export function template() {
  return `
<section class="page-section" id="analytics">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">Deep Analytics</h2>
      <p class="page-section__subtitle">Category mix, month comparison, and subscription detection.</p>
    </div>
  </div>

  <div class="grid-two">
    <div class="card">
      <div class="card__header"><span class="card__title">This Month vs Last Month</span></div>
      <div id="monthCompare" class="compare-grid"></div>
    </div>
    <div class="card">
      <div class="card__header"><span class="card__title">Detected Subscriptions</span></div>
      <div id="subscriptionsList"></div>
    </div>
  </div>

  <div class="card" style="margin-top:var(--space-5)">
    <div class="card__header">
      <span class="card__title">Expense Breakdown by Category</span>
      <div class="tab-group" id="analyticsScopeTabs">
        <span class="tab is-active">This Month</span>
        <span class="tab">All Time</span>
      </div>
    </div>
    <div class="chart-card__canvas-wrap chart-card__canvas-wrap--donut">
      <canvas id="categoryPieChart" aria-hidden="true"></canvas>
    </div>
    <div class="legend-list" id="categoryLegend"></div>
  </div>
</section>`;
}
