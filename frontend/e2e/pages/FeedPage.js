export class FeedPage {
  constructor(page) {
    this.page = page;
    this.table = page.locator('.el-table');
    this.tableRows = page.locator('.el-table__row');
    this.statusTabs = page.locator('.el-tabs__item');
    this.approveButton = page.locator('button:has-text("Approve")');
    this.rejectButton = page.locator('button:has-text("Reject")');
    this.batchApproveButton = page.locator('button:has-text("Batch Approve")');
    this.newFeedsBanner = page.locator('[class*="new-feeds"], .new-feeds-banner');
  }

  async goto() {
    await this.page.goto('/feeds');
  }

  async waitForTable() {
    await this.table.waitFor({ state: 'visible', timeout: 10000 });
  }

  async selectTab(tabName) {
    await this.page.locator(`.el-tabs__item:has-text("${tabName}")`).click();
  }

  async getRowCount() {
    return await this.tableRows.count();
  }

  async clickFirstRowAction(actionText) {
    const firstRow = this.tableRows.first();
    await firstRow.locator(`button:has-text("${actionText}")`).click();
  }
}
