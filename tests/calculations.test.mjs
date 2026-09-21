import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  futureValue,
  growthProjection,
  fireTarget,
  overviewTotals,
  portfolioBreakdown,
  shouldRegroupHoldingField,
  validateNumber,
} from '../calculations.js';

test('zero-rate growth is contributions plus lump sum', () => {
  assert.deepEqual(
    growthProjection({ initial: 1000, monthlyContribution: 100, annualReturn: 0, inflation: 0, years: 2 }),
    { months: 24, contributions: 3400, nominal: 3400, real: 3400, growth: 0 },
  );
});

test('future value combines lump sum and monthly DCA', () => {
  assert.ok(Math.abs(futureValue({ initial: 1000, monthlyContribution: 100, annualReturn: 0.12, years: 10 }) - 25298.85) < 0.2);
});

test('FIRE target uses annual spending divided by withdrawal rate', () => {
  assert.equal(fireTarget(48000, 0.04), 1200000);
});

test('overview totals separate savings and investments', () => {
  assert.deepEqual(overviewTotals([{ balance: 1000 }, { balance: 500 }], [{ value: 2000 }]), { savings: 1500, investments: 2000, total: 3500 });
});

test('number validation rejects negative and non-finite input', () => {
  assert.equal(validateNumber(-1, { min: 0 }).valid, false);
  assert.equal(validateNumber('not-a-number', { min: 0 }).valid, false);
});

test('portfolio breakdown groups positive values by asset class', () => {
  assert.deepEqual(portfolioBreakdown([
    { assetClass: 'ETF', value: 300 },
    { assetClass: 'ETF', value: 200 },
    { assetClass: 'Cash', value: 100 },
    { assetClass: 'Cash', value: -50 },
  ]), [
    { label: 'ETF', value: 500, share: 5 / 6 },
    { label: 'Cash', value: 100, share: 1 / 6 },
  ]);
});

test('holding text inputs only regroup after editing is committed', () => {
  assert.equal(shouldRegroupHoldingField('brokerage', 'input'), false);
  assert.equal(shouldRegroupHoldingField('assetClass', 'input'), false);
  assert.equal(shouldRegroupHoldingField('assetClass', 'change'), true);
  assert.equal(shouldRegroupHoldingField('value', 'change'), false);
});

test('Overview no longer renders the Money at work panel', () => {
  const overviewMarkup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(overviewMarkup.includes('Money at work'), false);
});
