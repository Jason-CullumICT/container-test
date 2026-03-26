// Verifies: FR-070, FR-091
// E2E tests for cycle tab removal — orchestrator page shows runs directly

import { test, expect } from '@playwright/test';

test.describe('Feature: Remove Cycle Tab', () => {
  test('should render the orchestrator page with Orchestrator heading', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByRole('heading', { name: 'Orchestrator' })).toBeVisible();
  });

  // Verifies: FR-091
  test('should not have a tab bar', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByTestId('tab-bar')).not.toBeVisible();
  });

  // Verifies: FR-091
  test('should not have Cycles or Runs tab buttons', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByTestId('tab-cycles')).not.toBeVisible();
    await expect(page.getByTestId('tab-runs')).not.toBeVisible();
  });

  // Verifies: FR-091
  test('should show RunsTab content directly', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByTestId('runs-tab')).toBeVisible();
  });

  // Verifies: FR-091
  test('should show either runs table or empty state', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await page.waitForTimeout(2000);
    const hasTable = await page.getByTestId('runs-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('empty-state').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  // Verifies: FR-070
  test('should display subtitle indicating run dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173/orchestrator');
    await expect(page.getByText('Real-time orchestrator run dashboard')).toBeVisible();
  });

  test('should have no console errors during navigation', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('http://localhost:5173/orchestrator');
    await page.waitForTimeout(2000);
    expect(consoleErrors).toEqual([]);
  });
});
