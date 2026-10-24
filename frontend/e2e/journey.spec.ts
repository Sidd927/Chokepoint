import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const step = (page: Page, name: string) => page.getByRole('button', {name, exact: true});
const open = async (page: Page, scenario: 'Demo' | 'Canonical') => {
  await page.goto('/');
  await page.getByTestId('scenario-card').filter({hasText: scenario}).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
};
const compute = async (page: Page) => {
  await step(page, 'Plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('solver-status')).toHaveText('OPTIMAL');
};
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('startup shows live backend status and both synthetic scenarios with real counts', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Backend online');
  await expect(page.getByTestId('scenario-card')).toHaveCount(2);
  await expect(page.getByTestId('scenario-card').filter({hasText: 'Demo'})).toContainText('19');
  await expect(page.getByTestId('scenario-card').filter({hasText: 'Canonical'})).toContainText('catalogue actions');
});

test('demo_city: inspect, graph controls, plan, verify, compare, receipt and real download', async ({page}) => {
  await open(page, 'Demo');
  await expect(page.getByText('3 of 3 critical targets are reachable')).toBeVisible();

  // graph controls and layers
  for (const name of ['Fit', 'Zoom in', 'Zoom out', 'Reset']) await page.getByRole('button', {name, exact: true}).click();
  await page.getByTestId('layer-permissions').check(); await page.getByTestId('layer-permissions').uncheck();
  await page.getByText('Accessible graph table').click();
  await page.getByRole('button', {name: 'Municipal API', exact: true}).click();
  await expect(page.getByTestId('selection-detail')).toContainText('Municipal API');

  // plan
  await compute(page);
  await expect(page.getByTestId('plan-cost')).toHaveText('105 dh');
  await expect(page.getByTestId('action-row')).toHaveCount(5);
  await page.getByTestId('action-row').first().locator('summary').click();
  await expect(page.getByTestId('action-row').first()).toContainText('modelled attack connections');
  await expect(page.getByText('Independent verifier: VERIFIED')).toBeVisible();
  await expect(page.getByRole('button', {name: 'After'})).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: 'Before', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Attack surface today'})).toBeVisible();
  await page.getByRole('button', {name: 'After', exact: true}).click();

  // verify: invalid input, wrong claim, correct claim
  await step(page, 'Verify').click();
  await page.getByLabel('Claimed total cost').fill('not-a-cost');
  await page.getByTestId('verify-run').click();
  await expect(page.getByRole('alert')).toContainText('Claimed cost');
  await page.getByLabel('Claimed total cost').fill('999999');
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-verdict')).toContainText('REJECTED');
  await expect(page.getByTestId('verify-verdict')).toContainText('Claimed cost is correct');
  await page.getByLabel('Claimed total cost').fill('');
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-verdict')).toContainText('VERIFIED');

  // compare
  await step(page, 'Compare').click();
  await expect(page.getByTestId('compare-before')).toContainText('3');
  await expect(page.getByTestId('compare-after')).toContainText('0');
  await expect(page.getByText('5/5 still permitted')).toBeVisible();

  // receipt: digest, download equals displayed JSON, re-verify
  await step(page, 'Receipt').click();
  const digest = (await page.getByTestId('receipt-digest').textContent())!;
  expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  await page.getByText('Full receipt JSON').click();
  const shown = JSON.parse((await page.getByTestId('receipt-json').textContent())!);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('receipt-download').click()]);
  expect(download.suggestedFilename()).toMatch(/^chokepoint-demo_city-[0-9a-f]{8}\.receipt\.json$/);
  const saved = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(saved).toEqual(shown);
  expect(saved.receipt_fingerprint).toBe(digest);
  expect(saved.action_ids).toEqual(['D01', 'D03', 'D08', 'D09', 'D10']);
  await page.getByTestId('receipt-reverify').click();
  await expect(page.getByTestId('receipt-integrity')).toContainText('Receipt fingerprint matches');
});

test('scenario switching never shows another scenario\'s results; canonical_city plans to 200 dh', async ({page}) => {
  await open(page, 'Demo');
  await compute(page);
  await expect(page.getByTestId('plan-cost')).toHaveText('105 dh');
  await page.getByLabel('Scenario', {exact: true}).selectOption('canonical_city');
  await expect(page.getByRole('heading', {name: 'Canonical City (synthetic)', level: 1})).toBeVisible();
  await expect(page.getByTestId('solver-status')).toHaveCount(0);
  await step(page, 'Receipt').click();
  await expect(page.getByText('No receipt yet')).toBeVisible();
  await compute(page);
  await expect(page.getByTestId('plan-cost')).toHaveText('200 dh');
  await expect(page.getByTestId('action-row')).toHaveCount(4);
  await step(page, 'Receipt').click();
  await expect(page.getByTestId('receipt-digest')).toBeVisible();
  await expect(page.getByText('A01, A02, A03, A04')).toBeVisible();
});

test('an incomplete plan is rejected and a stale verification disappears when the selection changes', async ({page}) => {
  await open(page, 'Canonical');
  await compute(page);
  await step(page, 'Verify').click();
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-verdict')).toContainText('VERIFIED');
  await page.getByTestId('check-row').first().uncheck();
  await expect(page.getByTestId('verify-verdict')).toHaveCount(0);
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-verdict')).toContainText('REJECTED');
  await expect(page.getByTestId('verify-verdict')).toContainText('Mandatory actions included');
});

test('a search budget that cannot prove optimality is reported as unproven, not optimal', async ({page}) => {
  await open(page, 'Demo');
  await step(page, 'Plan').click();
  await page.getByLabel('Search budget').fill('1');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('solver-status')).toHaveText('FEASIBLE_NOT_PROVEN');
  await expect(page.getByTestId('plan-result')).toContainText('search budget was exhausted');
  await expect(page.getByTestId('plan-result')).not.toContainText('Exact search finished');
  await page.getByLabel('Search budget').fill('0');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByRole('alert')).toContainText('Search budget must be a whole number');
});

test('backend failures are visible and recoverable, never faked as success', async ({page}) => {
  await page.route('**/api/v1/scenarios', route => route.abort());
  await page.goto('/');
  await expect(page.getByTestId('error-banner')).toBeVisible();
  await expect(page.getByTestId('scenario-card')).toHaveCount(0);
  await page.unroute('**/api/v1/scenarios');
  await page.getByTestId('error-banner').getByRole('button', {name: 'Retry'}).click();
  await expect(page.getByTestId('scenario-card')).toHaveCount(2);

  await open(page, 'Canonical');
  await page.route('**/api/v1/plan', route => route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: {code: 'INTERNAL_ERROR', message: 'internal error', details: []}})}));
  await step(page, 'Plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByRole('alert')).toContainText('internal error');
  await expect(page.getByTestId('solver-status')).toHaveCount(0);
});

test('unknown scenario URL shows a clear error with a way back', async ({page}) => {
  await page.goto('/scenarios/does_not_exist');
  await expect(page.getByTestId('error-banner')).toContainText('could not be loaded');
});

for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 820, 1100], ['mobile', 390, 844]] as const) {
  test(`layout works at ${name} width without horizontal overflow`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.goto('/');
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.getByTestId('scenario-card').filter({hasText: 'Demo'}).click();
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    await expect(step(page, 'Plan')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Generate plan'})).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.getByRole('button', {name: 'Generate plan'}).click();
    await expect(page.getByTestId('solver-status')).toHaveText('OPTIMAL');
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}
