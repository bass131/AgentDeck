/**
 * zoom-baseline.spike.e2e.ts — FB1 줌 트랙 착수 전 baseline 스파이크 (QA, plan-auditor 🔴 봉합).
 *
 * 이것은 회귀 게이트가 아니라 *일회성 실증 프로브*다. 구현이 아닌 조사 — 앱 코드는 손대지 않고
 * Electron 기본 메뉴의 View 줌 role(zoomIn/zoomOut/resetZoom)이 커스텀 메뉴 미설정 상태에서
 * 이미 동작 중인지를 main 프로세스 introspection으로 덤프한다.
 *
 * ── 실증 질문 ─────────────────────────────────────────────────────────────────
 *  Q1. Menu.getApplicationMenu()가 null 아닌가? View 서브메뉴에 zoomin/zoomout/resetzoom role
 *      항목과 그 (기본)accelerator가 존재하는가?
 *  Q2. 그 role을 발화하면 zoomFactor/zoomLevel이 실제로 변하는가?
 *  Q3. 줌이 앱 재시작 후 유지되는가? (영속 없음이 예상 — 확인만)
 *
 * ── 왜 `.e2e.ts`인가 ─────────────────────────────────────────────────────────
 *  parent 예시는 `.spike.spec.ts`였으나 playwright.config.ts testMatch가 e2e 확장자만 잡아
 *  `.spec.ts`는 e2e 러너에 안 잡힌다. `zoom-baseline.spike.e2e.ts`는 (1) 파일명에 'spike' 포함,
 *  (2) e2e glob 매칭, (3) Vitest include(*.test.ts)·tsconfig(e2e 미포함)와 무관 → 기존 스위트
 *  무해. 실행: node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/zoom-baseline.spike.e2e.ts
 *
 * ⚠️ 프로브는 삭제하지 말 것(재조사용 보존). 아래 단언은 "기본 role 존재"라는 결정론적 핵심만
 *    검증하고, 발화 delta·영속은 console.log 관찰치로 남긴다(플레이키 방지).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MAIN = join(process.cwd(), 'out', 'main', 'index.js')

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    // theme-dark-cascade / isolatedBoot 관례: --user-data-dir를 main 앞에 두어 프로필 격리.
    args: [`--user-data-dir=${userDataDir}`, MAIN],
    env: { ...process.env, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // 온보딩 처리 불요 — 프로브는 main 프로세스(Menu·webContents)만 조사. 창/webContents는
  // firstWindow 시점에 이미 존재. 렌더 안정화만 짧게 대기.
  await page.waitForTimeout(1200)
  return { app, page }
}

test('Q1+Q2: 기본 메뉴 View 줌 role 존재 + role 발화 시 zoomFactor 변화 실측', async () => {
  const udd = mkdtempSync(join(tmpdir(), 'zoom-spike-udd-'))
  const { app } = await launch(udd)
  try {
    // ── Q1: 메뉴 트리 전체 직렬화 ─────────────────────────────────────────────
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
          // .accelerator = 명시 설정값(role은 보통 undefined). role 기본 액셀러레이터는
          // getDefaultRoleAccelerator()로만 노출된다 — 둘 다 덤프.
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

    // 줌 role 항목만 추려 명시적으로 덤프
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

    // ── Q2: role 발화 → zoomFactor 변화 관찰 ──────────────────────────────────
    // menuItem.click 래퍼는 (event, focusedWindow, focusedWebContents)를 받아 role을 실행한다.
    // Playwright 창은 OS 포커스가 없을 수 있어 focusedWebContents fallback이 null → no-op 위험.
    // 따라서 win/webContents를 명시 인자로 넘긴다(포커스 무관 실행 보장).
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
        // click 래퍼를 명시 컨텍스트로 호출 → executeRole이 wc를 받아 setZoomLevel 수행.
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

    // ── 결정론적 핵심 단언(플레이키 없는 부분만): 기본 메뉴 존재 + 줌 role 3종 존재 ──
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
    // ── launch 1: 줌을 강제 변경(role 발화 무관하게 결정론적으로 setZoomLevel) 후 종료 ──
    const l1 = await launch(udd)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set1 = await l1.app.evaluate(({ BrowserWindow }: any) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      const before = { factor: wc.zoomFactor, level: wc.zoomLevel }
      wc.setZoomLevel(2) // factor ≈ 1.44 — 명확한 비-기본값
      return { before, after: { factor: wc.zoomFactor, level: wc.zoomLevel } }
    })
    console.log('[zoom-spike][Q3] launch1 before  =', JSON.stringify(set1.before))
    console.log('[zoom-spike][Q3] launch1 setLvl2 =', JSON.stringify(set1.after))
    await l1.app.close()
    await new Promise((r) => setTimeout(r, 800)) // 프로필 flush 여유

    // ── launch 2: 동일 userData → 부팅 직후 줌 상태 확인 ──
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

    // 단언 없음(Q3은 관찰 전용) — persisted 값은 위 로그로 보고에 인용.
    expect(typeof read2.level).toBe('number')
  } finally {
    rmSync(udd, { recursive: true, force: true })
  }
})
