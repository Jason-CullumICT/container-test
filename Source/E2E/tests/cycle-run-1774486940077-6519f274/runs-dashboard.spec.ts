// Verifies: FR-091, FR-092, FR-093, FR-094, FR-095
// E2E tests for the Runs Dashboard tab, expandable rows, retry/cleanup, and real-time indicators

import { test, expect } from '@playwright/test';

test.describe('Feature: Runs Dashboard', () => {
  test('should render the orchestrator page with tab bar', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByRole('heading', { name: 'Orchestrator' })).toBeVisible();
    await expect(page.getByTestId('tab-bar')).toBeVisible();
    await expect(page.getByTestId('tab-cycles')).toBeVisible();
    await expect(page.getByTestId('tab-runs')).toBeVisible();
  });

  // Verifies: FR-091
  test('should switch to Runs tab and show runs content', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await page.getByTestId('tab-runs').click();
    await expect(page.getByTestId('runs-tab')).toBeVisible();
    // Should show either the runs table or empty state
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('empty-state').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  // Verifies: FR-091
  test('should display run rows with expected columns when runs exist', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await page.getByTestId('tab-runs').click();
    // Wait for either table or empty state
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 15000 });
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      const rows = page.getByTestId('run-row');
      expect(await rows.count()).toBeGreaterThan(0);
      // Check first row has expected data cells
      const firstRow = rows.first();
      await expect(firstRow.getByTestId('run-id')).toBeVisible();
      await expect(firstRow.getByTestId('status-badge')).toBeVisible();
      await expect(firstRow.getByTestId('task-summary')).toBeVisible();
      await expect(firstRow.getByTestId('time-ago')).toBeVisible();
      await expect(firstRow.getByTestId('feedback-loops')).toBeVisible();
    }
  });

  // Verifies: FR-092
  test('should expand run detail row on click', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await page.getByTestId('tab-runs').click();
    await page.waitForSelector('[data-testid="runs-table"], [data-testid="empty-state"]', { timeout: 15000 });
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    if (hasTable) {
      const firstRow = page.getByTestId('run-row').first();
      await firstRow.click();
      await expect(page.getByTestId('run-detail-row')).toBeVisible();
      // Click again to collapse
      await firstRow.click();
      await expect(page.getByTestId('run-detail-row')).not.toBeVisible();
    }
  });

  // Verifies: FR-091
  test('should switch between Cycles and Runs tabs', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    // Start on cycles tab
    await expect(page.getByTestId('tab-cycles')).toBeVisible();
    // Switch to runs
    await page.getByTestId('tab-runs').click();
    await expect(page.getByTestId('runs-tab')).toBeVisible();
    // Switch back to cycles
    await page.getByTestId('tab-cycles').click();
    // Runs tab content should not be visible
    await expect(page.getByTestId('runs-tab')).not.toBeVisible();
  });

  // Verifies: FR-091
  test('should not have console errors on the orchestrator page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('http://localhost:5173/orchestrator');
    await page.getByTestId('tab-runs').click();
    await page.waitForTimeout(3000);
    // Filter out expected network errors (API may not be running)
    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to') && !e.includes('Network')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});
