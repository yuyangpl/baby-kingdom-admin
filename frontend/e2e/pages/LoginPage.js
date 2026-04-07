export class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"], input[placeholder*="admin@example.com"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"], button:has-text("Login")');
    this.errorMessage = page.locator('.el-message--error');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginAsAdmin() {
    await this.login('admin@dev.local', 'admin123');
  }

  async waitForRedirect() {
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  }
}
