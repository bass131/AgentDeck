import type { ElectronApplication, Page } from '@playwright/test'

export async function focusRestoredWindow(app: ElectronApplication, page: Page): Promise<void> {
  try {
    const win = await app.browserWindow(page)
    await win.evaluate((bw) => {
      if (typeof bw.isMinimized === 'function' && bw.isMinimized()) bw.restore()
      bw.show()
      bw.focus()
    })
  } catch {
  }
}
