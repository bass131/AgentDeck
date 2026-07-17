/**
 * readme-shots.e2e.ts — README 공개용 실사용 스크린샷 촬영 전용 스펙 (opt-in: LIVE_SDK=1).
 *
 * 목적: 테스트가 아니라 **촬영**이다. 실 Electron + 실 Agent SDK(구독 인증)로
 * AgentDeck 저장소 사본을 워크스페이스 삼아 "AgentDeck으로 AgentDeck을 개발하는"
 * 실사용 장면을 연출하고, README 기준 컷 4장을 artifacts/screenshots/에 남긴다:
 *   ① readme-hero-live.png — 단일 에이전트: 서브에이전트 2개 병렬 실행 중(스트리밍)
 *   ② readme-hero-done.png — 완료 직후: 할 일 ✅ + 서브에이전트 카드 + 변경된 파일
 *   ③ readme-git.png       — Git 모달: 실제 AgentDeck 커밋 히스토리
 *   ④ readme-multiagent.png(+-b) — 멀티 에이전트 3패널 동시 실작동
 *
 * 실행: LIVE_SDK=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/readme-shots.e2e.ts
 * (실 API 호출 — 서브에이전트 2 + 멀티 3패널 = 토큰 소모. 촬영 후 재실행 금지 원칙.)
 *
 * 연출 디테일(스크린샷 품질이 곧 완료조건):
 *  - 워크스페이스 사본을 <tmp>/AgentDeck 에 둔다 — 탐색기 헤더에 임시 난수 이름이
 *    아니라 "AgentDeck"이 보이게(기존 live-tp 스톡의 "agentdeck-tp-xJ4w5f" 문제 회피).
 *  - .git 포함 복사 — GitModal "모든 커밋"에 실제 개발 히스토리가 나오게.
 *  - 닉네임 '영호' — 하단 프로필이 검증 계정("M5검증")이 아니라 실사용자로 보이게.
 *  - 단정은 최소(soft) — 촬영 실패 지점에서 죽지 않고 가능한 컷을 모두 남긴다.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')
const REPO_ROOT = process.cwd() // run-e2e.cjs는 항상 레포 루트에서 실행

test.describe('README 실사용 스크린샷 촬영 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 촬영 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let tmpRoot: string
  let workspace: string
  let userDataDir: string

  /** 창 크기 고정 — 1차 촬영에서 컷① 이후 창이 2133×1160으로 줄어 컷④의 3번 패널이
   *  오른쪽에서 잘렸다(실측). 모든 컷을 같은 프레임으로 강제한다. */
  async function pinWindow(): Promise<void> {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        w.setBounds({ x: 0, y: 0, width: 2560, height: 1392 })
        // 2차 실측: 창 크기가 아니라 줌 팩터가 촬영 중 1.2로 바뀌어(2560→2133 CSS px,
        // 정확히 ×1/1.2) 프레임이 줄었다 — 스크린샷 직전마다 줌을 1.0으로 강제.
        w.webContents.setZoomFactor(1.0)
      }
    })
    await page.waitForTimeout(800) // 리레이아웃 정착
  }

  /** 서브에이전트 카드가 뜰 때까지 대기하되, 그 사이 권한 카드는 "항상 허용"으로 처리. */
  async function waitForSubagentApproving(timeoutMs = 240_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        await perm.locator(permChoiceSelector('allow_always')).click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      if (await page.locator('.subagent').first().isVisible().catch(() => false)) return true
      await page.waitForTimeout(1000)
    }
    return false
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000) // .git 포함 사본 복사(~100MB) 여유
    tmpRoot = mkdtempSync(join(tmpdir(), 'agentdeck-shots-'))
    workspace = join(tmpRoot, 'AgentDeck') // 탐색기 헤더에 보일 이름
    // 레포 사본 — node_modules/out/test-results/루트 artifacts만 제외(.git은 포함).
    // 'artifacts'(루트, 소문자)와 '00.Documents/Artifacts'(대문자)는 별개 — 후자는 유지.
    const EXCLUDE = new Set(['node_modules', 'out', 'dist', 'release', 'test-results', 'artifacts'])
    cpSync(REPO_ROOT, workspace, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).some((seg) => EXCLUDE.has(seg))
    })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-shots-udata-'))
    mkdirSync(SHOT_DIR, { recursive: true })

    app = await electron.launch({
      // AGENTDECK_E2E 미설정 → 실 ClaudeCodeBackend(SDK). 다이얼로그만 env 우회.
      args: [`--user-data-dir=${userDataDir}`, join(REPO_ROOT, 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_PICK_FOLDER: workspace, // 멀티 패널 폴더 선택 우회(단일값 제약 — 전 패널 동일)
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1'
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: '영호' })
    await openWorkspace(page)
    await pinWindow()
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('컷① ②: 히어로 — 서브에이전트 2 병렬 + 할일 + 변경파일', async () => {
    test.setTimeout(480_000)

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'AgentDeck 코드베이스 구조를 파악해줘. TaskCreate로 할 일 목록을 만들어 관리하면서 진행하고, ' +
      'Task 도구로 general-purpose 서브에이전트 2개를 병렬로 띄워줘 — 하나는 Electron 메인 프로세스' +
      '(02.Source/main), 다른 하나는 React 렌더러(02.Source/renderer)를 조사해서 각자 핵심 모듈 ' +
      '5개와 역할을 보고하게 해줘. 보고가 모이면 종합해서 프로젝트 루트에 arch-map.md 파일로 저장해줘. 한국어로.'
    )
    await input.press('Enter')

    // 컷①: 서브에이전트 카드 등장 + 4초(두 번째 카드·스트리밍 텍스트 여유) 후 촬영
    const spawned = await waitForSubagentApproving(240_000)
    console.log('[readme-shots] 서브에이전트 관측:', spawned)
    await page.waitForTimeout(4000)
    await page.screenshot({ path: join(SHOT_DIR, 'readme-hero-live.png') })

    // 컷②: 턴 완전 종료(권한 자동승인) 후 촬영 — 할일 ✅/서브에이전트/변경파일 최종 상태
    await settleTurn(page, { timeoutMs: 360_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(SHOT_DIR, 'readme-hero-done.png') })

    const subCount = await page.locator('.subagent').count()
    console.log('[readme-shots] 최종 서브에이전트 카드 수:', subCount)
  })

  test('컷③: Git 모달 — 실제 커밋 히스토리', async () => {
    test.setTimeout(60_000)
    await pinWindow()
    await page.getByLabel('Git').first().click()
    await expect(page.locator('.gitm-overlay')).toBeVisible()
    await page.locator('.gitm-nav .gitm-item', { hasText: '모든 커밋' }).click()
    await page.waitForSelector('.gitm-commit', { timeout: 15_000 })
    await page.waitForTimeout(800) // 목록 렌더 정착
    await page.screenshot({ path: join(SHOT_DIR, 'readme-git.png') })
    // README 게재본(3차 실측): 풀프레임은 GitHub 표시 폭에서 글자가 뭉개진다 —
    // 모달 요소만 별도 촬영해 그대로 assets에 쓴다(1차 게재본은 풀프레임 로컬 크롭).
    await page.locator('.gitm-modal').screenshot({ path: join(SHOT_DIR, 'readme-git-modal.png') })
    await page.keyboard.press('Escape')
    await expect(page.locator('.gitm-overlay')).toHaveCount(0)
  })

  test('컷④: 멀티 에이전트 — 3패널 동시 실작동', async () => {
    test.setTimeout(480_000)

    // 멀티 모드 전환 + 3패널
    await pinWindow()
    await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
    await expect(page.locator('.multi .ma-grid')).toBeVisible()
    await page.locator('.ma-count .ma-count-btn', { hasText: '3' }).click()
    await expect(page.locator('.ma-grid .ma-panel')).toHaveCount(3)

    const PROMPTS = [
      '02.Source/renderer에서 Zustand 스토어 파일들을 찾아 각자 무슨 상태를 관리하는지 한 줄씩 정리해줘.',
      'package.json의 scripts를 읽고 빌드·테스트 파이프라인이 어떻게 구성돼 있는지 4문장으로 요약해줘.',
      '02.Source/main에서 IPC 채널 등록부를 찾아 대표 채널 10개를 목록으로 뽑아줘.'
    ]
    // 패널별: 폴더 지정(env 우회) → 프롬프트 전송. 빠르게 연달아 — 동시 실행 장면이 목적.
    for (let i = 0; i < 3; i++) {
      const panel = page.locator('.ma-grid .ma-panel').nth(i)
      await panel.locator('.ma-p-folder').click()
      await expect(panel.locator('.ma-p-folder-name')).toContainText('AgentDeck', { timeout: 8000 })
      const ta = panel.locator('.ma-composer-ta')
      await ta.click()
      await ta.fill(PROMPTS[i])
      await ta.press('Enter')
    }

    // 동시 스트리밍 중간 2컷(20s/50s) — 컨텍스트 게이지·도구 라인이 살아있는 순간.
    // 각 컷 직전 pinWindow 재호출(줌 팩터가 실행 중 다시 바뀌는 것 방어 — 2차 실측).
    await page.waitForTimeout(20_000)
    await pinWindow()
    await page.screenshot({ path: join(SHOT_DIR, 'readme-multiagent.png') })
    await page.waitForTimeout(30_000)
    await pinWindow()
    await page.screenshot({ path: join(SHOT_DIR, 'readme-multiagent-b.png') })
    // README 게재본: 세션 사이드바 제외한 멀티 영역만 — 표시 폭 대비 패널 가독성 확보.
    await page.locator('.multi').screenshot({ path: join(SHOT_DIR, 'readme-multiagent-panels.png') })

    // 정리: 세 패널 턴 종료 대기(강제 종료로 세션을 찢지 않기 위함 — 실패해도 촬영은 완료)
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const running = await page.getByLabel('실행 중단').count()
      if (running === 0) break
      await page.waitForTimeout(2000)
    }
    console.log('[readme-shots] 멀티 3패널 정착 완료')
  })
})
