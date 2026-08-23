/* ==========================================================================
   Cashora — views/budget.js
   Returns the HTML template for the "Budget" view. Mounted into #pageRoot
   by router.js. Dynamic content inside is filled in by transactions.js
   render functions after mount (see app.js renderEverything()).
   ========================================================================== */

export function template() {
  return `
<section class="page-section" id="budget">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">Monthly Budget Planner</h2>
      <p class="page-section__subtitle">Set spending limits and track thresholds by category.</p>
    </div>
    <button class="btn btn-primary btn-sm" data-action="add-budget">Set Limit Threshold</button>
  </div>
  <div class="grid-two" id="budgetGrid">
    <div class="card">
      <div class="card__header">
        <span class="card__title">Food & Groceries</span>
        <span class="badge badge--warning">76% used</span>
      </div>
      <div class="progress-track"><div class="progress-fill progress-fill--warning" style="width:76%"></div></div>
      <p style="margin-top:var(--space-3); font-size:var(--text-sm); color:var(--color-text-secondary)">&#8377;8,200 of &#8377;10,800 limit</p>
    </div>
  </div>
</section>`;
}
