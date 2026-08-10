/* chart.js — 디자인 토큰을 사용하는 Chart.js 4 래퍼 */

import { clear, el } from '../core/dom.js';

const root = document.documentElement;
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();

export function seriesColors(n = 6) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const palette = Array.from({ length: 6 }, (_item, index) => token(`--c-series-${index + 1}`));
  return Array.from({ length: count }, (_item, index) => palette[index % palette.length]);
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const depthPlugin = {
  id: 'fabric-chart-depth',
  beforeDatasetDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = 'rgba(23,34,53,.16)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
  },
  afterDatasetDraw(chart) { chart.ctx.restore(); },
};

export function createChart(container, {
  type,
  labels,
  datasets,
  horizontal = false,
  stacked = false,
  height = 240,
}) {
  const chartEl = el('div.chart');
  chartEl.style.height = `${Math.max(1, Number(height) || 240)}px`;
  const canvas = el('canvas');
  chartEl.append(canvas);
  container.append(chartEl);

  let currentLabels = Array.isArray(labels) ? labels : [];
  let currentDatasets = Array.isArray(datasets) ? datasets : [];
  let chart = null;
  let timer = null;
  let attempts = 0;
  let destroyed = false;

  function colorizedDatasets() {
    const colors = seriesColors(Math.max(6, currentDatasets.length));
    return currentDatasets.map((dataset, index) => {
      if (type === 'doughnut') {
        const segmentColors = currentLabels.map((_label, segmentIndex) =>
          colors[(index + segmentIndex) % colors.length]);
        return { ...dataset, backgroundColor: segmentColors, borderColor: token('--c-paper') };
      }
      return {
        ...dataset,
        backgroundColor: colors[index],
        borderColor: colors[index],
        borderWidth: type === 'line' ? 3 : 1,
        borderRadius: type === 'bar' ? 8 : undefined,
        borderSkipped: false,
        pointRadius: type === 'line' ? 3 : undefined,
        pointHoverRadius: type === 'line' ? 6 : undefined,
        tension: type === 'line' ? 0.38 : dataset.tension,
        fill: type === 'line' ? true : dataset.fill,
      };
    });
  }

  function options() {
    const ink = token('--c-ink-2');
    const line = token('--c-line');
    const config = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      animation: reducedMotion() ? false : undefined,
      plugins: {
        legend: {
          display: currentDatasets.length >= 2,
          labels: { color: ink },
        },
        tooltip: { enabled: true },
      },
      elements: {
        line: { capBezierPoints: true },
      },
    };

    if (type !== 'doughnut') {
      config.scales = {
        x: {
          stacked,
          ticks: { color: ink },
          grid: { color: line },
          border: { color: line },
        },
        y: {
          stacked,
          ticks: { color: ink },
          grid: { color: line },
          border: { color: line },
        },
      };
    }
    return config;
  }

  function refreshTheme() {
    if (!chart || destroyed) return;
    chart.data.datasets = colorizedDatasets();
    chart.options = options();
    chart.update();
  }

  const observer = new MutationObserver(refreshTheme);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  function showLoadError() {
    if (destroyed) return;
    clear(chartEl).append(el('p.chart__error', { text: '차트를 불러오지 못했습니다' }));
  }

  function initialize() {
    if (destroyed) return;
    if (typeof globalThis.Chart !== 'function') {
      if (attempts >= 10) {
        timer = null;
        showLoadError();
        return;
      }
      attempts += 1;
      timer = window.setTimeout(initialize, 300);
      return;
    }

    timer = null;
    chart = new globalThis.Chart(canvas, {
      type,
      data: { labels: currentLabels, datasets: colorizedDatasets() },
      options: options(),
      plugins: [depthPlugin],
    });
  }

  initialize();

  return {
    el: chartEl,
    update(next = {}) {
      if (Array.isArray(next.labels)) currentLabels = next.labels;
      if (Array.isArray(next.datasets)) currentDatasets = next.datasets;
      if (!chart || destroyed) return;
      chart.data.labels = currentLabels;
      chart.data.datasets = colorizedDatasets();
      chart.options.plugins.legend.display = currentDatasets.length >= 2;
      chart.update();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
      if (chart) chart.destroy();
      chart = null;
    },
  };
}
