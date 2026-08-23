/* ==========================================================================
   Cashora — charts.js
   Lightweight canvas chart renderers. No external charting library —
   keeps the project dependency-free per the vanilla JS constraint.
   ========================================================================== */


/** Announce chart data to assistive tech via aria-label on the canvas. */
function setChartA11y(canvas, summary) {
  if (!canvas) return;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', summary);
}

/** Sets canvas backing resolution to match devicePixelRatio for crisp lines. */
function getChartMuted() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? '#64748b' : '#5B6478';
}
function getChartHole() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#0d1220';
}

function prepareCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

/** Draws a smooth line chart. points: [{ label, value }] */
export function drawLineChart(canvas, points, { color = '#3B82F6', fillColor = 'rgba(59,130,246,0.15)' } = {}) {
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!points.length) {
    ctx.fillStyle = getChartMuted();
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No activity in this period', width / 2, height / 2);
    setChartA11y(canvas, 'Cash flow chart: no activity in this period');
    return;
  }

  const isNarrow = width < 480;
  // Extra side padding so first/last date labels are not clipped
  const padding = { top: 14, right: isNarrow ? 18 : 16, bottom: isNarrow ? 34 : 30, left: isNarrow ? 18 : 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const stepX = chartW / (points.length - 1 || 1);
  const coords = points.map((p, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - ((p.value - min) / range) * chartH,
  }));

  // Filled area under line
  ctx.beginPath();
  ctx.moveTo(coords[0].x, padding.top + chartH);
  coords.forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.lineTo(coords[coords.length - 1].x, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Line
  ctx.beginPath();
  coords.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Points
  coords.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = getChartHole();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  });

  // X-axis labels — sparse, edge-aligned so nothing clips
  ctx.fillStyle = getChartMuted();
  ctx.font = isNarrow ? '10px Inter, system-ui, sans-serif' : '11px Inter, system-ui, sans-serif';
  const n = points.length;
  const maxLabels = isNarrow ? 4 : 6;
  const indices = [];
  if (n <= maxLabels) {
    for (let i = 0; i < n; i++) indices.push(i);
  } else {
    indices.push(0);
    const inner = maxLabels - 2;
    for (let k = 1; k <= inner; k++) {
      indices.push(Math.round((k * (n - 1)) / (inner + 1)));
    }
    indices.push(n - 1);
  }
  // unique sorted
  const uniq = [...new Set(indices)].sort((a, b) => a - b);
  const yLabel = height - (isNarrow ? 12 : 10);
  uniq.forEach((i, order) => {
    const text = points[i].label || '';
    let x = coords[i].x;
    if (order === 0) {
      ctx.textAlign = 'left';
      x = Math.max(4, coords[i].x);
    } else if (order === uniq.length - 1) {
      ctx.textAlign = 'right';
      x = Math.min(width - 4, coords[i].x);
    } else {
      ctx.textAlign = 'center';
    }
    ctx.fillText(text, x, yLabel);
  });
  const last = points[points.length - 1]?.value ?? 0;
  setChartA11y(canvas, `Cash flow chart with ${points.length} points. Latest value ${Math.round(last)}`);
}

/** Draws a circular gauge (0-100%). Used for the budget gauge. */
export function drawGauge(canvas, percent, { color = '#3B82F6', trackColor = 'rgba(255,255,255,0.08)' } = {}) {
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;
  const startAngle = 0.75 * Math.PI;
  const endAngle = 2.25 * Math.PI;
  const fullSweep = endAngle - startAngle;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Progress
  const clamped = Math.min(Math.max(percent, 0), 100);
  const progressAngle = startAngle + (fullSweep * clamped) / 100;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, progressAngle);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#60A5FA');
  gradient.addColorStop(1, color);
  ctx.strokeStyle = clamped > 90 ? '#EF4444' : clamped > 75 ? '#F59E0B' : gradient;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Shared category color palette — keep in sync between chart fills and legends. */
export const CATEGORY_PALETTE = ['#3B82F6', '#60A5FA', '#22C55E', '#F59E0B', '#EF4444', '#94A3B8', '#A78BFA', '#F472B6'];

/** Draws a donut chart. segments: [{ label, value, color }] */
export function drawDonut(canvas, segments) {
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!segments.length) {
    ctx.fillStyle = getChartMuted();
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No expenses yet', width / 2, height / 2);
    setChartA11y(canvas, 'Category breakdown: no expenses yet');
    return;
  }

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  let angle = -Math.PI / 2;

  segments.forEach((seg, i) => {
    const sweep = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = seg.color || CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    ctx.fill();
    angle += sweep;
  });

  // Punch the donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = getChartHole();
  ctx.fill();
  setChartA11y(canvas, `Category breakdown with ${segments.length} categories`);
}

/** Draws a simple progress ring (e.g. health score). */
export function drawRing(canvas, percent, { color = '#3B82F6' } = {}) {
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 6;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 8;
  ctx.stroke();

  const clamped = Math.min(Math.max(percent, 0), 100);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * clamped) / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();
}
