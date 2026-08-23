/* ==========================================================================
   Cashora — views/goals.js
   Returns the HTML template for the "Goals" view. Mounted into #pageRoot
   by router.js. Dynamic content inside is filled in by transactions.js
   render functions after mount (see app.js renderEverything()).
   ========================================================================== */

export function template() {
  return `
<section class="page-section" id="goals">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">Savings Goals</h2>
      <p class="page-section__subtitle">Track your financial targets and milestones.</p>
    </div>
    <button class="btn btn-primary btn-sm" data-action="add-goal">+ New Goal</button>
  </div>
  <div class="grid-two" id="goalsGrid">
    <div class="card goal-card">
      <div class="goal-card__header">
        <span class="goal-card__title">Emergency Fund</span>
        <span class="goal-card__deadline">Dec 2026</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:58%"></div></div>
      <div class="goal-card__amounts">
        <span>&#8377;58,000 saved</span>
        <span>Target: &#8377;1,00,000</span>
      </div>
    </div>
  </div>
</section>`;
}
