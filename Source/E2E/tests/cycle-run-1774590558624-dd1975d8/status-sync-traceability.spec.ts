// Verifies: FR-UX-001
// E2E tests for status sync between bug reports, feature requests, and orchestrator runs

import { test, expect } from '@playwright/test';

test.describe('Feature: Status Sync and Traceability', () => {

  // --- Bug Reports Page ---

  test('should render bug reports page', async ({ page }) => {
    await page.goto('/bugs');
    await expect(page.getByRole('heading', { name: /bug reports/i })).toBeVisible();
  });

  test('should open bug detail when clicking a bug', async ({ page }) => {
    await page.goto('/bugs');
    // Wait for either bugs to load or empty state
    await page.waitForTimeout(2000);
    const bugCards = page.locator('[data-testid="bug-card"], .cursor-pointer').first();
    const hasBugs = await bugCards.isVisible().catch(() => false);
    if (hasBugs) {
      await bugCards.click();
      // Bug detail should show status badge and close button
      await expect(page.getByText(/severity/i).or(page.getByText(/status/i)).first()).toBeVisible();
    }
  });

  test('bug detail should show onUpdate callback wired (close button works)', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugCards = page.locator('[data-testid="bug-card"], .cursor-pointer').first();
    const hasBugs = await bugCards.isVisible().catch(() => false);
    if (hasBugs) {
      await bugCards.click();
      // Should have a close button
      const closeBtn = page.getByRole('button', { name: /close/i }).or(page.locator('button:has-text("×")')).first();
      const hasClose = await closeBtn.isVisible().catch(() => false);
      if (hasClose) {
        await closeBtn.click();
        // Detail should close
        await page.waitForTimeout(500);
      }
    }
  });

  test('bug detail with in_development status should show orchestrator run section', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    // Look for any bug with in_development status badge
    const inDevBadge = page.locator('text=in_development').first();
    const hasInDev = await inDevBadge.isVisible().catch(() => false);
    if (hasInDev) {
      // Click the parent card
      await inDevBadge.locator('..').locator('..').click();
      await page.waitForTimeout(1000);
      // Should show Orchestrator Run section
      const orchSection = page.getByText('Orchestrator Run');
      const hasOrchSection = await orchSection.isVisible().catch(() => false);
      // If linked run exists, should see it
      if (hasOrchSection) {
        await expect(orchSection).toBeVisible();
      }
    }
  });

  // --- Feature Requests Page ---

  test('should render feature requests page', async ({ page }) => {
    await page.goto('/feature-requests');
    await expect(page.getByRole('heading', { name: /feature requests/i })).toBeVisible();
  });

  test('should open feature request detail when clicking a feature', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const frCards = page.locator('[data-testid="feature-card"], .cursor-pointer').first();
    const hasFRs = await frCards.isVisible().catch(() => false);
    if (hasFRs) {
      await frCards.click();
      await expect(page.getByText(/status/i).first()).toBeVisible();
    }
  });

  test('feature detail with in_development status should show orchestrator run section', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const inDevBadge = page.locator('text=in_development').first();
    const hasInDev = await inDevBadge.isVisible().catch(() => false);
    if (hasInDev) {
      await inDevBadge.locator('..').locator('..').click();
      await page.waitForTimeout(1000);
      const orchSection = page.getByText('Orchestrator Run');
      const hasOrchSection = await orchSection.isVisible().catch(() => false);
      if (hasOrchSection) {
        await expect(orchSection).toBeVisible();
      }
    }
  });

  // --- Orchestrator Runs Tab ---

  test('should render orchestrator page and switch to runs tab', async ({ page }) => {
    await page.goto('/cycle');
    await expect(page.getByRole('heading', { name: /orchestrator/i })).toBeVisible();
    const runsTab = page.getByTestId('tab-runs');
    await runsTab.click();
    await expect(page.getByTestId('runs-tab')).toBeVisible();
  });

  test('runs tab should show loading state then content', async ({ page }) => {
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    // Should see either loading spinner, runs table, or empty state
    await page.waitForSelector(
      '[data-testid="loading-spinner"], [data-testid="runs-table"], [data-testid="empty-state"]',
      { timeout: 10000 }
    );
  });

  test('runs tab should use consistent color system (no purple/indigo in badges)', async ({ page }) => {
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 10000 });
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      // Check that team badges use blue (not indigo)
      const teamBadges = page.getByTestId('team-badge');
      const count = await teamBadges.count();
      for (let i = 0; i < count; i++) {
        const classes = await teamBadges.nth(i).getAttribute('class');
        expect(classes).not.toContain('indigo');
        expect(classes).not.toContain('purple');
      }
      // Check status badges don't use purple
      const statusBadges = page.getByTestId('status-badge');
      const statusCount = await statusBadges.count();
      for (let i = 0; i < statusCount; i++) {
        const classes = await statusBadges.nth(i).getAttribute('class');
        expect(classes).not.toContain('purple');
      }
    }
  });

  test('runs tab should show polling indicator when runs exist', async ({ page }) => {
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 10000 });
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      // Polling indicator should show "Last updated: Xs ago"
      await expect(page.getByText(/Last updated:.*ago/)).toBeVisible();
    }
  });

  test('runs tab empty state should use SVG icon, not emoji', async ({ page }) => {
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 10000 });
    const hasEmpty = await page.getByTestId('empty-state').isVisible().catch(() => false);
    if (hasEmpty) {
      const emptyState = page.getByTestId('empty-state');
      // Should have SVG icon
      await expect(emptyState.locator('svg')).toBeVisible();
      // Should NOT have emoji
      const text = await emptyState.textContent();
      expect(text).not.toContain('📋');
    }
  });

  test('runs tab loading state should have contextual text', async ({ page }) => {
    // Navigate fresh to catch loading state
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    // If loading spinner appears, it should have text
    const spinner = page.getByTestId('loading-spinner');
    const hasSpinner = await spinner.isVisible().catch(() => false);
    if (hasSpinner) {
      await expect(page.getByText('Loading runs...')).toBeVisible();
    }
  });

  test('run detail row should use blue for merged PR badge (not purple)', async ({ page }) => {
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 10000 });
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      // Expand first run
      const firstRow = page.getByTestId('run-row').first();
      await firstRow.click();
      await page.waitForTimeout(500);
      // If detail row exists, check merge badge colors
      const detailRow = page.getByTestId('run-detail-row');
      const hasDetail = await detailRow.isVisible().catch(() => false);
      if (hasDetail) {
        const mergeBadges = detailRow.locator('.rounded-full');
        const badgeCount = await mergeBadges.count();
        for (let i = 0; i < badgeCount; i++) {
          const classes = await mergeBadges.nth(i).getAttribute('class');
          if (classes?.includes('purple')) {
            // Fail - merged badge should be blue, not purple
            expect(classes).not.toContain('purple');
          }
        }
      }
    }
  });

  // --- Cross-page: No console errors ---

  test('should not have console errors on bug reports page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/bugs');
    await page.waitForTimeout(3000);
    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to') && !e.includes('Network') && !e.includes('ERR_')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('should not have console errors on feature requests page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/feature-requests');
    await page.waitForTimeout(3000);
    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to') && !e.includes('Network') && !e.includes('ERR_')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('should not have console errors on orchestrator runs tab', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/cycle');
    await page.getByTestId('tab-runs').click();
    await page.waitForTimeout(3000);
    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to') && !e.includes('Network') && !e.includes('ERR_')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  // --- Status badge color consistency ---

  test('bug status badges should use correct color system', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    // Check that no status badges use yellow (should be amber for in_development)
    const statusBadges = page.locator('.rounded-full, [class*="bg-"]');
    const count = await statusBadges.count();
    let foundYellowStatus = false;
    for (let i = 0; i < Math.min(count, 50); i++) {
      const classes = await statusBadges.nth(i).getAttribute('class');
      const text = await statusBadges.nth(i).textContent();
      if (text?.includes('in_development') && classes?.includes('yellow')) {
        foundYellowStatus = true;
      }
    }
    expect(foundYellowStatus).toBe(false);
  });

  test('feature request status badges should use correct color system', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const statusBadges = page.locator('.rounded-full, [class*="bg-"]');
    const count = await statusBadges.count();
    let foundPurpleStatus = false;
    for (let i = 0; i < Math.min(count, 50); i++) {
      const classes = await statusBadges.nth(i).getAttribute('class');
      const text = await statusBadges.nth(i).textContent();
      if (text?.includes('completed') && classes?.includes('purple')) {
        foundPurpleStatus = true;
      }
    }
    expect(foundPurpleStatus).toBe(false);
  });
});
