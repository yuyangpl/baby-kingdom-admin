import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { FeedPage } from '../pages/FeedPage.js';
import { testUsers } from '../fixtures/users.js';

test.describe('Feed Workflow', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();
  });

  test('full review flow — claim, edit content, approve', async ({ page }) => {
    const feedPage = new FeedPage(page);
    await feedPage.goto();
    await feedPage.waitForTable();

    // Ensure we are on the Pending tab
    await feedPage.selectTab('Pending');
    await page.waitForTimeout(500);

    // Claim the first available feed (has "Claim" button, not "Unclaim")
    const claimBtn = page.locator('.el-table__row').first().locator('button:has-text("Claim")');
    await claimBtn.waitFor({ state: 'visible', timeout: 10000 });
    await claimBtn.click();

    // Verify claim success message
    await expect(page.locator('.el-message:has-text("claimed"), .el-message--success')).toBeVisible({ timeout: 5000 });

    // Open the Edit modal for the first row
    const editBtn = page.locator('.el-table__row').first().locator('button:has-text("Edit")');
    await editBtn.click();

    // Wait for the Edit Feed Content dialog
    await expect(page.locator('.el-dialog:has-text("Edit Feed Content")')).toBeVisible({ timeout: 5000 });

    // Clear and edit the content textarea
    const contentTextarea = page.locator('.el-dialog textarea').first();
    await contentTextarea.click({ clickCount: 3 });
    await contentTextarea.fill('E2E test edited content — approved review flow');

    // Click Save & Approve
    await page.locator('.el-dialog button:has-text("Save & Approve"), .el-dialog button:has-text("Save &amp; Approve")').click();

    // Verify success notification
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });

    // Dialog should close
    await expect(page.locator('.el-dialog:has-text("Edit Feed Content")')).not.toBeVisible({ timeout: 5000 });

    // Switch to Approved tab and verify the feed appears there
    await feedPage.selectTab('Approved');
    await feedPage.waitForTable();
    const approvedRows = await feedPage.getRowCount();
    expect(approvedRows).toBeGreaterThanOrEqual(1);
  });

  test('reject flow — claim, fill notes, reject, verify status', async ({ page }) => {
    const feedPage = new FeedPage(page);
    await feedPage.goto();
    await feedPage.waitForTable();

    // Ensure Pending tab is active
    await feedPage.selectTab('Pending');
    await page.waitForTimeout(500);

    // Claim first available feed
    const claimBtn = page.locator('.el-table__row').first().locator('button:has-text("Claim")');
    await claimBtn.waitFor({ state: 'visible', timeout: 10000 });
    await claimBtn.click();
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });

    // Click Reject on the first row
    await page.locator('.el-table__row').first().locator('button:has-text("Reject")').click();

    // MessageBox prompt appears — fill in rejection notes
    const promptDialog = page.locator('.el-message-box');
    await promptDialog.waitFor({ state: 'visible', timeout: 5000 });
    const notesInput = promptDialog.locator('textarea');
    await notesInput.fill('E2E test rejection reason');

    // Confirm rejection
    await promptDialog.locator('button:has-text("Reject")').click();

    // Verify success message
    await expect(page.locator('.el-message--success:has-text("rejected"), .el-message--success')).toBeVisible({ timeout: 8000 });

    // Switch to Rejected tab and verify feed appears
    await feedPage.selectTab('Rejected');
    await feedPage.waitForTable();
    const rejectedRows = await feedPage.getRowCount();
    expect(rejectedRows).toBeGreaterThanOrEqual(1);
  });

  test('custom generate — fill topic, submit, verify new feed appears', async ({ page }) => {
    const feedPage = new FeedPage(page);
    await feedPage.goto();
    await feedPage.waitForTable();

    // Record current row count on pending tab
    await feedPage.selectTab('Pending');
    await feedPage.waitForTable();
    const rowsBefore = await feedPage.getRowCount();

    // Open Custom Generate modal
    await page.locator('button:has-text("Custom Generate")').click();

    // Wait for modal to appear
    const dialog = page.locator('.el-dialog:has-text("Custom Generate")');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    // Fill in the Topic field (required)
    const topicInput = dialog.locator('input').first();
    await topicInput.fill('E2E test topic — 孕期營養飲食建議');

    // Click Generate
    await dialog.locator('button:has-text("Generate")').click();

    // Generation may take a moment — wait for success or dialog close
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 30000 });

    // Dialog should close after success
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Reload feeds and verify row count increased
    await page.reload();
    await feedPage.waitForTable();
    const rowsAfter = await feedPage.getRowCount();
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  });
});
