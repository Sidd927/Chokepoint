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
const disclose = (page: Page, title: string) => page.locator('summary', {hasText: title}).first().click();
const jumpToStep = async (page: Page, index: number) => {
  await page.locator('.story-step').nth(index).evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant' as ScrollBehavior}));
};

test.describe('landing page', () => {
  test('explains the product and shows a preview built from the live API', async ({page}) => {
    await page.goto('/');
    await expect(page.getByRole('heading', {level: 1})).toContainText('Cut the path.');
    await expect(page.getByRole('heading', {level: 1})).toContainText('Keep the service.');
    await expect(page.getByRole('status')).toHaveText('Backend online');
    await expect(page.getByTestId('hero-caption')).toContainText('2 of 2');
    await expect(page.getByTestId('hero-caption')).toContainText('Canonical City (synthetic)');
    await page.getByRole('button', {name: 'After the plan'}).click();
    await expect(page.getByTestId('hero-caption')).toContainText('0 of 2');
    await expect(page.getByTestId('hero-caption')).toContainText('200');
    await expect(page.getByText('Nothing here scans, or touches, a real network.')).toBeVisible();
  });

  test('the scroll story advances through real results as the visitor scrolls', async ({page}) => {
    await page.goto('/');
    await expect(page.getByTestId('story-readout')).toContainText('4 required flows');
    const expected = [/4 required flows/, /2 of 2.*critical targets reachable/, /1 required flow broken/, /OPTIMAL.*200\s*dh.*targets 2 → 0.*4 of 4 kept/, /VERIFIED.*10 of 10 checks passed.*sha256:/s];
    for (const [index, pattern] of expected.entries()) {
      await jumpToStep(page, index);
      await expect(page.getByTestId('story-readout')).toHaveText(pattern);
      await expect(page.locator('.story-step.active')).toHaveAttribute('data-step', String(index));
    }
  });

  test('primary call to action opens the working workspace and the plan can be generated', async ({page}) => {
    await page.goto('/');
    await page.getByRole('link', {name: 'Explore the live demo'}).first().click();
    await expect(page).toHaveURL(/\/scenarios\/demo_city$/);
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    await page.getByRole('button', {name: 'Generate plan'}).click();
    await expect(page.getByTestId('solver-status')).toHaveText('OPTIMAL');
    await expect(page.getByTestId('plan-cost')).toHaveText('105 dh');
  });

  test('anchor navigation works and moves the section into view', async ({page}) => {
    await page.goto('/');
    await expect(page.getByTestId('story-readout')).toBeVisible();   // the story's height is only final once its data has loaded
    await page.locator('.l-nav').getByRole('link', {name: 'How it works'}).click();
    await expect(page).toHaveURL(/#how$/);
    await expect(page.getByRole('heading', {name: 'Five steps, two programs.'})).toBeInViewport();
    await page.locator('.l-nav').getByRole('link', {name: 'Evidence'}).click();
    await expect(page.getByRole('heading', {name: /What the implementation actually guarantees/})).toBeInViewport();
  });

  test('scrolling is never hijacked: the wheel over the graph scrolls the page', async ({page}) => {
    await page.goto('/');
    const box = (await page.getByTestId('graph-canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test('reduced motion: content is visible without scroll effects and smooth scrolling is off', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    expect(await page.locator('.reveal').evaluateAll(items => items.every(item => getComputedStyle(item).opacity === '1'))).toBe(true);
    await expect(page.locator('.story-step').first()).toHaveCSS('transition-duration', '0s');
  });

  test('backend unavailable: the page says so and shows no invented preview', async ({page}) => {
    await page.route('**/api/v1/**', route => route.abort());
    await page.goto('/');
    await expect(page.getByTestId('story-error')).toContainText('needs the backend');
    await expect(page.getByTestId('error-banner')).toBeVisible();
    await expect(page.getByTestId('hero-caption')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Backend down');
  });
});

test.describe('workspace', () => {
  test('demo_city: inspect, graph controls, plan, verify, compare, receipt and real download', async ({page}) => {
    await open(page, 'Demo');
    await expect(page.getByText('3 of 3 critical targets')).toBeVisible();
    await expect(page.getByText('can be reached')).toBeVisible();

    for (const name of ['Fit', 'Zoom in', 'Zoom out', 'Reset']) await page.getByRole('button', {name, exact: true}).click();
    await page.getByTestId('layer-permissions').check(); await page.getByTestId('layer-permissions').uncheck();
    await page.getByText('Accessible graph table').click();
    await page.getByRole('button', {name: 'Municipal API', exact: true}).click();
    await expect(page.getByTestId('selection-detail')).toContainText('Municipal API');
    await page.getByRole('button', {name: 'Focus on this asset'}).click();
    await expect(page.getByRole('button', {name: 'Show whole network'})).toBeVisible();
    await page.getByRole('button', {name: 'Clear focus'}).click();
    await page.getByRole('button', {name: 'Close details'}).click();
    await expect(page.getByTestId('selection-detail')).toHaveCount(0);

    await compute(page);
    await expect(page.getByTestId('plan-cost')).toHaveText('105 dh');
    await expect(page.getByTestId('action-row')).toHaveCount(5);
    await page.getByTestId('action-row').first().locator('summary').first().click();
    await expect(page.getByTestId('action-row').first()).toContainText('modelled attack connections');
    await page.getByTestId('action-row').filter({hasText: 'Harden jump host'}).locator('summary').first().click();
    await expect(page.getByTestId('action-row').filter({hasText: 'Harden jump host'})).toContainText('Facts (computed from the model)');
    await expect(page.getByTestId('action-row').filter({hasText: 'Harden jump host'}).getByTestId('necessity')).toContainText('Necessary within this plan');
    await expect(page.getByTestId('action-row').filter({hasText: 'Harden jump host'})).toContainText('Confirm before real implementation');
    await disclose(page, 'How to read this result');
    await expect(page.getByTestId('outcome-notes')).toContainText('no cheaper plan exists');
    await expect(page.getByText('VERIFIED').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'After', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', {name: 'Before', exact: true}).click();
    await expect(page.getByText('Showing the network today.')).toBeVisible();
    await page.getByRole('button', {name: 'After', exact: true}).click();

    await step(page, 'Verify').click();
    await disclose(page, 'Claim a cost to check');
    await page.getByLabel('Claimed total cost').fill('not-a-cost');
    await page.getByTestId('verify-run').click();
    await expect(page.getByRole('alert')).toContainText('Claimed cost');
    await page.getByLabel('Claimed total cost').fill('999999');
    await page.getByTestId('verify-run').click();
    await expect(page.getByTestId('verify-verdict')).toContainText('REJECTED');
    await expect(page.getByTestId('verify-verdict')).toContainText('Claimed cost is correct');
    await page.getByLabel('Claimed total cost').fill('');
    await page.getByTestId('verify-run').click();
    await expect(page.getByTestId('verify-verdict')).toContainText('Every check passed');
    await disclose(page, 'All checks');
    await expect(page.getByTestId('verify-verdict')).toContainText('10 of 10 passed');

    await step(page, 'Compare').click();
    await expect(page.getByTestId('compare-before')).toContainText('3');
    await expect(page.getByTestId('compare-after')).toContainText('0');
    await expect(page.getByText('5 of 5').first()).toBeVisible();

    await step(page, 'Receipt').click();
    const digest = (await page.getByTestId('receipt-digest').textContent())!;
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    await disclose(page, 'Technical details');
    const shown = JSON.parse((await page.getByTestId('receipt-json').textContent())!);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('receipt-download').click()]);
    expect(download.suggestedFilename()).toMatch(/^chokepoint-demo_city-[0-9a-f]{8}\.receipt\.json$/);
    const saved = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(saved).toEqual(shown);
    expect(saved.receipt_fingerprint).toBe(digest);
    expect(saved.action_ids).toEqual(['D01', 'D03', 'D08', 'D09', 'D10']);
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-download').click()]);
    expect(pdf.suggestedFilename()).toBe('chokepoint-report-demo_city.pdf');
    const pdfBytes = readFileSync((await pdf.path())!);
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBytes.includes('105 dh') && pdfBytes.includes('(VERIFIED)') && pdfBytes.includes('Harden jump host')).toBe(true);
    await page.getByTestId('receipt-reverify').click();
    await expect(page.getByTestId('receipt-integrity')).toContainText('Receipt fingerprint matches');
    // long hashes must wrap inside the panel instead of widening it (regression: the panel used to clip its own content)
    expect(await page.locator('.panel-inner').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });

  test('Compare and Receipt explain themselves before a plan exists and lead to one', async ({page}) => {
    await open(page, 'Demo');
    await step(page, 'Compare').click();
    await expect(page.getByRole('heading', {name: 'Nothing to compare yet.'})).toBeVisible();
    await expect(page.getByText('Today, 3 of 3 critical targets are reachable')).toBeVisible();
    await step(page, 'Receipt').click();
    await expect(page.getByRole('heading', {name: 'No receipt yet.'})).toBeVisible();
    await page.getByRole('button', {name: 'Generate a plan'}).click();
    await expect(page.getByTestId('receipt-digest')).toBeVisible();
    await expect(step(page, 'Receipt')).toHaveAttribute('aria-current', 'page');
  });

  test('scenario switching never shows another scenario\'s results; canonical_city plans to 200 dh', async ({page}) => {
    await open(page, 'Demo');
    await compute(page);
    await expect(page.getByTestId('plan-cost')).toHaveText('105 dh');
    await page.getByLabel('Scenario', {exact: true}).selectOption('canonical_city');
    await expect(page.getByRole('heading', {name: 'Canonical City (synthetic)', level: 1})).toBeVisible();
    await expect(page.getByTestId('solver-status')).toHaveCount(0);
    await step(page, 'Receipt').click();
    await expect(page.getByText('No receipt yet')).toBeVisible();
    await compute(page);
    await expect(page.getByTestId('plan-cost')).toHaveText('200 dh');
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
    await disclose(page, 'Choose the actions to verify');
    await page.getByTestId('check-row').first().uncheck();
    await expect(page.getByTestId('verify-verdict')).toHaveCount(0);
    await page.getByTestId('verify-run').click();
    await expect(page.getByTestId('verify-verdict')).toContainText('REJECTED');
    await expect(page.getByTestId('verify-verdict')).toContainText('Mandatory actions included');
  });

  test('a search budget that cannot prove optimality is reported as unproven, not optimal', async ({page}) => {
    await open(page, 'Demo');
    await step(page, 'Plan').click();
    await disclose(page, 'Search settings');
    await page.getByLabel('Search budget').fill('1');
    await page.getByTestId('compute-plan').click();
    await expect(page.getByTestId('solver-status')).toHaveText('FEASIBLE_NOT_PROVEN');
    await expect(page.getByTestId('plan-result')).toContainText('search budget was exhausted');
    await expect(page.getByTestId('plan-result')).toContainText('not proven cheapest');
    await expect(page.getByTestId('plan-result')).not.toContainText('Exact search finished');
    await disclose(page, 'Search settings');
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
});

for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 768, 1024], ['mobile', 390, 844]] as const) {
  test(`landing and workspace work at ${name} width without horizontal overflow`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.goto('/');
    await expect(page.getByTestId('hero-caption')).toBeVisible();
    await expect(page.getByRole('link', {name: 'Explore the live demo'}).first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await jumpToStep(page, 3);
    await expect(page.getByTestId('story-readout')).toContainText('OPTIMAL');
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.locator('#demo').scrollIntoViewIfNeeded();
    await page.getByTestId('scenario-card').filter({hasText: 'Demo'}).click();
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    await expect(step(page, 'Plan')).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.getByRole('button', {name: 'Generate plan'}).click();
    await expect(page.getByTestId('solver-status')).toHaveText('OPTIMAL');
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

test.describe('scenario import', () => {
  test('invalid input is explained and keeps the text; a valid scenario previews and runs the whole workflow', async ({page}) => {
    await page.goto('/import');
    const input = page.getByLabel('Scenario JSON');
    await input.fill('{"nope"');
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-error')).toContainText('not valid JSON');
    await input.fill('{"schema_version": "1", "id": "x"}');
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-error')).toContainText('not valid');
    await expect(input).toHaveValue('{"schema_version": "1", "id": "x"}');

    await page.getByRole('button', {name: 'Start from the Canonical City format'}).click();
    await expect(input).not.toHaveValue(/"nope"/);
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-success')).toContainText('Valid scenario: Canonical City (synthetic)');
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    await page.getByTestId('import-open').click();

    await expect(page).toHaveURL(/\/scenarios\/imported$/);
    await expect(page.getByText('never stored by the server')).toBeVisible();
    await compute(page);
    await expect(page.getByTestId('plan-cost')).toHaveText('200 dh');
    await step(page, 'Verify').click();
    await page.getByTestId('verify-run').click();
    await expect(page.getByTestId('verify-verdict')).toContainText('VERIFIED');
    await step(page, 'Compare').click();
    await expect(page.getByTestId('compare-after')).toContainText('0');
    await step(page, 'Receipt').click();
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-download').click()]);
    expect(pdf.suggestedFilename()).toBe('chokepoint-report-imported.pdf');
    expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
    // built-in scenarios are unaffected
    await page.goto('/');
    await expect(page.getByTestId('scenario-card')).toHaveCount(2);
  });

  test('import page has no horizontal overflow on a phone', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/import');
    await page.getByRole('button', {name: 'Start from the Canonical City format'}).click();
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-success')).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
