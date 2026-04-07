import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { testUsers } from '../fixtures/users.js';

test.describe('Persona CRUD', () => {
  // Use a unique name per test run to avoid collisions
  const testPersonaName = `E2E-Persona-${Date.now()}`;
  const testAccountId = `e2e_acc_${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await loginPage.waitForRedirect();
    await page.goto('/personas');
    await page.waitForURL('**/personas', { timeout: 10000 });
    await expect(page.locator('h2:has-text("Personas")')).toBeVisible({ timeout: 5000 });
  });

  test('create → appears in list → edit → delete → disappears', async ({ page }) => {
    // --- CREATE ---
    await page.locator('button:has-text("Add Persona")').click();

    // Wait for drawer to open
    const drawer = page.locator('.el-drawer');
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await expect(drawer.locator(':has-text("Add Persona")')).toBeVisible();

    // Fill required fields
    await drawer.locator('input[placeholder*="acc_001"], label:has-text("Account ID") ~ div input').fill(testAccountId);
    await drawer.locator('label:has-text("Username") ~ div input, input[placeholder*="Display username"]').fill(testPersonaName);

    // Select archetype
    await drawer.locator('.el-select').click();
    await page.locator('.el-select-dropdown__item:has-text("First-time Mom"), .el-option:has-text("First-time Mom")').click();

    // Save
    await drawer.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').click();

    // Verify success message
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });

    // Drawer should close
    await expect(drawer).not.toBeVisible({ timeout: 5000 });

    // Wait for page to reload personas
    await page.waitForTimeout(500);

    // Verify new persona card appears in the list
    await expect(page.locator(`.el-card:has-text("${testPersonaName}")`)).toBeVisible({ timeout: 8000 });

    // --- EDIT ---
    const personaCard = page.locator(`.el-card:has-text("${testPersonaName}")`).first();
    await personaCard.locator('button:has-text("Edit")').click();

    // Wait for edit drawer
    const editDrawer = page.locator('.el-drawer');
    await editDrawer.waitFor({ state: 'visible', timeout: 5000 });
    await expect(editDrawer.locator(':has-text("Edit Persona")')).toBeVisible();

    // Update username
    const editedName = `${testPersonaName}-edited`;
    const usernameInput = editDrawer.locator('label:has-text("Username") ~ div input, input[placeholder*="Display username"]');
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.fill(editedName);

    // Save edit
    await editDrawer.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")').click();

    // Verify success
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });
    await expect(editDrawer).not.toBeVisible({ timeout: 5000 });

    // Verify updated name appears in list
    await page.waitForTimeout(500);
    await expect(page.locator(`.el-card:has-text("${editedName}")`)).toBeVisible({ timeout: 8000 });

    // --- DELETE ---
    const editedCard = page.locator(`.el-card:has-text("${editedName}")`).first();
    await editedCard.locator('button:has-text("Delete")').click();

    // Confirm popconfirm dialog
    const popconfirm = page.locator('.el-popconfirm__main, .el-popconfirm');
    await popconfirm.waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.el-popconfirm .el-button--primary, .el-popconfirm button:has-text("确定"), .el-popconfirm button:has-text("Yes")').click();

    // Verify deleted message
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });

    // Wait for reload
    await page.waitForTimeout(500);

    // Verify the persona no longer appears in the list
    await expect(page.locator(`.el-card:has-text("${editedName}")`)).not.toBeVisible({ timeout: 8000 });
  });

  test('config edit — modify a config value, save, refresh and verify persistence', async ({ page }) => {
    // Navigate to Config page
    await page.goto('/config');
    await page.waitForURL('**/config', { timeout: 10000 });
    await expect(page.locator('h2:has-text("System Config")')).toBeVisible({ timeout: 5000 });

    // Wait for config rows to load
    await page.locator('.config-row').first().waitFor({ state: 'visible', timeout: 10000 });

    // Find the first non-secret config input and its current value
    const firstConfigRow = page.locator('.config-row').first();
    const configKeyEl = firstConfigRow.locator('.config-key');
    const configKey = await configKeyEl.textContent();

    // Get the input (non-secret, non-textarea)
    const configInput = firstConfigRow.locator('input:not([type="password"])').first();
    const originalValue = await configInput.inputValue();

    // Set a test value
    const testValue = `e2e-test-value-${Date.now()}`;
    await configInput.click({ clickCount: 3 });
    await configInput.fill(testValue);

    // Click Save for that row
    await firstConfigRow.locator('button:has-text("Save")').click();

    // Verify success message
    await expect(page.locator(`.el-message--success`)).toBeVisible({ timeout: 8000 });

    // Reload the page
    await page.reload();
    await page.waitForURL('**/config', { timeout: 10000 });
    await page.locator('.config-row').first().waitFor({ state: 'visible', timeout: 10000 });

    // Verify the saved value persists after reload
    const reloadedInput = page.locator('.config-row').first().locator('input:not([type="password"])').first();
    const reloadedValue = await reloadedInput.inputValue();
    expect(reloadedValue).toBe(testValue);

    // Restore original value
    await reloadedInput.click({ clickCount: 3 });
    await reloadedInput.fill(originalValue);
    await page.locator('.config-row').first().locator('button:has-text("Save")').click();
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 8000 });
  });
});
