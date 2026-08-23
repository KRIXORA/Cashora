/* ==========================================================================
   Cashora — views/transactions.js
   ========================================================================== */

export function template() {
  return `
<section class="page-section" id="transactions">
  <div class="page-section__header">
    <div>
      <h2 class="page-section__title">All Transactions</h2>
      <p class="page-section__subtitle">Complete history of your income and expenses.</p>
    </div>
    <div class="page-section__actions">
      <button class="btn btn-secondary btn-sm" data-action="reset-filters">Reset</button>
      <button class="btn btn-primary btn-sm" data-action="add-transaction">+ Add New</button>
    </div>
  </div>
  <div class="card">
    <div class="card__header">
      <span class="card__title">History</span>
      <div class="tab-group" id="txFilterTabs">
        <span class="tab is-active">All</span>
        <span class="tab">Income</span>
        <span class="tab">Expense</span>
      </div>
    </div>
    <table class="table">
      <thead>
        <tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th><th>Actions</th></tr>
      </thead>
      <tbody id="allTransactionsBody">
        <tr>
          <td colspan="5" style="text-align:center; color:var(--color-text-muted); padding: var(--space-6)">Loading…</td>
        </tr>
      </tbody>
    </table>
    <div class="pagination" id="txPagination"></div>
  </div>
</section>`;
}
