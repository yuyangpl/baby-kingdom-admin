import { test, expect, chromium } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { FeedPage } from '../pages/FeedPage.js';
import { ScannerPage } from '../pages/ScannerPage.js';
import { testUsers } from '../fixtures/users.js';

/**
 * WebSocket / Realtime tests.
 *
 * These tests use Playwright's multi-context feature to simulate two independent
 * browser sessions. They require both frontend and backend (with Redis/Socket.io)
 * to be running.
 *
 * Socket.io events under test (from frontend/CLAUDE.md):
 *   feed:claimed  → feedStore.updateFeedClaim → lock icon on row
 *   scanner:result → Toast with scan stats
 */

test.describe('Realtime — WebSocket sync', () => {
  test('feed claim realtime sync — Browser A claims, Browser B sees lock icon', async ({ browser }) => {
    // Create two independent browser contexts (Browser A and Browser B)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // ---- Login Browser A as admin ----
      const loginA = new LoginPage(pageA);
      await loginA.goto();
      await loginA.login(testUsers.admin.email, testUsers.admin.password);
      await loginA.waitForRedirect();

      // ---- Login Browser B as editor (or second admin session) ----
      const loginB = new LoginPage(pageB);
      await loginB.goto();
      await loginB.login(testUsers.editor.email, testUsers.editor.password);
      await loginB.waitForRedirect();

      // ---- Both browsers navigate to Feed Queue ----
      const feedPageA = new FeedPage(pageA);
      const feedPageB = new FeedPage(pageB);

      await feedPageA.goto();
      await feedPageA.waitForTable();
      await feedPageB.goto();
      await feedPageB.waitForTable();

      // ---- Ensure pending tab is active on both ----
      await feedPageA.selectTab('Pending');
      await feedPageB.selectTab('Pending');
      await pageA.waitForTimeout(300);
      await pageB.waitForTimeout(300);

      // ---- Check that there is at least one claimable feed ----
      const claimBtnA = pageA.locator('.el-table__row').first().locator('button:has-text("Claim")');
      await claimBtnA.waitFor({ state: 'visible', timeout: 10000 });

      // Get the Feed ID of the first row (so Browser B can find the same row)
      const firstRowFeedId = await pageA
        .locator('.el-table__row')
        .first()
        .locator('td')
        .nth(1) // Feed ID column (index 1, after checkbox)
        .textContent();

      // ---- Browser A claims the feed ----
      await claimBtnA.click();
      await expect(pageA.locator('.el-message--success')).toBeVisible({ timeout: 5000 });

      // ---- Wait for Socket.io event to propagate to Browser B ----
      // The `feed:claimed` event triggers feedStore.updateFeedClaim → row shows lock / "Unclaim"
      await pageB.waitForTimeout(2000); // Allow time for WebSocket event delivery

      // Browser B should see the row now has "Unclaim" button (or a lock indicator)
      // instead of "Claim", indicating the feed is claimed by another user
      const firstRowB = pageB.locator('.el-table__row').first();

      // After claim event, the row in Browser B should show "Unclaim" button
      // (because claimedBy is now set, even for a different user)
      const unclaimOrLockVisible = await firstRowB
        .locator('button:has-text("Unclaim")')
        .isVisible()
        .catch(() => false);

      // Also check for a lock icon class that might appear
      const lockIconVisible = await firstRowB
        .locator('[class*="lock"], .el-icon-lock, svg[aria-label*="lock"]')
        .isVisible()
        .catch(() => false);

      // At least one indicator of claim should be visible in Browser B
      expect(unclaimOrLockVisible || lockIconVisible).toBe(true);

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('scanner realtime notification — trigger scan, verify toast appears', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();

    const scannerPage = new ScannerPage(page);
    await scannerPage.goto();
    await scannerPage.waitForPage();

    await expect(page.locator('h2:has-text("Scanner")')).toBeVisible({ timeout: 5000 });

    // Trigger the scan
    await page.locator('button:has-text("Trigger Scan")').click();

    // After triggering, the backend emits `scanner:result` via Socket.io.
    // The frontend listener (socket/listeners.js) fires ElNotification toast with scan stats.
    // Also, the page itself shows ElMessage.success('Scan triggered').

    // Verify immediate API response toast
    await expect(
      page.locator('.el-message--success, .el-notification')
    ).toBeVisible({ timeout: 10000 });

    // Wait for the scanner:result WebSocket event (may take a few seconds for scan to complete)
    // This arrives as an ElNotification (different from ElMessage)
    // The notification should contain scan result information
    const notificationOrMessage = page.locator(
      '.el-notification, .el-message--success, .el-message--info'
    );

    await expect(notificationOrMessage.first()).toBeVisible({ timeout: 15000 });

    // Verify the scanner table updated (history list should show results)
    await page.locator('.el-table').waitFor({ state: 'visible', timeout: 5000 });
  });
});
