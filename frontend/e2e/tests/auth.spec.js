import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { testUsers } from '../fixtures/users.js';

test.describe('Auth — login and logout', () => {
  test('admin login redirects to dashboard and logout returns to login', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Navigate to login
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();

    // Login as admin
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();

    // Verify dashboard is visible after login
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
    expect(page.url()).not.toContain('/login');

    // Verify sidebar navigation is visible
    await expect(page.locator('text=BK Admin')).toBeVisible();

    // Open user dropdown and logout
    await page.locator('.user-info, .username, .el-avatar').first().click();
    await page.locator('.el-dropdown-menu').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.el-dropdown-item:has-text("Logout")').click();

    // Verify redirected back to login page
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(loginPage.emailInput).toBeVisible();
  });
});
