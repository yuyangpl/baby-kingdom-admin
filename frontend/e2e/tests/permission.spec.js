import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { FeedPage } from '../pages/FeedPage.js';
import { testUsers } from '../fixtures/users.js';

test.describe('Permission Control', () => {
  test('viewer cannot see Config, Audit Log, Users menu items', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.viewer.email, testUsers.viewer.password);
    await loginPage.waitForRedirect();

    // Open the System sub-menu to reveal its items
    const systemMenu = page.locator('.el-sub-menu:has(.el-menu-item[data-route="system"]), .el-menu').locator('li:has-text("System")').first();
    // Try clicking the System sub-menu title to expand it (if collapsed)
    const systemSubMenu = page.locator('.el-sub-menu__title:has-text("System")');
    if (await systemSubMenu.isVisible()) {
      await systemSubMenu.click();
    }

    // Admin-only menu items should NOT be visible for viewer role
    // According to AppLayout.vue: Config, Audit Log, Users have v-if="auth.isAdmin"
    await expect(page.locator('.el-menu-item:has-text("Config")')).not.toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("Audit Log")')).not.toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("Users")')).not.toBeVisible();

    // Queue Monitor should still be visible (no role restriction)
    // Attempt direct URL navigation to admin-only pages — should be redirected
    await page.goto('/config');
    // Router guard redirects unauthorized users to dashboard
    await page.waitForURL((url) => !url.pathname.includes('/config'), { timeout: 5000 });
    expect(page.url()).not.toContain('/config');

    await page.goto('/audit');
    await page.waitForURL((url) => !url.pathname.includes('/audit'), { timeout: 5000 });
    expect(page.url()).not.toContain('/audit');

    await page.goto('/users');
    await page.waitForURL((url) => !url.pathname.includes('/users'), { timeout: 5000 });
    expect(page.url()).not.toContain('/users');
  });

  test('queue management — view status, pause a queue, verify paused, then resume', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();

    await page.goto('/queues');
    await page.waitForURL('**/queues', { timeout: 10000 });
    await expect(page.locator('h2:has-text("Queue Monitor")')).toBeVisible({ timeout: 5000 });

    // Wait for queue cards to load
    await page.locator('.el-card').first().waitFor({ state: 'visible', timeout: 10000 });

    // Find a running queue and pause it
    const runningQueueCard = page.locator('.el-card').filter({
      has: page.locator('.el-tag:has-text("running")'),
    }).first();

    // If a running queue exists, pause it
    const runningCardCount = await runningQueueCard.count();
    if (runningCardCount > 0) {
      await runningQueueCard.locator('button:has-text("Pause")').click();

      // Verify success message
      await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });

      // Wait for the page to refresh queue status
      await page.waitForTimeout(1000);

      // The card should now show "paused" tag
      const pausedCard = page.locator('.el-card').filter({
        has: page.locator('.el-tag:has-text("paused")'),
      }).first();
      await expect(pausedCard).toBeVisible({ timeout: 5000 });

      // Resume the queue
      await pausedCard.locator('button:has-text("Resume")').click();
      await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });

      // Wait for status refresh
      await page.waitForTimeout(1000);
      const resumedCard = page.locator('.el-card').filter({
        has: page.locator('.el-tag:has-text("running")'),
      }).first();
      await expect(resumedCard).toBeVisible({ timeout: 5000 });
    } else {
      // No running queue found — still verify the page structure is correct
      const queueCards = page.locator('.el-card');
      const cardCount = await queueCards.count();
      expect(cardCount).toBeGreaterThan(0);
    }
  });

  test('batch approve — select multiple feeds, batch approve, verify status', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();

    const feedPage = new FeedPage(page);
    await feedPage.goto();
    await feedPage.waitForTable();

    // Switch to Pending tab
    await feedPage.selectTab('Pending');
    await page.waitForTimeout(500);

    // Check if there are rows to select
    const rowCount = await feedPage.getRowCount();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Select the first two rows via the checkbox column
    const checkboxes = page.locator('.el-table__row .el-checkbox');
    await checkboxes.nth(0).click();

    // If there's a second row, select it too
    if (rowCount >= 2) {
      await checkboxes.nth(1).click();
    }

    // Wait for selection to register — Batch Approve button should become enabled
    const batchApproveBtn = page.locator('button:has-text("Batch Approve")');
    await expect(batchApproveBtn).not.toBeDisabled({ timeout: 3000 });

    // Click Batch Approve
    await batchApproveBtn.click();

    // Verify success message (e.g. "1 feed(s) approved" or "2 feed(s) approved")
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });

    // Switch to Approved tab and verify feeds now appear there
    await feedPage.selectTab('Approved');
    await feedPage.waitForTable();
    const approvedCount = await feedPage.getRowCount();
    expect(approvedCount).toBeGreaterThanOrEqual(1);
  });
});
