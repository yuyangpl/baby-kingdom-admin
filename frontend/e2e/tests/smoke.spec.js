import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';

test.describe('Smoke Tests', () => {
  test('app loads and shows login page', async ({ page }) => {
    await page.goto('/');
    // Should redirect unauthenticated users to /login
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveTitle(/Baby Kingdom/i);
  });

  test('login page renders form elements', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
    await loginPage.waitForRedirect();

    // Should land on dashboard or feeds page
    expect(page.url()).not.toContain('/login');
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('bad@email.com', 'wrongpassword');

    await expect(loginPage.errorMessage).toBeVisible({ timeout: 5000 });
  });
});
