export class ScannerPage {
  constructor(page) {
    this.page = page;
    this.startButton = page.locator('button:has-text("Start"), button:has-text("Scan")');
    this.stopButton = page.locator('button:has-text("Stop")');
    this.statusIndicator = page.locator('[class*="status"], .scanner-status');
    this.resultsList = page.locator('[class*="results"], .scan-results');
    this.progressBar = page.locator('.el-progress');
  }

  async goto() {
    await this.page.goto('/scanner');
  }

  async waitForPage() {
    await this.page.waitForURL('**/scanner', { timeout: 10000 });
  }

  async startScan() {
    await this.startButton.click();
  }

  async stopScan() {
    await this.stopButton.click();
  }
}
