function finiteNumber(value, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, label) {
  const number = finiteNumber(value, NaN);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be a non-negative number`);
  return number;
}

export function monthlyRate(annualReturn) {
  const rate = finiteNumber(annualReturn, NaN);
  if (!Number.isFinite(rate) || rate <= -1) throw new RangeError('annualReturn must be greater than -100%');
  return Math.pow(1 + rate, 1 / 12) - 1;
}

export function futureValue({ initial = 0, monthlyContribution = 0, annualReturn = 0, years = 0 }) {
  const principal = nonNegative(initial, 'initial');
  const contribution = nonNegative(monthlyContribution, 'monthlyContribution');
  const horizon = nonNegative(years, 'years');
  const months = Math.round(horizon * 12);
  const rate = monthlyRate(annualReturn);
  const growthFactor = Math.pow(1 + rate, months);
  const dcaFutureValue = rate === 0 ? contribution * months : contribution * ((growthFactor - 1) / rate);
  return principal * growthFactor + dcaFutureValue;
}

export function growthProjection({ initial = 0, monthlyContribution = 0, annualReturn = 0, inflation = 0, years = 0 }) {
  const principal = nonNegative(initial, 'initial');
  const contribution = nonNegative(monthlyContribution, 'monthlyContribution');
  const horizon = nonNegative(years, 'years');
  const inflationRate = nonNegative(inflation, 'inflation');
  const months = Math.round(horizon * 12);
  const nominal = futureValue({ initial: principal, monthlyContribution: contribution, annualReturn, years: horizon });
  const contributions = principal + contribution * months;
  const real = nominal / Math.pow(1 + inflationRate, horizon);
  return {
    months,
    contributions,
    nominal,
    real,
    growth: nominal - contributions,
  };
}

export function fireTarget(annualSpending, withdrawalRate = 0.04) {
  const spending = nonNegative(annualSpending, 'annualSpending');
  const rate = finiteNumber(withdrawalRate, NaN);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) throw new RangeError('withdrawalRate must be between 0 and 100%');
  return spending / rate;
}

export function overviewTotals(accounts = [], holdings = []) {
  const savings = accounts.reduce((total, account) => total + Math.max(0, finiteNumber(account?.balance)), 0);
  const investments = holdings.reduce((total, holding) => total + Math.max(0, finiteNumber(holding?.value)), 0);
  return { savings, investments, total: savings + investments };
}

export function portfolioBreakdown(holdings = [], field = 'assetClass') {
  const totals = new Map();
  holdings.forEach((holding) => {
    const value = Math.max(0, finiteNumber(holding?.value));
    const label = String(holding?.[field] || 'Uncategorised').trim() || 'Uncategorised';
    totals.set(label, (totals.get(label) || 0) + value);
  });
  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(totals, ([label, value]) => ({ label, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function shouldRegroupHoldingField(field, eventType) {
  return ['brokerage', 'assetClass'].includes(field) && eventType === 'change';
}

export function validateNumber(value, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) return { valid: false, value: null, error: 'Enter a valid number.' };
  if (number < min) return { valid: false, value: number, error: `Enter a value of at least ${min}.` };
  if (number > max) return { valid: false, value: number, error: `Enter a value no greater than ${max}.` };
  if (integer && !Number.isInteger(number)) return { valid: false, value: number, error: 'Enter a whole number.' };
  return { valid: true, value: number, error: '' };
}
