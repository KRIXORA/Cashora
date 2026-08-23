/* ==========================================================================
   Cashora — utils.js
   Shared formatters and small helpers.
   ========================================================================== */

import { icon } from './icons.js';
import { APP_CONFIG } from './config.js';

/** Format a number as currency using APP_CONFIG (default INR). */
export function formatCurrency(amount, { showSign = false } = {}) {
  const value = Math.abs(amount);
  const formatted = new Intl.NumberFormat(APP_CONFIG.locale, {
    style: 'currency',
    currency: APP_CONFIG.currency,
    maximumFractionDigits: 0,
  }).format(value);

  if (!showSign) return formatted;
  return amount < 0 ? `−${formatted}` : `+${formatted}`;
}

/** Format an ISO date string as "Aug 14" */
export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(APP_CONFIG.locale, { month: 'short', day: 'numeric' });
}

/** Format an ISO date string as "14 Aug 2026" */
export function formatDateLong(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(APP_CONFIG.locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Generate a short unique id */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Clamp a number between min and max */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Map a category name to an SVG icon key (fallback: 'package') */
const CATEGORY_ICON_KEYS = {
  'Food & Groceries': 'cart',
  'Transport': 'car',
  'Entertainment': 'film',
  'Income': 'briefcase',
  'Bills & Utilities': 'zap',
  'Shopping': 'bag',
  'Health': 'pill',
  'Other': 'package',
};
export function categoryIcon(category) {
  return icon(CATEGORY_ICON_KEYS[category] || 'package', 18);
}

/** Escape HTML special characters — always use before inserting user text into innerHTML. */
export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/** Show a transient toast notification. type: 'success' | 'error' | 'info' */
/**
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 * @param {number} duration
 * @param {{ label: string, onClick: () => void } | null} action  optional undo / CTA
 */
export function showToast(message, type = 'info', duration = 3500, action = null) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const msg = document.createElement('span');
  msg.className = 'toast__msg';
  msg.textContent = message;
  toast.appendChild(msg);

  if (action && action.label && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      try { action.onClick(); } catch (_) {}
      toast.remove();
    });
    toast.appendChild(btn);
    duration = Math.max(duration, 6000);
  }

  stack.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/** Reusable empty-state HTML */
export function emptyState({ title, body, actionLabel, actionAttrs = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">◇</div>
      <p class="empty-state__title">${title}</p>
      ${body ? `<p class="empty-state__body">${body}</p>` : ''}
      ${actionLabel ? `<button type="button" class="btn btn-primary btn-sm" ${actionAttrs}>${actionLabel}</button>` : ''}
    </div>`;
}

/** Debounce a function call */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Simple client-side write cooldown to blunt accidental double-submits. */
const _lastWrite = new Map();
export function assertWriteAllowed(key, cooldownMs = APP_CONFIG.writeCooldownMs) {
  const now = Date.now();
  const prev = _lastWrite.get(key) || 0;
  if (now - prev < cooldownMs) {
    throw new Error('Please wait a moment before trying again.');
  }
  _lastWrite.set(key, now);
}

/** Register the service worker (no-ops on unsupported browsers / non-HTTPS local). */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[Cashora] Service worker registration failed:', err.message);
    return null;
  }
}

/** Wire online/offline banner. */
export function initConnectivityBanner() {
  let banner = document.getElementById('offlineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.className = 'offline-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = 'You are offline. Changes will sync when you reconnect.';
    document.body.prepend(banner);
  }
  const sync = () => {
    banner.classList.toggle('is-visible', !navigator.onLine);
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
