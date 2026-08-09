import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, MAIN],
    env: { ...process.env, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1200)
  return { app, page }
}

test('Q1+Q2: 기본 메뉴 View 줌 role 존재 + role 발화 시 zoomFactor 변화 실측', async () => {
  const udd = mkdtempSync(join(tmpdir(), 'zoom-spike-udd-'))
  const { app } = await launch(udd)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structure = await app.evaluate(({ Menu, BrowserWindow }: any) => {
      const menu = Menu.getApplicationMenu()
      const win = BrowserWindow.getAllWindows()[0]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serialize = (items: any[]): any[] =>
        items.map((mi) => ({
          label: mi.label,
          role: mi.role ?? null,
          type: mi.type,
          enabled: mi.enabled,
          visible: mi.visible,
          explicitAccelerator: mi.accelerator ?? null,
          defaultRoleAccelerator:
            typeof mi.getDefaultRoleAccelerator === 'function'
              ? (mi.getDefaultRoleAccelerator() ?? null)
              : null,
          submenu: mi.submenu ? serialize(mi.submenu.items) : null
        }))

      return {
        menuIsNull: menu === null,
        topLevelLabels: menu ? menu.items.map((i: { label: string }) => i.label) : [],
        tree: menu ? serialize(menu.items) : null,
        initialZoomFactor: win ? win.webContents.zoomFactor : null,
        initialZoomLevel: win ? win.webContents.zoomLevel : null
      }
    })

    console.log('[zoom-spike][Q1] menuIsNull =', structure.menuIsNull)
    console.log('[zoom-spike][Q1] topLevelLabels =', JSON.stringify(structure.topLevelLabels))
    console.log('[zoom-spike][Q1] initial zoomFactor =', structure.initialZoomFactor,
      '| zoomLevel =', structure.initialZoomLevel)
    console.log('[zoom-spike][Q1] FULL MENU TREE =\n' + JSON.stringify(structure.tree, null, 2))

    const zoomRoles = ['zoomin', 'zoomout', 'resetzoom']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flat: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (items: any[] | null, path: string): void => {
      if (!items) return
      for (const mi of items) {
        const here = path ? `${path} > ${mi.label || mi.role || mi.type}` : (mi.label || mi.role || mi.type)
        if (mi.role && zoomRoles.includes(String(mi.role).toLowerCase())) {
          flat.push({ path: here, role: mi.role, explicitAccelerator: mi.explicitAccelerator, defaultRoleAccelerator: mi.defaultRoleAccelerator, enabled: mi.enabled })
        }
        walk(mi.submenu, here)
      }
    }
    walk(structure.tree, '')
    console.log('[zoom-spike][Q1] ZOOM ROLE 항목 =\n' + JSON.stringify(flat, null, 2))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const behavior = await app.evaluate(({ Menu, BrowserWindow }: any) => {
      const menu = Menu.getApplicationMenu()
      const win = BrowserWindow.getAllWindows()[0]
      const wc = win.webContents
      win.show()
      win.focus()
      wc.focus()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findByRole = (items: any[], role: string): any => {
        for (const mi of items) {
          if (mi.role && String(mi.role).toLowerCase() === role) return mi
          if (mi.submenu) {
            const f = findByRole(mi.submenu.items, role)
            if (f) return f
          }
        }
        return null
      }

      const invoke = (role: string) => {
        const item = menu ? findByRole(menu.items, role) : null
        if (!item) return { found: false }
        try {
          item.click(undefined, win, wc)
        } catch (e) {
          return { found: true, clickError: String(e) }
        }
        return { found: true }
      }

      const snap = () => ({ factor: wc.zoomFactor, level: wc.zoomLevel })

      const before = snap()
      const inA = invoke('zoomin')
      const afterIn1 = snap()
      const inB = invoke('zoomin')
      const afterIn2 = snap()
      const rout = invoke('zoomout')
      const afterOut = snap()
      const rreset = invoke('resetzoom')
      const afterReset = snap()

      return { before, inA, afterIn1, inB, afterIn2, rout, afterOut, rreset, afterReset }
    })

    console.log('[zoom-spike][Q2] before        =', JSON.stringify(behavior.before))
    console.log('[zoom-spike][Q2] zoomin found  =', JSON.stringify(behavior.inA))
    console.log('[zoom-spike][Q2] after zoomIn#1 =', JSON.stringify(behavior.afterIn1))
    console.log('[zoom-spike][Q2] after zoomIn#2 =', JSON.stringify(behavior.afterIn2))
    console.log('[zoom-spike][Q2] after zoomOut  =', JSON.stringify(behavior.afterOut))
    console.log('[zoom-spike][Q2] after reset    =', JSON.stringify(behavior.afterReset))

    expect(structure.menuIsNull, '기본 메뉴가 설정돼 있어야 함(getApplicationMenu ≠ null)').toBe(false)
    const foundRoles = flat.map((f) => String(f.role).toLowerCase())
    expect(foundRoles).toContain('zoomin')
    expect(foundRoles).toContain('zoomout')
    expect(foundRoles).toContain('resetzoom')
  } finally {
    await app.close().catch(() => {})
    rmSync(udd, { recursive: true, force: true })
  }
})

test('Q3: 줌 변경이 앱 재시작 후 유지되는가 (동일 userData 2회 launch)', async () => {
  const udd = mkdtempSync(join(tmpdir(), 'zoom-spike-persist-udd-'))
  try {
    const l1 = await launch(udd)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set1 = await l1.app.evaluate(({ BrowserWindow }: any) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      const before = { factor: wc.zoomFactor, level: wc.zoomLevel }
      wc.setZoomLevel(2)
      return { before, after: { factor: wc.zoomFactor, level: wc.zoomLevel } }
    })
    console.log('[zoom-spike][Q3] launch1 before  =', JSON.stringify(set1.before))
    console.log('[zoom-spike][Q3] launch1 setLvl2 =', JSON.stringify(set1.after))
    await l1.app.close()
    await new Promise((r) => setTimeout(r, 800))

    const l2 = await launch(udd)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read2 = await l2.app.evaluate(({ BrowserWindow }: any) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      return { factor: wc.zoomFactor, level: wc.zoomLevel }
    })
    console.log('[zoom-spike][Q3] launch2 onBoot  =', JSON.stringify(read2))
    const persisted = Math.abs(read2.level - 2) < 0.001
    console.log('[zoom-spike][Q3] PERSISTED? =', persisted, '(true=재시작 후 유지됨 / false=기본값 복귀)')
    await l2.app.close()

    expect(typeof read2.level).toBe('number')
  } finally {
    rmSync(udd, { recursive: true, force: true })
  }
})
