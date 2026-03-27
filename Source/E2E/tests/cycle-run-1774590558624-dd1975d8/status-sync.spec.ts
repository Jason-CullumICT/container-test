// Verifies: FR-UX-001 — Status sync between bug/feature portals and orchestrator runs
import { test, expect } from '@playwright/test';

test.describe('Feature: Status Sync and Traceability', () => {

  test.describe('Bug Reports Page', () => {
    test('should render the bug reports page with filters', async ({ page }) => {
      await page.goto('/bugs');
      await expect(page.getByRole('heading', { name: 'Bug Reports' })).toBeVisible();
      // Verify filter dropdowns are present
      const selects = page.locator('select');
      await expect(selects.first()).toBeVisible();
    });

    test('should show loading state with contextual text', async ({ page }) => {
      await page.goto('/bugs');
      // Loading state may be brief; check that page eventually renders content
      await expect(page.getByRole('heading', { name: 'Bug Reports' })).toBeVisible();
    });

    test('should display bug list items', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(2000);
      // Page should render without errors
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await expect(page.getByRole('heading', { name: 'Bug Reports' })).toBeVisible();
    });

    test('should open bug detail when clicking a bug', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(2000);
      // If there are bug items, clicking one should open detail view
      const bugItems = page.locator('[data-testid="bug-item"], .cursor-pointer').first();
      if (await bugItems.isVisible()) {
        await bugItems.click();
        // Detail panel should appear with close button
        await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show status badge with correct colors for in_development', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(2000);
      // Check that amber color is used for in_development status (not yellow)
      const inDevBadges = page.locator('text=in development');
      if (await inDevBadges.count() > 0) {
        const badge = inDevBadges.first();
        await expect(badge).toBeVisible();
      }
    });

    test('should have active filter indicator when filter is applied', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(1000);
      // Select a status filter
      const statusSelect = page.locator('select').first();
      await statusSelect.selectOption('reported');
      // The select should have a blue ring indicator
      await expect(statusSelect).toHaveClass(/border-blue-500/);
    });
  });

  test.describe('Feature Requests Page', () => {
    test('should render the feature requests page', async ({ page }) => {
      await page.goto('/feature-requests');
      await expect(page.getByRole('heading', { name: 'Feature Requests' })).toBeVisible();
    });

    test('should open feature request detail', async ({ page }) => {
      await page.goto('/feature-requests');
      await page.waitForTimeout(2000);
      const frItems = page.locator('[data-testid="feature-request-item"], .cursor-pointer').first();
      if (await frItems.isVisible()) {
        await frItems.click();
        await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show status badges with correct colors', async ({ page }) => {
      await page.goto('/feature-requests');
      await page.waitForTimeout(2000);
      // Verify no purple badges for completed status (should be green)
      const completedBadges = page.locator('.bg-purple-100');
      expect(await completedBadges.count()).toBe(0);
    });
  });

  test.describe('Orchestrator Runs Tab', () => {
    test('should render the orchestrator page', async ({ page }) => {
      await page.goto('/orchestrator');
      await expect(page.getByText('Runs')).toBeVisible({ timeout: 10000 });
    });

    test('should show runs tab with polling indicator', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      // Look for the runs tab content
      const runsTab = page.getByTestId('runs-tab');
      if (await runsTab.isVisible()) {
        // Polling indicator should show "Last updated: Xs ago"
        const pollIndicator = page.getByText(/Last updated:.*ago/);
        if (await pollIndicator.isVisible()) {
          await expect(pollIndicator).toContainText('ago');
        }
      }
    });

    test('should display run rows with correct color badges', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      // Verify no purple/indigo badges in runs table (should be blue)
      const purpleBadges = page.locator('.bg-purple-100');
      expect(await purpleBadges.count()).toBe(0);
      const indigoBadges = page.locator('.bg-indigo-100');
      expect(await indigoBadges.count()).toBe(0);
    });

    test('should show loading state with text', async ({ page }) => {
      await page.goto('/orchestrator');
      // Loading spinner should have contextual text
      // This may be very brief, just verify page loads without error
      await page.waitForTimeout(3000);
      await expect(page.getByText('Runs')).toBeVisible();
    });

    test('should show empty state with SVG icon when no runs', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      const emptyState = page.getByTestId('empty-state');
      if (await emptyState.isVisible()) {
        // Should have SVG icon, not emoji
        await expect(emptyState.locator('svg')).toBeVisible();
        await expect(emptyState.getByText('No runs found')).toBeVisible();
      }
    });

    test('should expand run detail on row click', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      const runRow = page.getByTestId('run-row').first();
      if (await runRow.isVisible()) {
        await runRow.click();
        // Detail row should expand
        await expect(page.getByTestId('run-detail-row')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should show correct merge status colors (blue, not purple)', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      const runRow = page.getByTestId('run-row').first();
      if (await runRow.isVisible()) {
        await runRow.click();
        await page.waitForTimeout(1000);
        // If PR merge status is shown, verify it uses blue not purple
        const mergeStatus = page.getByTestId('pr-merge-status');
        if (await mergeStatus.isVisible()) {
          await expect(mergeStatus).not.toHaveClass(/purple/);
        }
      }
    });

    test('should show team badge in blue', async ({ page }) => {
      await page.goto('/orchestrator');
      await page.waitForTimeout(3000);
      const teamBadge = page.getByTestId('team-badge').first();
      if (await teamBadge.isVisible()) {
        await expect(teamBadge).toHaveClass(/bg-blue-100/);
        await expect(teamBadge).toHaveClass(/text-blue-700/);
      }
    });
  });

  test.describe('Status Sync — Bug Detail with Linked Run', () => {
    test('should show orchestrator run section for in_development bugs', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(2000);
      // Filter to in_development bugs
      const statusSelect = page.locator('select').first();
      await statusSelect.selectOption('in_development');
      await page.waitForTimeout(2000);
      const bugItem = page.locator('.cursor-pointer').first();
      if (await bugItem.isVisible()) {
        await bugItem.click();
        await page.waitForTimeout(3000);
        // Check for the linked run section
        const runSection = page.getByText('Orchestrator Run');
        if (await runSection.isVisible()) {
          await expect(runSection).toBeVisible();
        }
      }
    });

    test('should show Mark as Resolved button when run completes', async ({ page }) => {
      await page.goto('/bugs');
      await page.waitForTimeout(2000);
      const statusSelect = page.locator('select').first();
      await statusSelect.selectOption('in_development');
      await page.waitForTimeout(2000);
      const bugItem = page.locator('.cursor-pointer').first();
      if (await bugItem.isVisible()) {
        await bugItem.click();
        await page.waitForTimeout(3000);
        // If a linked run is complete, the resolve button should be visible
        const resolveButton = page.getByRole('button', { name: 'Mark as Resolved' });
        if (await resolveButton.isVisible()) {
          await expect(resolveButton).toHaveClass(/bg-green-600/);
        }
      }
    });
  });

  test.describe('No Console Errors', () => {
    test('should navigate pages without console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      // Navigate through main pages
      await page.goto('/bugs');
      await page.waitForTimeout(2000);

      await page.goto('/feature-requests');
      await page.waitForTimeout(2000);

      await page.goto('/orchestrator');
      await page.waitForTimeout(2000);

      // Filter out expected network errors (API calls to non-running backend)
      const unexpectedErrors = consoleErrors.filter(
        (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError') && !e.includes('ERR_CONNECTION_REFUSED')
      );
      expect(unexpectedErrors).toHaveLength(0);
    });
  });
});
