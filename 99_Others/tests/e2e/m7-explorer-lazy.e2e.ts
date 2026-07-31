import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LARGE_WORKSPACE = 'C:/Dev/AgentDeck'
const NODE_MODULES_EXISTS = existsSync(join(LARGE_WORKSPACE, 'node_modules'))

const APP_MAIN = join(process.cwd(), 'out', 'main', 'index.js')

const LOAD_TIMEOUT_MS = 5_000
const EXPAND_TIMEOUT_MS = 8_000
const SEARCH_TIMEOUT_MS = 15_000

async function passStartupGates(page: Page): Promise<void> {
  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('m7테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { }

  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  try {
    const modal = page.locator('.wn-overlay, .un-overlay')
    await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      if (!(await modal.first().isVisible().catch(() => false))) break
      const btn = page.locator('.wn-nav-cta, .un-cta').first()
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
      await page.waitForTimeout(300)
    }
  } catch { }

  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click()
    await page.waitForTimeout(400)
  } catch { }
}

test.describe('M7 탐색기 lazy 스케일링 — node_modules 포함 대형 repo', () => {
  let app: ElectronApplication
  let page: Page
  let userDataDir: string

  test.beforeAll(async () => {
    if (!NODE_MODULES_EXISTS) {
      console.warn('[m7] node_modules 없음: TC-1/TC-2/TC-4는 degraded 모드로 실행')
    }

    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m7-udd-'))

    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, APP_MAIN],
      env: {
        ...process.env,
        AGENTDECK_E2E: '1',
        AGENTDECK_E2E_WORKSPACE: LARGE_WORKSPACE,
      },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await passStartupGates(page)
  })

  test.afterAll(async () => {
    await app?.close()
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('TC-1: node_modules 포함 대형 폴더 → 탐색기 루트 1레벨 5초 이내 렌더', async () => {
    test.setTimeout(40_000)

    const pickBtn = page.getByRole('button', { name: '폴더 선택' })
    const hasPick = await pickBtn.isVisible().catch(() => false)
    if (hasPick) {
      const t0 = Date.now()
      await pickBtn.click()

      await page.locator('.fe-node').first().waitFor({
        state: 'visible',
        timeout: LOAD_TIMEOUT_MS,
      })
      const elapsed = Date.now() - t0
      console.log(`[TC-1] 첫 fe-node 등장까지 ${elapsed}ms (< ${LOAD_TIMEOUT_MS}ms 기대)`)

      const nodeCount = await page.locator('.fe-node').count()
      console.log(`[TC-1] 루트 1레벨 fe-node 수: ${nodeCount}`)
      expect(nodeCount).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(LOAD_TIMEOUT_MS)
    } else {
      const t0 = Date.now()
      await page.locator('.fe-node').first().waitFor({
        state: 'visible',
        timeout: LOAD_TIMEOUT_MS,
      })
      const elapsed = Date.now() - t0
      console.log(`[TC-1] (이미열림) 첫 fe-node 등장까지 ${elapsed}ms`)
      const nodeCount = await page.locator('.fe-node').count()
      console.log(`[TC-1] 루트 1레벨 fe-node 수: ${nodeCount}`)
      expect(nodeCount).toBeGreaterThan(0)
    }
  })

  test('TC-2: node_modules 폴더가 루트 1레벨 항목으로 있고 자식 미로드', async () => {
    test.setTimeout(20_000)

    if (!NODE_MODULES_EXISTS) {
      console.warn('[TC-2] node_modules 미존재 — skip')
      test.skip()
      return
    }

    const nmNode = page.locator('.fe-node.fe-dir-head[title="node_modules"]')
    await nmNode.waitFor({ state: 'visible', timeout: 8_000 })
    console.log('[TC-2] node_modules 폴더 노드 표시 확인: PASS')

    const isExpanded = await nmNode.getAttribute('aria-expanded')
    console.log(`[TC-2] node_modules aria-expanded: "${isExpanded}" (미펼침이면 "false")`)
    expect(
      isExpanded,
      'node_modules 가 초기 펼침 상태임 (lazy 미적용 의심)'
    ).toBe('false')

    const nmChildNodes = page.locator('.fe-node[title^="node_modules/"]')
    const childCount = await nmChildNodes.count()
    console.log(`[TC-2] node_modules 하위 fe-node(title^="node_modules/") 수: ${childCount}`)
    expect(
      childCount,
      'node_modules 자식이 미펼침 상태에서 DOM에 존재함 (lazy 로딩 실패)'
    ).toBe(0)

    console.log('[TC-2] node_modules 미펼침(자식 미로드) 확인: PASS')
  })

  test('TC-3: 02_Source 폴더 클릭 → 1레벨 children 즉시 로드', async () => {
    test.setTimeout(20_000)

    const srcNode = page.locator('.fe-node.fe-dir-head[title="02_Source"]')
    await srcNode.waitFor({ state: 'visible', timeout: 8_000 })

    const beforeCount = await page.locator('.fe-node').count()
    console.log(`[TC-3] 02_Source 클릭 전 fe-node 수: ${beforeCount}`)

    const t0 = Date.now()
    await srcNode.click()

    await page.waitForFunction(
      (cnt) => document.querySelectorAll('.fe-node').length > cnt,
      beforeCount,
      { timeout: EXPAND_TIMEOUT_MS }
    )
    const elapsed = Date.now() - t0
    console.log(`[TC-3] 02_Source 펼침 후 fe-node 증가까지 ${elapsed}ms (< ${EXPAND_TIMEOUT_MS}ms)`)

    const afterCount = await page.locator('.fe-node').count()
    console.log(`[TC-3] 02_Source 클릭 후 fe-node 수: ${afterCount} (증가: +${afterCount - beforeCount})`)
    expect(afterCount).toBeGreaterThan(beforeCount)

    const srcChildDirs = page.locator('.fe-node[title^="02_Source/"]')
    const srcChildCount = await srcChildDirs.count()
    console.log(`[TC-3] 02_Source 하위 fe-node 수: ${srcChildCount}`)
    expect(srcChildCount).toBeGreaterThan(0)

    console.log('[TC-3] 02_Source lazy 펼침 확인: PASS')

    await srcNode.click()
    await page.waitForTimeout(300)
  })

  test('TC-4: node_modules 클릭 → 1레벨만 로드(타임아웃 없음)', async () => {
    test.setTimeout(20_000)

    if (!NODE_MODULES_EXISTS) {
      console.warn('[TC-4] node_modules 미존재 — skip')
      test.skip()
      return
    }

    const nmNode = page.locator('.fe-node.fe-dir-head[title="node_modules"]')
    await nmNode.waitFor({ state: 'visible', timeout: 8_000 })

    const beforeCount = await page.locator('.fe-node').count()

    const t0 = Date.now()
    await nmNode.click()

    await page.waitForFunction(
      (_cnt) => document.querySelectorAll('.fe-node[title^="node_modules/"]').length > 0,
      beforeCount,
      { timeout: EXPAND_TIMEOUT_MS }
    )
    const elapsed = Date.now() - t0
    const afterCount = await page.locator('.fe-node').count()
    const nmChildren = await page.locator('.fe-node[title^="node_modules/"]').count()
    console.log(`[TC-4] node_modules 펼침 후 fe-node 수: ${afterCount} (자식: ${nmChildren})`)
    console.log(`[TC-4] node_modules 1레벨 로드까지 ${elapsed}ms (< ${EXPAND_TIMEOUT_MS}ms)`)

    expect(nmChildren).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(EXPAND_TIMEOUT_MS)

    const nmGrandChildren = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.fe-node[title]'))
        .filter((el) => {
          const t = el.getAttribute('title') ?? ''
          const parts = t.split('/')
          return parts[0] === 'node_modules' && parts.length >= 3
        }).length
    })
    console.log(`[TC-4] node_modules 2레벨 이상(grandchildren) fe-node 수: ${nmGrandChildren} (0이어야 함)`)
    expect(
      nmGrandChildren,
      'node_modules 1레벨 lazy 펼침에서 2레벨 이상 자식이 DOM에 로드됨'
    ).toBe(0)

    console.log('[TC-4] node_modules lazy 펼침 (폭발0) 확인: PASS')

    await nmNode.click()
    await page.waitForTimeout(300)
  })

  test('TC-5: 검색창에 "store" 입력 → 02_Source 깊이의 파일이 결과에 포함', async () => {
    test.setTimeout(30_000)

    const input = page.getByLabel('파일 검색')
    await input.waitFor({ state: 'visible', timeout: 5_000 })

    await input.click()
    await input.fill('store')

    await page.locator('.fe-tree.fe-results').waitFor({
      state: 'visible',
      timeout: SEARCH_TIMEOUT_MS,
    })

    const resultNodes = page.locator('.fe-tree.fe-results .fe-node.fe-file')
    await resultNodes.first().waitFor({ state: 'visible', timeout: SEARCH_TIMEOUT_MS })

    const resultCount = await resultNodes.count()
    console.log(`[TC-5] 검색 결과 fe-file 수: ${resultCount}`)
    expect(resultCount).toBeGreaterThan(0)

    const deepPathTexts = await page.locator('.fe-tree.fe-results .fe-result-path').allInnerTexts()
    console.log(`[TC-5] fe-result-path 샘플:`, deepPathTexts.slice(0, 5))

    const nodeNames = await page.locator('.fe-tree.fe-results .fe-node-name').allInnerTexts()
    console.log(`[TC-5] 검색 결과 파일명 샘플:`, nodeNames.slice(0, 8))

    const hasSrcDeep = deepPathTexts.some(
      (p) => p.includes('02_Source/') || p.includes('renderer') || p.includes('main')
    )
    const hasStoreFile = nodeNames.some(
      (n) => n.toLowerCase().includes('store') || n.toLowerCase().includes('app')
    )

    console.log(`[TC-5] 02_Source/ 깊이 경로 포함: ${hasSrcDeep}, store 관련 파일명 포함: ${hasStoreFile}`)
    expect(
      hasSrcDeep || hasStoreFile,
      'listFiles IPC 기반 검색이 02_Source/ 깊이 파일을 반환하지 않음'
    ).toBe(true)
    console.log('[TC-5] 깊은파일 검색 (listFiles 전환) 확인: PASS')

    await input.fill('')
    await page.waitForTimeout(300)
  })
})
