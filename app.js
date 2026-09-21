import { fireTarget, growthProjection, overviewTotals, portfolioBreakdown, shouldRegroupHoldingField, validateNumber } from './calculations.js';

const STORAGE_KEY = 'finfolio-state-v1';
const CPI_SOURCE_URL = 'https://tablebuilder.singstat.gov.sg/table/TS/M213752';

const DEFAULT_STATE = {
  profile: { name: '', currency: 'SGD', theme: 'dark' },
  accounts: [],
  holdings: [],
  portfolio: { collapsed: {} },
  growth: { initial: 0, monthlyContribution: 0, annualReturn: 0, inflation: 2.0, years: 20 },
  fire: { currentAge: 30, retirementAge: 50, annualSpending: 48000, investedAssets: 53380, annualReturn: 0.07, inflation: 0.025, withdrawalRate: 0.04, overviewGoal: 1200000 },
  cpi: { latestRate: null, latestPeriod: '', fetchedAt: '', source: CPI_SOURCE_URL, status: 'not-refreshed' },
};

let state = loadState();
let saveTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function mergeState(raw) {
  if (!raw || typeof raw !== 'object') return clone(DEFAULT_STATE);
  const result = clone(DEFAULT_STATE);
  if (raw.profile && typeof raw.profile === 'object') result.profile = { ...result.profile, ...raw.profile };
  if (Array.isArray(raw.accounts)) result.accounts = raw.accounts.filter((item) => item && typeof item === 'object').map((item) => ({ ...result.accounts[0], ...item, id: item.id || newId('account') }));
  if (Array.isArray(raw.holdings)) result.holdings = raw.holdings.filter((item) => item && typeof item === 'object').map((item) => ({ ...result.holdings[0], ...item, id: item.id || newId('holding') }));
  if (raw.portfolio && typeof raw.portfolio === 'object') result.portfolio = { ...result.portfolio, ...raw.portfolio, collapsed: { ...result.portfolio.collapsed, ...(raw.portfolio.collapsed || {}) } };
  if (raw.growth && typeof raw.growth === 'object') result.growth = { ...result.growth, ...raw.growth };
  if (raw.fire && typeof raw.fire === 'object') result.fire = { ...result.fire, ...raw.fire };
  if (raw.cpi && typeof raw.cpi === 'object') result.cpi = { ...result.cpi, ...raw.cpi };
  return result;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? mergeState(JSON.parse(saved)) : clone(DEFAULT_STATE);
  } catch {
    return clone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const stamp = new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(new Date());
    $('#save-status').textContent = `Saved locally at ${stamp}`;
  } catch {
    $('#save-status').textContent = 'Local save unavailable';
  }
}

function scheduleSave() {
  $('#save-status').textContent = 'Saving locally...';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveState, 300);
}

function formatMoney(value, digits = 0) {
  const number = Number(value) || 0;
  const sign = number < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat('en-SG', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(number));
  return `${sign}S$${formatted}`;
}

function formatPercent(decimal, digits = 1) {
  return `${((Number(decimal) || 0) * 100).toFixed(digits)}%`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element && document.activeElement !== element) element.value = value ?? '';
}

function setTheme() {
  document.documentElement.dataset.theme = state.profile.theme === 'light' ? 'light' : 'dark';
  $$('input[name="theme"]').forEach((input) => { input.checked = input.value === state.profile.theme; });
}

function setActiveTab(tabName) {
  $$('.tab-button').forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach((panel) => {
    const active = panel.dataset.panel === tabName;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function getFireTarget() {
  try {
    return fireTarget(Number(state.fire.annualSpending) || 0, Number(state.fire.withdrawalRate) || 0.04);
  } catch {
    return 0;
  }
}

function buildProjectionValues(initial, monthlyContribution, annualReturn, years) {
  const horizon = Math.max(0, Math.round(Number(years) || 0));
  return Array.from({ length: horizon + 1 }, (_, year) => growthProjection({ initial, monthlyContribution, annualReturn, inflation: 0, years: year }).nominal);
}

function renderChart(svg, values) {
  if (!svg) return;
  if (!values.length) { svg.innerHTML = ''; return; }
  const width = 640;
  const height = svg.classList.contains('tall-chart') ? 220 : 180;
  const pad = { top: 16, right: 12, bottom: 25, left: 10 };
  const max = Math.max(...values, 1);
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const points = values.map((value, index) => {
    const x = pad.left + (values.length === 1 ? 0 : (index / (values.length - 1)) * chartWidth);
    const y = pad.top + chartHeight - (value / max) * chartHeight;
    return [x, y];
  });
  const pointString = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${points[0][0]},${height - pad.bottom} ${pointString} ${points.at(-1)[0]},${height - pad.bottom}`;
  const gradientId = `${svg.id}-gradient`;
  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = pad.top + chartHeight * ratio;
    return `<line class="chart-gridline" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"></line>`;
  }).join('');
  const start = points[0];
  const end = points.at(-1);
  svg.innerHTML = `<defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)"></stop><stop offset="1" stop-color="var(--accent)" stop-opacity="0"></stop></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}" fill="url(#${gradientId})"></polygon><polyline class="chart-line" points="${pointString}"></polyline><circle class="chart-dot" cx="${start[0]}" cy="${start[1]}" r="5"></circle><circle class="chart-dot" cx="${end[0]}" cy="${end[1]}" r="5"></circle><text class="chart-label" x="${pad.left}" y="${height - 5}">Today</text><text class="chart-label" x="${width - pad.right - 36}" y="${height - 5}">Target</text>`;
}

function renderProfile() {
  setValue('profile-name', state.profile.name);
  $('#today-label').textContent = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
}

function renderAccountRows() {
  const container = $('#overview-accounts');
  if (!state.accounts.length) {
    container.innerHTML = '<div class="empty-state">No accounts yet. Add one above.</div>';
    return;
  }
  container.innerHTML = state.accounts.map((account) => `<div class="account-row" data-id="${escapeHTML(account.id)}"><div class="account-name"><input class="row-name-input" data-account-field="name" value="${escapeHTML(account.name)}" aria-label="Account name"></div><div class="input-suffix" data-suffix="S$"><input data-account-field="balance" type="number" min="0" step="100" value="${Number(account.balance) || 0}" aria-label="${escapeHTML(account.name)} balance"></div><div class="input-suffix" data-suffix="%"><input data-account-field="rate" type="number" min="0" step="0.1" value="${Number(account.rate) || 0}" aria-label="${escapeHTML(account.name)} interest rate"></div></div>`).join('');
}

function renderOverviewMetrics() {
  const totals = overviewTotals(state.accounts, state.holdings);
  const goal = getFireTarget() || Number(state.fire.overviewGoal) || 0;
  const progress = goal > 0 ? Math.min(100, (totals.total / goal) * 100) : 0;
  $('#metric-total').textContent = formatMoney(totals.total);
  $('#metric-savings').textContent = formatMoney(totals.savings);
  $('#metric-investments').textContent = formatMoney(totals.investments);
  $('#metric-savings-note').textContent = `Across ${state.accounts.length} accounts`;
  $('#metric-investments-note').textContent = `${state.holdings.length} holdings tracked`;
  $('#overview-goal-value').textContent = formatMoney(goal);
  $('#overview-goal-percent').textContent = `${Math.round(progress)}%`;
  $('#overview-goal-progress').style.width = `${progress}%`;
  $('#overview-goal-ring').style.background = `conic-gradient(var(--accent) ${progress * 3.6}deg, var(--panel-border) ${progress * 3.6}deg)`;
  $('#overview-goal-copy').textContent = goal > 0 ? `${formatMoney(Math.max(goal - totals.total, 0))} still to go from your current total.` : 'Set a target in the FIRE planner.';
  $('#overview-goal-badge').textContent = progress >= 100 ? 'Goal reached' : progress >= 50 ? 'On the way' : 'Planning';
  $('#overview-chart-now').textContent = formatMoney(totals.total, 0);
  const years = Math.max(0, (Number(state.fire.retirementAge) || 0) - (Number(state.fire.currentAge) || 0));
  const projection = buildProjectionValues(totals.total, state.growth.monthlyContribution, state.growth.annualReturn, years);
  $('#overview-chart-target').textContent = formatMoney(projection.at(-1) || totals.total, 0);
  renderChart($('#overview-chart'), projection);
}

function renderOverview() {
  renderProfile();
  renderAccountRows();
  renderOverviewMetrics();
}

function renderPortfolioSummary() {
  const total = state.holdings.reduce((sum, holding) => sum + Math.max(0, Number(holding.value) || 0), 0);
  const cost = state.holdings.reduce((sum, holding) => sum + Math.max(0, Number(holding.costBasis) || 0), 0);
  $('#portfolio-total').textContent = formatMoney(total);
  $('#portfolio-cost').textContent = formatMoney(cost);
  $('#portfolio-return').textContent = formatMoney(total - cost);
}

function updateAllocationCells() {
  const total = state.holdings.reduce((sum, holding) => sum + Math.max(0, Number(holding.value) || 0), 0);
  $$('#holdings-list tr').forEach((row) => {
    const holding = state.holdings.find((item) => item.id === row.dataset.id);
    const cell = row.children[6];
    if (holding && cell) cell.textContent = total > 0 ? `${((Number(holding.value) || 0) / total * 100).toFixed(1)}%` : '0.0%';
  });
}

function renderPortfolioRows() {
  const list = $('#holdings-list');
  $('#portfolio-empty').hidden = state.holdings.length !== 0;
  if (!state.holdings.length) { list.innerHTML = ''; return; }
  const total = state.holdings.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);
  const brokerageGroups = new Map();
  state.holdings.forEach((holding) => {
    const brokerage = String(holding.brokerage || 'Unassigned brokerage').trim() || 'Unassigned brokerage';
    if (!brokerageGroups.has(brokerage)) brokerageGroups.set(brokerage, []);
    brokerageGroups.get(brokerage).push(holding);
  });
  const rows = [];
  brokerageGroups.forEach((holdings, brokerage) => {
    const brokerageKey = `brokerage:${brokerage}`;
    const brokerageCollapsed = Boolean(state.portfolio.collapsed[brokerageKey]);
    const brokerageTotal = holdings.reduce((sum, holding) => sum + Math.max(0, Number(holding.value) || 0), 0);
    rows.push(`<tr class="group-row"><td colspan="8"><button class="group-toggle" type="button" data-group-toggle="${escapeHTML(brokerageKey)}" aria-expanded="${!brokerageCollapsed}"><span class="group-chevron">${brokerageCollapsed ? '+' : '-'}</span><span class="group-label"><small>Brokerage</small><strong>${escapeHTML(brokerage)}</strong></span><span class="group-total">${formatMoney(brokerageTotal)}</span></button></td></tr>`);
    if (brokerageCollapsed) return;
    const assetGroups = new Map();
    holdings.forEach((holding) => {
      const assetClass = String(holding.assetClass || 'Uncategorised asset class').trim() || 'Uncategorised asset class';
      if (!assetGroups.has(assetClass)) assetGroups.set(assetClass, []);
      assetGroups.get(assetClass).push(holding);
    });
    assetGroups.forEach((assetHoldings, assetClass) => {
      const assetKey = `asset:${brokerage}:${assetClass}`;
      const assetCollapsed = Boolean(state.portfolio.collapsed[assetKey]);
      const assetTotal = assetHoldings.reduce((sum, holding) => sum + Math.max(0, Number(holding.value) || 0), 0);
      rows.push(`<tr class="group-row asset-group-row"><td colspan="8"><button class="group-toggle asset-toggle" type="button" data-group-toggle="${escapeHTML(assetKey)}" aria-expanded="${!assetCollapsed}"><span class="group-chevron">${assetCollapsed ? '+' : '-'}</span><span class="group-label"><small>Asset class</small><strong>${escapeHTML(assetClass)}</strong></span><span class="group-total">${formatMoney(assetTotal)}</span></button></td></tr>`);
      if (assetCollapsed) return;
      assetHoldings.forEach((holding) => {
        const allocation = total > 0 ? `${((Number(holding.value) || 0) / total * 100).toFixed(1)}%` : '0.0%';
        rows.push(`<tr data-id="${escapeHTML(holding.id)}"><td><input class="wide-input" data-holding-field="brokerage" value="${escapeHTML(holding.brokerage)}" aria-label="Brokerage"></td><td><input class="wide-input" data-holding-field="assetClass" value="${escapeHTML(holding.assetClass)}" aria-label="Asset class"></td><td><input data-holding-field="ticker" value="${escapeHTML(holding.ticker)}" aria-label="Ticker symbol"></td><td><input data-holding-field="quantity" type="number" min="0" step="0.01" value="${Number(holding.quantity) || 0}" aria-label="Quantity"></td><td><input data-holding-field="value" type="number" min="0" step="100" value="${Number(holding.value) || 0}" aria-label="Total value"></td><td><input data-holding-field="costBasis" type="number" min="0" step="100" value="${Number(holding.costBasis) || 0}" aria-label="Cost basis"></td><td>${allocation}</td><td><button class="row-delete" type="button" data-action="delete-holding">Delete</button></td></tr>`);
      });
    });
  });
  list.innerHTML = rows.join('');
}

function renderPortfolioPie() {
  const breakdown = portfolioBreakdown(state.holdings);
  const svg = $('#portfolio-pie');
  const legend = $('#portfolio-legend');
  if (!breakdown.length || breakdown.every((item) => item.value === 0)) {
    svg.innerHTML = '<circle class="pie-base" cx="60" cy="60" r="42"></circle>';
    legend.innerHTML = '<div class="empty-state">Add values to see allocation.</div>';
    return;
  }
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const colors = ['#7880ff', '#3fc9c1', '#f3c36b', '#f28b9a', '#a88aff', '#74a5ff'];
  const segments = breakdown.map((item, index) => {
    const length = circumference * item.share;
    const segment = `<circle class="pie-segment" cx="60" cy="60" r="42" stroke="${colors[index % colors.length]}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"></circle>`;
    offset += length;
    return segment;
  }).join('');
  svg.innerHTML = `<circle class="pie-base" cx="60" cy="60" r="42"></circle>${segments}<text class="pie-center" x="60" y="57">${formatMoney(breakdown.reduce((sum, item) => sum + item.value, 0), 0)}</text><text class="pie-center-sub" x="60" y="68">total</text>`;
  legend.innerHTML = breakdown.map((item, index) => `<div class="legend-item"><span class="legend-swatch" style="--legend-color:${colors[index % colors.length]}"></span><span>${escapeHTML(item.label)}</span><strong>${(item.share * 100).toFixed(1)}%</strong></div>`).join('');
}

function renderPortfolio() {
  renderPortfolioRows();
  renderPortfolioSummary();
  renderPortfolioPie();
}

function syncGrowthInputs() {
  setValue('growth-initial', state.growth.initial);
  setValue('growth-monthly', state.growth.monthlyContribution);
  setValue('growth-return', ((Number(state.growth.annualReturn) || 0) * 100).toFixed(2));
  setValue('growth-inflation', ((Number(state.growth.inflation) || 0) * 100).toFixed(2));
  setValue('growth-years', state.growth.years);
}

function renderGrowth() {
  syncGrowthInputs();
  try {
    const result = growthProjection(state.growth);
    $('#growth-nominal').textContent = formatMoney(result.nominal);
    $('#growth-real').textContent = formatMoney(result.real);
    $('#growth-contributions').textContent = formatMoney(result.contributions);
    $('#growth-profit').textContent = formatMoney(result.growth);
    $('#growth-result-note').textContent = `At the end of ${result.months / 12} years`;
    renderChart($('#growth-chart'), buildProjectionValues(state.growth.initial, state.growth.monthlyContribution, state.growth.annualReturn, state.growth.years));
  } catch {
    $('#growth-nominal').textContent = 'Check inputs';
  }
  renderCpiInline();
}

function syncFireInputs() {
  setValue('fire-current-age', state.fire.currentAge);
  setValue('fire-retirement-age', state.fire.retirementAge);
  setValue('fire-spending', state.fire.annualSpending);
  setValue('fire-invested', state.fire.investedAssets);
  setValue('fire-return', ((Number(state.fire.annualReturn) || 0) * 100).toFixed(2));
  setValue('fire-inflation', ((Number(state.fire.inflation) || 0) * 100).toFixed(2));
  setValue('fire-withdrawal', ((Number(state.fire.withdrawalRate) || 0) * 100).toFixed(2));
}

function renderFire() {
  syncFireInputs();
  try {
    const target = getFireTarget();
    const invested = Math.max(0, Number(state.fire.investedAssets) || 0);
    const years = Math.max(0, (Number(state.fire.retirementAge) || 0) - (Number(state.fire.currentAge) || 0));
    $('#fire-target').textContent = formatMoney(target);
    $('#fire-current').textContent = formatMoney(invested);
    $('#fire-gap').textContent = formatMoney(Math.max(target - invested, 0));
    $('#fire-years').textContent = String(years);
    renderChart($('#fire-chart'), buildProjectionValues(invested, state.growth.monthlyContribution, state.fire.annualReturn, years));
  } catch {
    $('#fire-target').textContent = 'Check inputs';
  }
}

function renderCpiInline() {
  const rate = state.cpi.latestRate;
  $('#cpi-inline-value').textContent = Number.isFinite(rate) ? `${formatPercent(rate)} (${state.cpi.latestPeriod})` : 'Not refreshed';
  $('#cpi-inline-status').textContent = state.cpi.status === 'saved-fallback' ? 'Using last saved reference; refresh when online.' : state.cpi.status === 'available' ? 'Official SingStat reference loaded.' : 'Use the official reference as a guide, not a forecast.';
}

function renderSettings() {
  setTheme();
  const rate = state.cpi.latestRate;
  const status = Number.isFinite(rate) ? `${formatPercent(rate)} year-on-year reference for ${state.cpi.latestPeriod}. Last fetched ${state.cpi.fetchedAt || 'unknown'}.` : state.cpi.status === 'unavailable' ? 'Reference unavailable. The calculators remain usable.' : 'Not refreshed in this session.';
  $('#cpi-settings-status').textContent = status;
}

function renderAll() {
  setTheme();
  renderOverview();
  renderPortfolio();
  renderGrowth();
  renderFire();
  renderSettings();
}

function updatePercentField(target, key, input) {
  const result = validateNumber(input.value, { min: Number(input.min), max: Number(input.max) });
  target[key] = result.valid ? result.value / 100 : 0;
}

function handleGrowthInput(event) {
  const input = event.target.closest('[data-growth-field]');
  if (!input) return;
  const key = input.dataset.growthField;
  if (key === 'annualReturn' || key === 'inflation') updatePercentField(state.growth, key, input);
  else state.growth[key] = Math.max(0, Number(input.value) || 0);
  renderGrowth();
  renderOverviewMetrics();
  scheduleSave();
}

function handleFireInput(event) {
  const input = event.target.closest('[data-fire-field]');
  if (!input) return;
  const key = input.dataset.fireField;
  if (key === 'annualReturn' || key === 'inflation' || key === 'withdrawalRate') updatePercentField(state.fire, key, input);
  else state.fire[key] = Math.max(0, Number(input.value) || 0);
  renderFire();
  renderOverviewMetrics();
  scheduleSave();
}

function handleAccountInput(event) {
  const input = event.target.closest('[data-account-field]');
  const row = input?.closest('[data-id]');
  if (!input || !row) return;
  const account = state.accounts.find((item) => item.id === row.dataset.id);
  if (!account) return;
  const field = input.dataset.accountField;
  account[field] = field === 'name' ? input.value : Math.max(0, Number(input.value) || 0);
  renderOverviewMetrics();
  scheduleSave();
}

function handleHoldingInput(event) {
  const input = event.target.closest('[data-holding-field]');
  const row = input?.closest('[data-id]');
  if (!input || !row) return;
  const holding = state.holdings.find((item) => item.id === row.dataset.id);
  if (!holding) return;
  const field = input.dataset.holdingField;
  holding[field] = ['quantity', 'value', 'costBasis'].includes(field) ? Math.max(0, Number(input.value) || 0) : input.value;
  renderPortfolioSummary();
  renderOverviewMetrics();
  updateAllocationCells();
  renderPortfolioPie();
  scheduleSave();
}

function addAccount() {
  state.accounts.push({ id: newId('account'), name: 'New account', type: 'Savings', balance: 0, rate: 0 });
  renderOverview();
  scheduleSave();
}

function addHolding() {
  state.holdings.push({ id: newId('holding'), brokerage: 'Brokerage', assetClass: 'ETF', ticker: '', quantity: 0, value: 0, costBasis: 0, notes: '' });
  renderPortfolio();
  setActiveTab('portfolio');
  scheduleSave();
}

function deleteHolding(button) {
  const row = button.closest('[data-id]');
  if (!row || !window.confirm('Remove this holding from FinFolio?')) return;
  state.holdings = state.holdings.filter((item) => item.id !== row.dataset.id);
  renderPortfolio();
  renderOverviewMetrics();
  scheduleSave();
}

function applyFireGoal() {
  const target = getFireTarget();
  if (!target) return;
  state.fire.overviewGoal = target;
  renderOverviewMetrics();
  $('#save-status').textContent = 'Retirement goal applied locally';
  scheduleSave();
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `finfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importState(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !parsed.profile || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.holdings)) throw new Error('Invalid FinFolio backup');
    state = mergeState(parsed);
    renderAll();
    scheduleSave();
    $('#save-status').textContent = 'Imported and saved locally';
  } catch {
    $('#save-status').textContent = 'Import failed: choose a FinFolio JSON backup';
  }
}

function resetState() {
  if (!window.confirm('Reset all local FinFolio data? This cannot be undone unless you exported a backup.')) return;
  state = clone(DEFAULT_STATE);
  renderAll();
  scheduleSave();
}

function findCpiRows(payload) {
  const candidates = [payload?.Data?.row, payload?.Data?.rows, payload?.Data?.records, payload?.data?.row, payload?.row, payload?.rows].find(Array.isArray) || [];
  return candidates;
}

function parsePeriod(period) {
  const text = String(period || '').trim();
  let match = text.match(/^(\d{4})[- ](\d{1,2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  match = text.match(/^(\d{4})\s+([A-Za-z]{3,9})$/);
  if (match) return { year: Number(match[1]), month: new Date(`${match[2]} 1, 2000`).getMonth() + 1 };
  match = text.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (match) return { year: Number(match[2]), month: new Date(`${match[1]} 1, 2000`).getMonth() + 1 };
  return null;
}

function normalizeCpiResponse(payload) {
  const rows = findCpiRows(payload);
  const allItems = rows.find((row) => String(row.rowText || row.rowtext || row.name || row.label || '').toLowerCase().includes('all items')) || rows[0];
  const columns = allItems?.columns || allItems?.data || allItems?.values || [];
  const entries = columns.map((column) => ({ period: column.key || column.period || column.time, value: Number(column.value ?? column.val ?? column.index) })).filter((entry) => parsePeriod(entry.period) && Number.isFinite(entry.value));
  if (entries.length < 13) throw new Error('CPI series is incomplete');
  entries.sort((a, b) => { const ap = parsePeriod(a.period); const bp = parsePeriod(b.period); return new Date(ap.year, ap.month - 1) - new Date(bp.year, bp.month - 1); });
  const latest = entries.at(-1);
  const latestPeriod = parsePeriod(latest.period);
  const prior = entries.find((entry) => { const parsed = parsePeriod(entry.period); return parsed.year === latestPeriod.year - 1 && parsed.month === latestPeriod.month; });
  if (!prior || prior.value === 0) throw new Error('CPI comparison period is unavailable');
  return { latestRate: (latest.value / prior.value) - 1, latestPeriod: latest.period, fetchedAt: new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()), source: CPI_SOURCE_URL, status: 'available' };
}

async function refreshCpi() {
  $('#save-status').textContent = 'Refreshing official CPI reference...';
  try {
    const response = await fetch('/api/cpi', { cache: 'no-store' });
    if (!response.ok) throw new Error('CPI request failed');
    state.cpi = normalizeCpiResponse(await response.json());
    renderGrowth();
    renderSettings();
    scheduleSave();
    $('#save-status').textContent = 'Official CPI reference saved locally';
  } catch {
    state.cpi = { ...state.cpi, status: state.cpi.latestRate == null ? 'unavailable' : 'saved-fallback' };
    renderGrowth();
    renderSettings();
    $('#save-status').textContent = state.cpi.latestRate == null ? 'CPI unavailable; app remains usable' : 'Using saved CPI reference';
  }
}

function bindEvents() {
  $$('.tab-button').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  $$('[data-tab-target]').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget)));
  $('#theme-toggle').addEventListener('click', () => { state.profile.theme = state.profile.theme === 'dark' ? 'light' : 'dark'; setTheme(); scheduleSave(); });
  $$('input[name="theme"]').forEach((input) => input.addEventListener('change', () => { state.profile.theme = input.value; setTheme(); scheduleSave(); }));
  $('#profile-name').addEventListener('input', (event) => { state.profile.name = event.target.value; scheduleSave(); });
  $('#tab-growth').addEventListener('input', handleGrowthInput);
  $('#tab-fire').addEventListener('input', handleFireInput);
  $('#overview-accounts').addEventListener('input', handleAccountInput);
  $('#holdings-list').addEventListener('input', handleHoldingInput);
  $('#holdings-list').addEventListener('change', (event) => {
    const field = event.target.closest('[data-holding-field]')?.dataset.holdingField;
    if (shouldRegroupHoldingField(field, event.type)) renderPortfolioRows();
  });
  $('#apply-fire-goal').addEventListener('click', applyFireGoal);
  $('#import-file').addEventListener('change', (event) => importState(event.target.files?.[0]));
  document.addEventListener('click', (event) => {
    const groupToggle = event.target.closest('[data-group-toggle]');
    if (groupToggle) {
      const key = groupToggle.dataset.groupToggle;
      state.portfolio.collapsed[key] = !state.portfolio.collapsed[key];
      renderPortfolioRows();
      scheduleSave();
      return;
    }
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    if (action === 'add-account') addAccount();
    if (action === 'add-holding') addHolding();
    if (action === 'delete-holding') deleteHolding(actionElement);
    if (action === 'export') exportState();
    if (action === 'reset') resetState();
    if (action === 'refresh-cpi') refreshCpi();
  });
}

bindEvents();
renderAll();
