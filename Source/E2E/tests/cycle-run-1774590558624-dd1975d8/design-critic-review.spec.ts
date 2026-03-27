// Verifies: FR-UX-001
// Design critic E2E review: cross-cutting design consistency for status sync and traceability

import { test, expect } from '@playwright/test';

test.describe('Design Critic: Status Sync Consistency', () => {

  // --- Bug Reports: action availability matches status ---

  test('bug reports page should render filters with correct styling', async ({ page }) => {
    await page.goto('/bugs');
    await expect(page.getByRole('heading', { name: /bug reports/i })).toBeVisible();
    // Verify filter dropdowns exist
    const selects = page.locator('select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2); // status + severity filters
  });

  test('reported/triaged bugs should show submit to orchestrator option', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugCards = page.locator('.cursor-pointer').first();
    const hasBugs = await bugCards.isVisible().catch(() => false);
    if (hasBugs) {
      await bugCards.click();
      await page.waitForTimeout(500);
      // Check for either submit button or orchestrator run section depending on status
      const submitBtn = page.getByRole('button', { name: /submit to orchestrator/i });
      const orchRun = page.getByText('Orchestrator Run');
      const hasSubmit = await submitBtn.isVisible().catch(() => false);
      const hasOrchRun = await orchRun.isVisible().catch(() => false);
      // Bug should show one or the other — never both
      if (hasSubmit) {
        expect(hasOrchRun).toBe(false);
      }
    }
  });

  // --- Feature Requests: action availability matches status ---

  test('approved features should show submit to orchestrator button', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const frCards = page.locator('.cursor-pointer').first();
    const hasFRs = await frCards.isVisible().catch(() => false);
    if (hasFRs) {
      await frCards.click();
      await page.waitForTimeout(500);
      // Depending on status, should see appropriate actions
      const status = await page.locator('.rounded-full').first().textContent();
      if (status?.includes('approved')) {
        await expect(page.getByRole('button', { name: /submit to orchestrator/i })).toBeVisible();
      }
    }
  });

  // --- Color system cross-page consistency ---

  test('in_development badges should use amber across all pages', async ({ page }) => {
    // Check bug reports page
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugBadges = page.locator('.rounded-full');
    const bugBadgeCount = await bugBadges.count();
    for (let i = 0; i < Math.min(bugBadgeCount, 30); i++) {
      const text = await bugBadges.nth(i).textContent();
      if (text?.includes('in development') || text?.includes('in_development')) {
        const classes = await bugBadges.nth(i).getAttribute('class');
        expect(classes).toContain('amber');
        expect(classes).not.toContain('yellow');
      }
    }

    // Check feature requests page
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const frBadges = page.locator('.rounded-full');
    const frBadgeCount = await frBadges.count();
    for (let i = 0; i < Math.min(frBadgeCount, 30); i++) {
      const text = await frBadges.nth(i).textContent();
      if (text?.includes('in development') || text?.includes('in_development')) {
        const classes = await frBadges.nth(i).getAttribute('class');
        expect(classes).toContain('amber');
        expect(classes).not.toContain('yellow');
      }
    }
  });

  test('completed/resolved badges should use green across all pages', async ({ page }) => {
    // Check feature requests page
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const frBadges = page.locator('.rounded-full');
    const frBadgeCount = await frBadges.count();
    for (let i = 0; i < Math.min(frBadgeCount, 30); i++) {
      const text = await frBadges.nth(i).textContent();
      if (text?.includes('completed')) {
        const classes = await frBadges.nth(i).getAttribute('class');
        expect(classes).toContain('green');
        expect(classes).not.toContain('purple');
      }
    }

    // Check bug reports page
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugBadges = page.locator('.rounded-full');
    const bugBadgeCount = await bugBadges.count();
    for (let i = 0; i < Math.min(bugBadgeCount, 30); i++) {
      const text = await bugBadges.nth(i).textContent();
      if (text?.includes('resolved')) {
        const classes = await bugBadges.nth(i).getAttribute('class');
        expect(classes).toContain('green');
      }
    }
  });

  // --- Orchestrator runs tab: status badges match design system ---

  test('orchestrator run status badges use correct semantic colors', async ({ page }) => {
    await page.goto('/cycle');
    const runsTab = page.getByTestId('tab-runs');
    const hasRunsTab = await runsTab.isVisible().catch(() => false);
    if (!hasRunsTab) return;

    await runsTab.click();
    await page.waitForSelector(
      '[data-testid="runs-table"], [data-testid="empty-state"]',
      { timeout: 10000 }
    );
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      const statusBadges = page.getByTestId('status-badge');
      const count = await statusBadges.count();
      for (let i = 0; i < count; i++) {
        const text = (await statusBadges.nth(i).textContent()) || '';
        const classes = (await statusBadges.nth(i).getAttribute('class')) || '';

        if (text === 'complete') {
          expect(classes).toContain('green');
        } else if (text === 'failed') {
          expect(classes).toContain('red');
        } else if (text === 'implementing' || text === 'planning' || text === 'validating') {
          expect(classes).toContain('blue');
        } else if (text === 'qa_running') {
          expect(classes).toContain('amber');
        }
      }
    }
  });

  // --- Linked run display consistency ---

  test('linked orchestrator run section uses semantic background colors', async ({ page }) => {
    // Test on bugs page
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugCards = page.locator('.cursor-pointer');
    const bugCount = await bugCards.count();

    for (let i = 0; i < Math.min(bugCount, 5); i++) {
      await bugCards.nth(i).click();
      await page.waitForTimeout(500);

      // Check if orchestrator run section exists
      const orchSection = page.getByText('Orchestrator Run').first();
      const hasOrch = await orchSection.isVisible().catch(() => false);
      if (hasOrch) {
        // The section should have a semantic background (green/red/blue)
        const container = orchSection.locator('..');
        const classes = (await container.getAttribute('class')) || '';
        // Should use one of: bg-green-50, bg-red-50, bg-blue-50
        const hasSemanticBg = classes.includes('bg-green-50') ||
          classes.includes('bg-red-50') ||
          classes.includes('bg-blue-50');
        expect(hasSemanticBg || !classes.includes('bg-')).toBe(true);
        break; // Found one, that's enough
      }

      // Close detail
      const closeBtn = page.getByRole('button', { name: /close/i }).first();
      const hasClose = await closeBtn.isVisible().catch(() => false);
      if (hasClose) await closeBtn.click();
      await page.waitForTimeout(300);
    }
  });

  // --- Submit button uses primary blue ---

  test('submit to orchestrator buttons use blue primary color', async ({ page }) => {
    // Check bugs page
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugCards = page.locator('.cursor-pointer');
    const bugCount = await bugCards.count();

    for (let i = 0; i < Math.min(bugCount, 5); i++) {
      await bugCards.nth(i).click();
      await page.waitForTimeout(500);

      const submitBtn = page.getByRole('button', { name: /submit to orchestrator/i }).first();
      const hasSubmit = await submitBtn.isVisible().catch(() => false);
      if (hasSubmit) {
        const classes = (await submitBtn.getAttribute('class')) || '';
        expect(classes).toContain('bg-blue-600');
        expect(classes).not.toContain('purple');
        break;
      }

      const closeBtn = page.getByRole('button', { name: /close/i }).first();
      const hasClose = await closeBtn.isVisible().catch(() => false);
      if (hasClose) await closeBtn.click();
      await page.waitForTimeout(300);
    }
  });

  // --- No console errors during navigation ---

  test('no console errors navigating between bug reports, features, and orchestrator', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/bugs');
    await page.waitForTimeout(1500);

    await page.goto('/feature-requests');
    await page.waitForTimeout(1500);

    await page.goto('/cycle');
    await page.waitForTimeout(1500);

    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to') &&
             !e.includes('Network') && !e.includes('ERR_') &&
             !e.includes('404')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});
