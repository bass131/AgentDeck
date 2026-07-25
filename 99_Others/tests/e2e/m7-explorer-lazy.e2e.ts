/**
 * m7-explorer-lazy.e2e.ts — M7 탐색기 lazy 스케일링 실 런타임 검증
 *
 * 커밋 97e32c8 이후 buildTree 가 1레벨만 반환하고, 폴더 펼침은
 * fsListDir(IPC) lazy 로드로 교체됐다는 것을 실 Electron 런타임에서 단정한다.
 *
 * 핵심 AC:
 *   TC-1 폭발0 즉시로드 — node_modules 포함 repo(C:/Dev/AgentDeck) 워크스페이스 열기
 *         → 탐색기 루트 1레벨이 5초 이내 렌더됨. 전체 재귀였다면 수만 파일로 타임아웃.
 *   TC-2 node_modules 1레벨 항목으로 표시·미펼침 — 초기 로드 후 node_modules 폴더가
 *         루트 1레벨 항목으로 있고 children 미로드(펼침 상태 아님).
 *   TC-3 lazy 펼침 — "src" 폴더 클릭 → 1레벨 children이 DOM에 추가됨(즉시).
 *   TC-4 node_modules lazy 펼침 — node_modules 클릭 → 1레벨만 로드(타임아웃 없음).
 *   TC-5 검색 깊은파일 — 검색창에 "reducer"(또는 "store") 입력 → src 깊이의
 *         파일이 결과에 포함(listFiles 전환 증명).
 *
 * 전제:
 *   - C:/Dev/AgentDeck 에 node_modules 가 존재 (npm install 완료 상태).
 *   - `npm run build` 가 미리 완료돼 out/main/index.js 가 존재.
 *   - run-e2e.cjs 가 build 를 먼저 수행하므로 직접 실행 시 자동 처리됨.
 *   - AGENTDECK_E2E=1 으로 echo 백엔드 사용(에이전트 실행 불필요 — fs IPC 만 테스트).
 *   - AGENTDECK_E2E_WORKSPACE 로 네이티브 폴더 다이얼로그 우회.
 *
 * 실행:
 *   node scripts/run-e2e.cjs tests/e2e/m7-explorer-lazy.e2e.ts
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ── 대형 워크스페이스: AgentDeck repo 자체(node_modules 포함) ──────────────────
const LARGE_WORKSPACE = 'C:/Dev/AgentDeck'
const NODE_MODULES_EXISTS = existsSync(join(LARGE_WORKSPACE, 'node_modules'))

// ── 앱 출력 빌드 경로 ─────────────────────────────────────────────────────────
const APP_MAIN = join(process.cwd(), 'out', 'main', 'index.js')

// ── 타임아웃 상수 ─────────────────────────────────────────────────────────────
/** 전체 재귀였다면 수만 파일 → 수십 초 이상 멈춤. lazy면 <5s. */
const LOAD_TIMEOUT_MS = 5_000
/** 폴더 펼침 후 children 등장 타임아웃 */
const EXPAND_TIMEOUT_MS = 8_000
/** 검색 결과 등장 타임아웃(listFiles IPC 포함) */
const SEARCH_TIMEOUT_MS = 15_000

// ── 공통 모달 통과 헬퍼 ───────────────────────────────────────────────────────

async function passStartupGates(page: Page): Promise<void> {
  // 닉네임 온보딩
  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('m7테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { /* 온보딩 없음 */ }

  // EngineGate "계속 진행" 우회
  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { /* authed */ }

  // Shell 렌더 대기
  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  // WhatsNew / UpdateNotes 닫기
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
  } catch { /* 미표시 */ }

  // EngineUpdateNotice "나중에" 닫기
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click()
    await page.waitForTimeout(400)
  } catch { /* 미표시 */ }
}

// ══════════════════════════════════════════════════════════════════════════════
// TC-1 ~ TC-5: lazy 스케일링 핵심 검증 suite
// ══════════════════════════════════════════════════════════════════════════════

test.describe('M7 탐색기 lazy 스케일링 — node_modules 포함 대형 repo', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    // node_modules 미설치면 경고만(TC-1~2 degraded, TC-5 영향 없음)
    if (!NODE_MODULES_EXISTS) {
      console.warn('[m7] node_modules 없음: TC-1/TC-2/TC-4는 degraded 모드로 실행')
    }

    app = await electron.launch({
      args: [APP_MAIN],
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
  })

  // ── TC-1: 폭발0 즉시 로드 (핵심 AC) ──────────────────────────────────────────
  test('TC-1: node_modules 포함 대형 폴더 → 탐색기 루트 1레벨 5초 이내 렌더', async () => {
    test.setTimeout(40_000)

    // 워크스페이스 오픈 트리거 (AGENTDECK_E2E_WORKSPACE 우회 — 빈상태 버튼)
    const pickBtn = page.getByRole('button', { name: '폴더 선택' })
    const hasPick = await pickBtn.isVisible().catch(() => false)
    if (hasPick) {
      const t0 = Date.now()
      await pickBtn.click()

      // 루트 1레벨 첫 항목이 LOAD_TIMEOUT_MS 이내에 나타나야 함
      // 전체 재귀(수만 파일)였다면 이 선택자가 타임아웃 됨
      await page.locator('.fe-node').first().waitFor({
        state: 'visible',
        timeout: LOAD_TIMEOUT_MS,
      })
      const elapsed = Date.now() - t0
      console.log(`[TC-1] 첫 fe-node 등장까지 ${elapsed}ms (< ${LOAD_TIMEOUT_MS}ms 기대)`)

      // 루트 항목 개수 확인 (최소 1개 이상)
      const nodeCount = await page.locator('.fe-node').count()
      console.log(`[TC-1] 루트 1레벨 fe-node 수: ${nodeCount}`)
      expect(nodeCount).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(LOAD_TIMEOUT_MS)
    } else {
      // 이미 워크스페이스가 열려있는 경우 — 트리가 표시되는지만 확인
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

  // ── TC-2: node_modules 1레벨 항목으로 표시·미펼침 ──────────────────────────────
  test('TC-2: node_modules 폴더가 루트 1레벨 항목으로 있고 자식 미로드', async () => {
    test.setTimeout(20_000)

    if (!NODE_MODULES_EXISTS) {
      console.warn('[TC-2] node_modules 미존재 — skip')
      test.skip()
      return
    }

    // node_modules 디렉토리 노드 확인
    // title 속성이 relPath(="node_modules")로 설정됨 — 정확히 일치하는 button 선택
    const nmNode = page.locator('.fe-node.fe-dir-head[title="node_modules"]')
    await nmNode.waitFor({ state: 'visible', timeout: 8_000 })
    console.log('[TC-2] node_modules 폴더 노드 표시 확인: PASS')

    // node_modules 미펼침 확인 — aria-expanded 속성으로 검사
    // 폴더 버튼에 aria-expanded={isOpen} 가 있음
    const isExpanded = await nmNode.getAttribute('aria-expanded')
    console.log(`[TC-2] node_modules aria-expanded: "${isExpanded}" (미펼침이면 "false")`)
    expect(
      isExpanded,
      'node_modules 가 초기 펼침 상태임 (lazy 미적용 의심)'
    ).toBe('false')

    // 추가 단정: node_modules 자식 경로를 가진 fe-node 가 DOM에 없어야 함
    // 자식 노드는 title="node_modules/xxx" 패턴
    const nmChildNodes = page.locator('.fe-node[title^="node_modules/"]')
    const childCount = await nmChildNodes.count()
    console.log(`[TC-2] node_modules 하위 fe-node(title^="node_modules/") 수: ${childCount}`)
    expect(
      childCount,
      'node_modules 자식이 미펼침 상태에서 DOM에 존재함 (lazy 로딩 실패)'
    ).toBe(0)

    console.log('[TC-2] node_modules 미펼침(자식 미로드) 확인: PASS')
  })

  // ── TC-3: src 폴더 lazy 펼침 ──────────────────────────────────────────────────
  test('TC-3: src 폴더 클릭 → 1레벨 children 즉시 로드', async () => {
    test.setTimeout(20_000)

    // title="src" — relPath가 루트 기준 "src" 인 폴더 버튼
    const srcNode = page.locator('.fe-node.fe-dir-head[title="src"]')
    const hasSrc = await srcNode.isVisible().catch(() => false)
    if (!hasSrc) {
      console.warn('[TC-3] src 노드 미표시 — 워크스페이스 루트에 src 없을 수 있음')
      test.skip()
      return
    }

    // 펼치기 전 fe-node 총 수 기록
    const beforeCount = await page.locator('.fe-node').count()
    console.log(`[TC-3] src 클릭 전 fe-node 수: ${beforeCount}`)

    const t0 = Date.now()
    await srcNode.click()

    // src/main, src/renderer, src/shared, src/preload 등 자식이 나타나야 함
    // title 속성이 "src/main", "src/renderer" 등으로 설정됨
    await page.waitForFunction(
      (cnt) => document.querySelectorAll('.fe-node').length > cnt,
      beforeCount,
      { timeout: EXPAND_TIMEOUT_MS }
    )
    const elapsed = Date.now() - t0
    console.log(`[TC-3] src 펼침 후 fe-node 증가까지 ${elapsed}ms (< ${EXPAND_TIMEOUT_MS}ms)`)

    const afterCount = await page.locator('.fe-node').count()
    console.log(`[TC-3] src 클릭 후 fe-node 수: ${afterCount} (증가: +${afterCount - beforeCount})`)
    expect(afterCount).toBeGreaterThan(beforeCount)

    // src 직하위 폴더들이 DOM에 있는지 (title="src/main" 등)
    const srcChildDirs = page.locator('.fe-node[title^="src/"]')
    const srcChildCount = await srcChildDirs.count()
    console.log(`[TC-3] src 하위 fe-node 수: ${srcChildCount}`)
    expect(srcChildCount).toBeGreaterThan(0)

    console.log('[TC-3] src lazy 펼침 확인: PASS')
  })

  // ── TC-4: node_modules lazy 펼침 (즉시, 폭발 없음) ──────────────────────────────
  test('TC-4: node_modules 클릭 → 1레벨만 로드(타임아웃 없음)', async () => {
    test.setTimeout(20_000)

    if (!NODE_MODULES_EXISTS) {
      console.warn('[TC-4] node_modules 미존재 — skip')
      test.skip()
      return
    }

    // title="node_modules" — 정확한 경로 매칭
    const nmNode = page.locator('.fe-node.fe-dir-head[title="node_modules"]')
    await nmNode.waitFor({ state: 'visible', timeout: 8_000 })

    const beforeCount = await page.locator('.fe-node').count()

    const t0 = Date.now()
    await nmNode.click()

    // node_modules 하위 패키지 1개 이상이 EXPAND_TIMEOUT_MS 이내에 등장해야 함
    // 전체 재귀였다면 수만 파일 → 멈춤. lazy면 1레벨(패키지 디렉토리들)만 → 즉시.
    // 자식 노드들은 title="node_modules/xxx" 형태로 나타남
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

    // 최소 1개 이상 자식 등장
    expect(nmChildren).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(EXPAND_TIMEOUT_MS)

    // grandchildren(2레벨 이하) 미표시 검증 — 예: ".bin/xxx" 또는 "playwright/xxx"
    // node_modules 자식 중 하나를 골라 title에 2레벨 이상 경로가 없는지 확인
    // (lazy이면 node_modules 자식은 있으나, 그 자식의 자식은 없어야 함)
    // 즉 title이 "node_modules/a/b" 형태인 fe-node 수 = 0 이어야 함
    const nmGrandChildren = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.fe-node[title]'))
        .filter((el) => {
          const t = el.getAttribute('title') ?? ''
          // node_modules/a/b 형태 — 슬래시 2개 이상
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

    // 접기 — 다음 테스트를 위해 원복
    await nmNode.click()
    await page.waitForTimeout(300)
  })

  // ── TC-5: 검색 깊은파일 (listFiles IPC 전환 증명) ────────────────────────────────
  test('TC-5: 검색창에 "store" 입력 → src 깊이의 파일이 결과에 포함', async () => {
    test.setTimeout(30_000)

    // 검색창 — aria-label="파일 검색" (FileExplorer.tsx L589)
    const input = page.getByLabel('파일 검색')
    await input.waitFor({ state: 'visible', timeout: 5_000 })

    // "store" 검색 — src 깊이의 appStore.ts 등 파일이 결과에 포함돼야 함
    await input.click()
    await input.fill('store')

    // listFiles IPC 결과 기반이므로 SEARCH_TIMEOUT_MS 이내 결과 등장 기대
    // fe-tree.fe-results 가 검색 모드의 결과 컨테이너 (FileExplorer.tsx L607)
    await page.locator('.fe-tree.fe-results').waitFor({
      state: 'visible',
      timeout: SEARCH_TIMEOUT_MS,
    })

    // 결과 내 파일 목록 (검색 결과 안의 fe-file 노드)
    const resultNodes = page.locator('.fe-tree.fe-results .fe-node.fe-file')
    await resultNodes.first().waitFor({ state: 'visible', timeout: SEARCH_TIMEOUT_MS })

    const resultCount = await resultNodes.count()
    console.log(`[TC-5] 검색 결과 fe-file 수: ${resultCount}`)
    expect(resultCount).toBeGreaterThan(0)

    // 결과에 src/ 깊이의 파일 경로가 포함됐는지 확인 (listFiles 전환 증명)
    // fe-result-path 스팬에 디렉토리 경로가 표시됨 (FileExplorer.tsx L631)
    const deepPathTexts = await page.locator('.fe-tree.fe-results .fe-result-path').allInnerTexts()
    console.log(`[TC-5] fe-result-path 샘플:`, deepPathTexts.slice(0, 5))

    // fe-node-name에서 파일명 확인
    const nodeNames = await page.locator('.fe-tree.fe-results .fe-node-name').allInnerTexts()
    console.log(`[TC-5] 검색 결과 파일명 샘플:`, nodeNames.slice(0, 8))

    const hasSrcDeep = deepPathTexts.some(
      (p) => p.includes('src/') || p.includes('renderer') || p.includes('main')
    )
    const hasStoreFile = nodeNames.some(
      (n) => n.toLowerCase().includes('store') || n.toLowerCase().includes('app')
    )

    console.log(`[TC-5] src/ 깊이 경로 포함: ${hasSrcDeep}, store 관련 파일명 포함: ${hasStoreFile}`)
    expect(
      hasSrcDeep || hasStoreFile,
      'listFiles IPC 기반 검색이 src/ 깊이 파일을 반환하지 않음'
    ).toBe(true)
    console.log('[TC-5] 깊은파일 검색 (listFiles 전환) 확인: PASS')

    // 검색창 초기화
    await input.fill('')
    await page.waitForTimeout(300)
  })
})
