/* ==========================================================================
   Cashora — views/insights.js
   Returns the HTML template for the "Insights" view. Mounted into #pageRoot
   by router.js. Dynamic content inside is filled in by transactions.js
   render functions after mount (see app.js renderEverything()).
   ========================================================================== */

export function template() {
  return `
<section class="page-section" id="insights">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">Spending Insights & AI Tips</h2>
      <p class="page-section__subtitle">Smart automated analysis of your expense patterns.</p>
    </div>
  </div>

  <div class="card" style="margin-bottom:var(--space-5)">
    <div class="card__header"><span class="card__title">Financial Health Score</span></div>
    <div class="health-score">
      <div class="health-score__ring">
        <canvas id="healthScoreRing" aria-hidden="true"></canvas>
      </div>
      <div class="health-score__details">
        <div class="stat-card__value stat-card__value--accent" style="font-size:var(--text-2xl)">78 / 100</div>
        <p style="font-size:var(--text-sm); color:var(--color-text-secondary); margin-top:var(--space-1)">Good — your savings rate improved this month.</p>
      </div>
    </div>
  </div>

  <div class="grid-two" id="insightsGrid">
    <div class="card insight-card">
      <div class="insight-card__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8L12 3z"/></svg></div>
      <div class="insight-card__body">
        <strong>Dining spend is up 22%</strong>
        <p>You've spent more on food delivery this month compared to your 3-month average.</p>
      </div>
    </div>
  </div>
</section>`;
}
