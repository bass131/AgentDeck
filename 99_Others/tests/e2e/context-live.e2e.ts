/**
 * context-live.e2e.ts — Phase 1 맥락 복구 실 SDK 검증 (opt-in: LIVE_SDK=1).
 *
 * 실제 빌드 앱의 전 경로(renderer sendMessage → agentRun → backend resume → SDK → session
 * 이벤트 → renderer 저장 → 다음 턴 resumeSessionId)로 **턴 간 맥락이 실제로 유지되는지** 검증.
 * 프로브(resume-probe.mjs)는 raw SDK였고, 이건 앱 전 배선의 end-to-end 확인.
 *
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/context-live.e2e.ts
 *
 * 검증: 턴1 "코드워드 BANANA42 기억" → 턴2 "코드워드 뭐였지?" → 응답에 BANANA42 포함(회상).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('Phase 1 맥락 복구 실 SDK (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-ctx-'))
    // 프로필 격리(orchestration-live.e2e.ts 선례, 2026-07 라이브 e2e 일괄 실측): 공유 기본
    // userData를 쓰면 이전 dev/e2e 세션이 누적한 대화 이력을 REPL이 이어받으려다 만료된
    // sessionId로 resume을 시도해 "No conversation found with session ID" 오염이 난다 —
    // 이 스펙은 특히 resume 기반 턴 간 맥락을 검증하므로 격리가 더욱 중요하다.
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-ctx-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과(로그인 → eg-auth skip → titlebar → 시작모달 → 엔진알림) — 공용 헬퍼.
    await passBootGates(page, { nickname: 'tester' })
    // 워크스페이스 열기(AGENTDECK_E2E_WORKSPACE 우회) — 빈 스크래치 임시 디렉터리(파일 0개)라
    // 트리에 `.fe-node-name`이 나타날 일이 없으므로 waitForTree:false.
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('턴1에서 알려준 코드워드를 턴2가 기억한다 (resume 맥락 복구)', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()
    // composer enabled 확인(워크스페이스 오픈 완료 이후에만 활성화됨) — 메시지 입력 전 필수.
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const input = page.getByLabel('메시지 입력')

    // 턴1: 코드워드 알려주기
    await input.click()
    await input.fill('Remember this codeword: BANANA42. Acknowledge in one short sentence. Do not use any tools.')
    await input.press('Enter')
    // 턴1 완료 대기(어시스턴트 응답 도착 + idle)
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText(/BANANA42|got it|acknowledg/i, { timeout: 120_000 })
    await page.waitForTimeout(1500)

    // 턴2: 코드워드 묻기 (resume으로 맥락 복구되어야 기억)
    await input.click()
    await input.fill('What was the codeword I just told you? Reply with only the codeword. Do not use any tools.')
    await input.press('Enter')

    // 턴 완전 종료 대기(정지 버튼 소멸) — 반드시 최종 응답 단정 *전*에 와야 한다.
    // 배경(실측 회귀 발견, 2026-07): 이 대기 없이 곧장 toContainText('BANANA42')만 걸면
    // 턴2 어시스턴트 버블이 아직 생성되기 *전*(빈 상태)이라 `.last()`가 여전히 턴1의
    // 이전 응답("BANANA42 — got it, I'll remember...")을 가리켜 조기 매칭 — 턴2가
    // 실제로 응답하기도 전에 테스트가 거짓 PASS를 낸다(스크린샷 실측: assertion 통과
    // 시점에 턴2 메시지가 아직 대기열에 있고 AI 버블 자체가 없었음). settleTurn으로
    // 정지 버튼이 사라질 때까지 기다린 *후*에만 최종 응답을 단정한다
    // (orchestration-live.e2e.ts와 동일 계열 함정 — bootGates.ts settleTurn 문서 참조).
    await settleTurn(page, { timeoutMs: 120_000 })

    // 턴2 응답에 BANANA42 포함 → 맥락 유지 실증
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('BANANA42', { timeout: 10_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'context-live-recall.png') })
    const body = await page.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    console.log('[context-live] 턴2 응답:', body.slice(0, 200))
  })
})
