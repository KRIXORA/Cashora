/* ==========================================================================
   Cashora — router.js
   Tiny hash-based router. Each nav item (#dashboard, #transactions, ...)
   maps to a view module in js/views/. On navigation it swaps the HTML
   inside #pageRoot and notifies app.js so it can re-populate the newly
   mounted DOM with live data (charts, tables, totals).

   This is what replaces the old "everything lives on one page" markup —
   only the active view's HTML exists in the DOM at any time.
   ========================================================================== */

import { template as dashboardView } from './views/dashboard.js';
import { template as transactionsView } from './views/transactions.js';
import { template as budgetView } from './views/budget.js';
import { template as goalsView } from './views/goals.js';
import { template as insightsView } from './views/insights.js';
import { template as analyticsView } from './views/analytics.js';
import { template as settingsView } from './views/settings.js';
import { template as networthView } from './views/networth.js';

const routes = {
  dashboard: dashboardView,
  transactions: transactionsView,
  budget: budgetView,
  goals: goalsView,
  insights: insightsView,
  analytics: analyticsView,
  settings: settingsView,
  networth: networthView,
};

const DEFAULT_ROUTE = 'dashboard';

let onRouteChange = null;
let root = null;

/** app.js registers a callback that re-renders data into the freshly mounted view. */
export function setOnRouteChange(fn) {
  onRouteChange = fn;
}

function resolveRoute() {
  const hash = (window.location.hash || `#${DEFAULT_ROUTE}`).replace('#', '');
  return routes[hash] ? hash : DEFAULT_ROUTE;
}

function setActiveNavLink(route) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('href') === `#${route}`);
  });
}

function renderRoute() {
  const route = resolveRoute();
  root.innerHTML = routes[route]();
  setActiveNavLink(route);
  window.scrollTo({ top: 0 });
  onRouteChange?.(route);
}

/** Call once at boot, after the auth guard passes. */
export function initRouter() {
  root = document.getElementById('pageRoot');
  if (!root) {
    console.error('router.js: #pageRoot not found in index.html');
    return;
  }
  window.addEventListener('hashchange', renderRoute);
  renderRoute(); // unknown/missing hash falls back to DEFAULT_ROUTE inside resolveRoute()
}

/** Programmatic navigation, e.g. after login or from a button instead of a link. */
export function navigate(route) {
  if (!routes[route]) route = DEFAULT_ROUTE;
  if (window.location.hash === `#${route}`) {
    renderRoute();
  } else {
    window.location.hash = route;
  }
}
