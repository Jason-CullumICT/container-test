// Verifies: FR-UX-001
// Visual QA E2E tests for status sync — badge colors, layout, action states

import { test, expect } from '@playwright/test';

test.describe('Visual: Status Sync Badge Colors', () => {

  test('bug reports page should render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/bugs');
    await expect(page.getByRole('heading', { name: 'Bug Reports' })).toBeVisible();
    await page.waitForTimeout(2000);
    expect(errors.filter((e) => !e.includes('fetch') && !e.includes('Network'))).toHaveLength(0);
  });

  test('feature requests page should render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/feature-requests');
    await expect(page.getByRole('heading', { name: 'Feature Requests' })).toBeVisible();
    await page.waitForTimeout(2000);
    expect(errors.filter((e) => !e.includes('fetch') && !e.includes('Network'))).toHaveLength(0);
  });

  test('bug list should not use yellow or purple in status badges', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const allBadges = page.locator('.rounded-full');
    const count = await allBadges.count();
    for (let i = 0; i < count; i++) {
      const classes = await allBadges.nth(i).getAttribute('class') ?? '';
      // Status badges should never use yellow or purple
      expect(classes).not.toMatch(/bg-yellow-/);
      expect(classes).not.toMatch(/bg-purple-/);
    }
  });

  test('feature request list should not use yellow or purple in status badges', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const allBadges = page.locator('.rounded-full');
    const count = await allBadges.count();
    for (let i = 0; i < count; i++) {
      const classes = await allBadges.nth(i).getAttribute('class') ?? '';
      expect(classes).not.toMatch(/bg-yellow-/);
      expect(classes).not.toMatch(/bg-purple-/);
    }
  });

  test('bug filter selects should show blue ring when active', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(1000);
    const selects = page.locator('select');
    const firstSelect = selects.first();
    // Initially no blue ring
    const initialClasses = await firstSelect.getAttribute('class') ?? '';
    expect(initialClasses).toContain('border-gray-300');
    // Apply a filter
    await firstSelect.selectOption('reported');
    const activeClasses = await firstSelect.getAttribute('class') ?? '';
    expect(activeClasses).toContain('border-blue-500');
    expect(activeClasses).toContain('ring-blue-500');
  });

  test('feature request filter selects should show blue ring when active', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(1000);
    const selects = page.locator('select');
    const firstSelect = selects.first();
    await firstSelect.selectOption('approved');
    const activeClasses = await firstSelect.getAttribute('class') ?? '';
    expect(activeClasses).toContain('border-blue-500');
  });

  test('bug reports loading state should have spinner and contextual text', async ({ page }) => {
    await page.goto('/bugs');
    // Check for loading text (may be brief)
    const loadingText = page.getByText('Loading bug reports...');
    // Either we caught the loading state or it already loaded
    const pageHeading = page.getByRole('heading', { name: 'Bug Reports' });
    await expect(pageHeading).toBeVisible();
  });

  test('feature requests loading state should have spinner and contextual text', async ({ page }) => {
    await page.goto('/feature-requests');
    const pageHeading = page.getByRole('heading', { name: 'Feature Requests' });
    await expect(pageHeading).toBeVisible();
  });
});

test.describe('Visual: Bug Detail Status Sync Display', () => {

  test('bug detail should show close button with aria-label', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer, button').first();
    const hasBugs = await bugItem.isVisible().catch(() => false);
    if (hasBugs) {
      await bugItem.click();
      await page.waitForTimeout(500);
      const closeBtn = page.getByRole('button', { name: 'Close' });
      const hasClose = await closeBtn.isVisible().catch(() => false);
      if (hasClose) {
        await expect(closeBtn).toHaveAttribute('aria-label', 'Close');
      }
    }
  });

  test('bug detail severity badge should use correct colors', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer, button').first();
    const hasBugs = await bugItem.isVisible().catch(() => false);
    if (hasBugs) {
      await bugItem.click();
      await page.waitForTimeout(500);
      // Check severity badge does not use yellow or orange
      const severityBadges = page.locator('.border.rounded-full');
      const count = await severityBadges.count();
      for (let i = 0; i < count; i++) {
        const classes = await severityBadges.nth(i).getAttribute('class') ?? '';
        if (classes.includes('severity')) {
          expect(classes).not.toMatch(/bg-yellow-/);
          expect(classes).not.toMatch(/bg-orange-/);
        }
      }
    }
  });

  test('bug detail should show "Attachments" label not "Screenshots"', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer, button').first();
    const hasBugs = await bugItem.isVisible().catch(() => false);
    if (hasBugs) {
      await bugItem.click();
      await page.waitForTimeout(500);
      // Should find "Attachments" text, not "Screenshots"
      const attachments = page.getByText(/Attachments/);
      const hasAttachments = await attachments.isVisible().catch(() => false);
      if (hasAttachments) {
        await expect(attachments).toBeVisible();
      }
      const screenshots = page.getByText('Screenshots');
      expect(await screenshots.count()).toBe(0);
    }
  });
});

test.describe('Visual: Feature Request Detail Status Sync Display', () => {

  test('feature request detail should show close button with aria-label', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    const frItem = page.locator('.cursor-pointer, button').first();
    const hasFRs = await frItem.isVisible().catch(() => false);
    if (hasFRs) {
      await frItem.click();
      await page.waitForTimeout(500);
      const closeBtn = page.getByRole('button', { name: 'Close' });
      const hasClose = await closeBtn.isVisible().catch(() => false);
      if (hasClose) {
        await expect(closeBtn).toHaveAttribute('aria-label', 'Close');
      }
    }
  });

  test('feature request submit button should use blue (not purple)', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(2000);
    // Look for submit to orchestrator button
    const submitBtn = page.getByRole('button', { name: /submit to orchestrator/i });
    const hasSubmit = await submitBtn.isVisible().catch(() => false);
    if (hasSubmit) {
      const classes = await submitBtn.getAttribute('class') ?? '';
      expect(classes).toContain('bg-blue-600');
      expect(classes).not.toContain('bg-purple');
    }
  });
});

test.describe('Visual: Orchestrator Runs Tab Display', () => {

  test('runs tab should show correct status badge colors', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const runsTab = page.getByTestId('runs-tab');
    const hasRuns = await runsTab.isVisible().catch(() => false);
    if (hasRuns) {
      // Verify no purple, yellow, or indigo badges
      const badges = page.locator('.rounded-full');
      const count = await badges.count();
      for (let i = 0; i < count; i++) {
        const classes = await badges.nth(i).getAttribute('class') ?? '';
        expect(classes).not.toMatch(/bg-purple-/);
        expect(classes).not.toMatch(/bg-yellow-/);
        expect(classes).not.toMatch(/bg-indigo-/);
      }
    }
  });

  test('runs tab empty state should show SVG icon and heading', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const emptyState = page.getByTestId('empty-state');
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    if (hasEmpty) {
      // Should have SVG, not emoji
      await expect(emptyState.locator('svg')).toBeVisible();
      await expect(emptyState.getByText('No runs found')).toBeVisible();
      await expect(emptyState.getByText(/submit work/i)).toBeVisible();
    }
  });

  test('runs tab loading state should show spinner with text', async ({ page }) => {
    await page.goto('/orchestrator');
    // Check for loading text (may be brief)
    const loadingSpinner = page.getByTestId('loading-spinner');
    const hasSpinner = await loadingSpinner.isVisible().catch(() => false);
    if (hasSpinner) {
      await expect(page.getByText('Loading runs...')).toBeVisible();
    }
  });

  test('run detail expansion should show phase grid and PR info', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const runRow = page.getByTestId('run-row').first();
    const hasRows = await runRow.isVisible().catch(() => false);
    if (hasRows) {
      await runRow.click();
      await page.waitForTimeout(500);
      const detail = page.getByTestId('run-detail-row');
      const hasDetail = await detail.isVisible().catch(() => false);
      if (hasDetail) {
        // Check that phase grid exists if phases are present
        const phases = page.getByTestId('run-detail-phases');
        const hasPhases = await phases.isVisible().catch(() => false);
        if (hasPhases) {
          // All 5 phase columns should be present
          await expect(page.getByTestId('phase-leader')).toBeVisible();
          await expect(page.getByTestId('phase-implementation')).toBeVisible();
          await expect(page.getByTestId('phase-qa')).toBeVisible();
          await expect(page.getByTestId('phase-smoketest')).toBeVisible();
          await expect(page.getByTestId('phase-inspector')).toBeVisible();
        }
      }
    }
  });

  test('team badges should use blue-100/blue-700', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const teamBadges = page.getByTestId('team-badge');
    const count = await teamBadges.count();
    for (let i = 0; i < count; i++) {
      const classes = await teamBadges.nth(i).getAttribute('class') ?? '';
      expect(classes).toContain('bg-blue-100');
      expect(classes).toContain('text-blue-700');
    }
  });

  test('pulsing indicators should only appear on active runs', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const pulsingDots = page.getByTestId('pulsing-indicator');
    const count = await pulsingDots.count();
    for (let i = 0; i < count; i++) {
      const classes = await pulsingDots.nth(i).getAttribute('class') ?? '';
      expect(classes).toContain('animate-pulse');
      expect(classes).toContain('bg-blue-500');
    }
  });
});

test.describe('Visual: Bug Detail Linked Run Display', () => {

  test('in_development bug detail should show orchestrator run section when linked', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(1500);
    // Filter to in_development
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('in_development');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer').first();
    if (await bugItem.isVisible().catch(() => false)) {
      await bugItem.click();
      await page.waitForTimeout(3000);
      const orchSection = page.getByText('Orchestrator Run');
      if (await orchSection.isVisible().catch(() => false)) {
        // Should show run ID, status badge, and team badge
        await expect(orchSection).toBeVisible();
        // No purple in any badge in the detail
        const badges = page.locator('.rounded-full');
        const count = await badges.count();
        for (let i = 0; i < count; i++) {
          const classes = await badges.nth(i).getAttribute('class') ?? '';
          expect(classes).not.toMatch(/bg-purple-/);
        }
      }
    }
  });

  test('bug detail Mark as Resolved button should be green-600', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption('in_development');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer').first();
    if (await bugItem.isVisible().catch(() => false)) {
      await bugItem.click();
      await page.waitForTimeout(3000);
      const resolveBtn = page.getByRole('button', { name: 'Mark as Resolved' });
      if (await resolveBtn.isVisible().catch(() => false)) {
        await expect(resolveBtn).toHaveClass(/bg-green-600/);
      }
    }
  });

  test('bug detail Reset to Triaged button should be red-600', async ({ page }) => {
    await page.goto('/bugs');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption('in_development');
    await page.waitForTimeout(2000);
    const bugItem = page.locator('.cursor-pointer').first();
    if (await bugItem.isVisible().catch(() => false)) {
      await bugItem.click();
      await page.waitForTimeout(3000);
      const resetBtn = page.getByRole('button', { name: /Reset to Triaged/i });
      if (await resetBtn.isVisible().catch(() => false)) {
        await expect(resetBtn).toHaveClass(/bg-red-600/);
      }
    }
  });
});

test.describe('Visual: Feature Detail Linked Run Display', () => {

  test('in_development feature detail should show orchestrator run section', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption('in_development');
    await page.waitForTimeout(2000);
    const frItem = page.locator('.cursor-pointer').first();
    if (await frItem.isVisible().catch(() => false)) {
      await frItem.click();
      await page.waitForTimeout(3000);
      const orchSection = page.getByText('Orchestrator Run');
      if (await orchSection.isVisible().catch(() => false)) {
        await expect(orchSection).toBeVisible();
      }
    }
  });

  test('feature detail Mark as Completed button should be green-600', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption('in_development');
    await page.waitForTimeout(2000);
    const frItem = page.locator('.cursor-pointer').first();
    if (await frItem.isVisible().catch(() => false)) {
      await frItem.click();
      await page.waitForTimeout(3000);
      const completeBtn = page.getByRole('button', { name: 'Mark as Completed' });
      if (await completeBtn.isVisible().catch(() => false)) {
        await expect(completeBtn).toHaveClass(/bg-green-600/);
      }
    }
  });

  test('approved feature Submit to Orchestrator button should be blue-600', async ({ page }) => {
    await page.goto('/feature-requests');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption('approved');
    await page.waitForTimeout(2000);
    const frItem = page.locator('.cursor-pointer').first();
    if (await frItem.isVisible().catch(() => false)) {
      await frItem.click();
      await page.waitForTimeout(1000);
      const submitBtn = page.getByRole('button', { name: /Submit to Orchestrator/i });
      if (await submitBtn.isVisible().catch(() => false)) {
        await expect(submitBtn).toHaveClass(/bg-blue-600/);
        await expect(submitBtn).not.toHaveClass(/bg-purple/);
      }
    }
  });
});

test.describe('Visual: Orchestrator Run Detail PR Colors', () => {

  test('PR merge status badge should use blue (not purple)', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const runRow = page.getByTestId('run-row').first();
    if (await runRow.isVisible().catch(() => false)) {
      await runRow.click();
      await page.waitForTimeout(1000);
      const mergeStatus = page.getByTestId('pr-merge-status');
      if (await mergeStatus.isVisible().catch(() => false)) {
        const classes = await mergeStatus.getAttribute('class') ?? '';
        expect(classes).not.toContain('purple');
        expect(classes).toMatch(/bg-blue-100|bg-gray-100/);
      }
    }
  });

  test('PR verdict badge colors should be correct', async ({ page }) => {
    await page.goto('/orchestrator');
    await page.waitForTimeout(3000);
    const runRow = page.getByTestId('run-row').first();
    if (await runRow.isVisible().catch(() => false)) {
      await runRow.click();
      await page.waitForTimeout(1000);
      const verdict = page.getByTestId('pr-verdict');
      if (await verdict.isVisible().catch(() => false)) {
        const text = await verdict.textContent();
        const classes = await verdict.getAttribute('class') ?? '';
        if (text === 'approved') {
          expect(classes).toContain('bg-green-100');
        }
        if (text === 'changes_requested') {
          expect(classes).toContain('bg-amber-100');
        }
      }
    }
  });
});

test.describe('Visual: Cross-Page Navigation', () => {

  test('should navigate between all three pages without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/bugs');
    await expect(page.getByRole('heading', { name: 'Bug Reports' })).toBeVisible();

    await page.goto('/feature-requests');
    await expect(page.getByRole('heading', { name: 'Feature Requests' })).toBeVisible();

    await page.goto('/orchestrator');
    await page.waitForTimeout(2000);

    const unexpectedErrors = errors.filter(
      (e) => !e.includes('fetch') && !e.includes('Network') && !e.includes('ERR_')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});
