/**
 * ultracode-demo.e2e.ts — UltraCode 버튼 실사용 시연 (opt-in, 사용자 "보여줘" 요청).
 *
 * 실 Electron + 실 SDK로 새 동작/연출을 단계별 스크린샷과 함께 시연:
 *  1) UltraCode 기본 ON(UC1-P07, ADR-032 개정 v2 — 권한 진실원 단일화 + 기본 ON) — 첫
 *     렌더부터 강렬한 보라 글로우 버튼(Bold 라벨), 클릭 없이 이미 켜져 있음
 *  2) 클릭 → OFF(뮤트 상태 시연) → 재클릭 → ON 복귀(지속 토글 상호작용 확인)
 *  3) 작업 전송(ON 상태) → 서브에이전트 채팅 인라인(.sa-inline) + **전송 후에도 토글 ON
 *     유지(지속 토글, one-shot 폐기 — ADR-032/UC1-P04)**. 전송되는 orchestration은 토글
 *     상태 "그대로"(키워드 언급이 있어도 승격되지 않음 — ADR-032 v2 §1, 라이브 실측은 P06)
 *  4) 결과 합성(맥락 연속)
 *
 * opt-in: `LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/ultracode-demo.e2e.ts`
 * 스크린샷: artifacts/screenshots/ultracode-*.png (gitignore).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'
const SHOTS = join(process.cwd(), 'artifacts', 'screenshots')

test.describe('UltraCode 버튼 실사용 시연 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-uc-'))
    // 프로필 격리(orchestration-live.e2e.ts 선례 — 라이브 스펙 표준): 공유 기본 userData를
    // 쓰면 이전 dev/e2e 세션이 저장한 대화 이력을 REPL이 이어받으려다 만료된 sessionId로
    // resume을 시도해 "No conversation found with session ID" 에러가 나 서브에이전트 스폰이
    // 불발되고 이 시연이 subagent 대기에서 멎는다(영호 실측 2026-07-04: "저장된 채팅 내역
    // 때문에 테스트가 제대로 안 됨"). 신선한 tmp --user-data-dir로 원천 차단 — 시연 스펙은
    // 특히 클린 세션이 중요하다(전 대화 잔여가 스크린샷에 섞이면 시연 자체가 오염).
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-uc-udata-'))
    app = await electron.launch({
      // --user-data-dir은 index.js '앞'에 둔다(Chromium 전역 파싱, orchestration-live 동일 관례).
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // ⚠ 신선 프로필은 닉네임 온보딩(.login-body)부터 뜨므로 .titlebar를 곧장 기다리면 로그인
    // 화면에 막혀 타임아웃난다(영호 2026-07-04 실측 — 프로필 격리 도입의 부작용). 표준 관문
    // 헬퍼로 로그인→titlebar→시작모달→엔진알림을 순서대로 통과한 뒤 워크스페이스를 연다
    // (bootGates.ts — orchestration-live.e2e.ts와 동일한 라이브 스펙 표준). 이 데모는 빈
    // 스크래치 워크스페이스(파일 0)라 트리 노드가 없으므로 waitForTree:false.
    await passBootGates(page, { nickname: 'tester' })
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('OFF→ON→전송→지속 토글 ON 유지 + 인라인 서브에이전트 + 결과', async () => {
    test.setTimeout(300_000)

    // 부팅 관문·워크스페이스 오픈은 beforeAll(passBootGates + openWorkspace)에서 완료됨.
    await expect(page.locator('.pane.chat')).toBeVisible()
    // composer 활성(워크스페이스 오픈 완료 이후에만 enabled) 확인 후 토글/입력 조작.
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()

    // ① 기본 ON 상태(UC1-P07, ADR-032 v2) — 클릭 없이 이미 켜져 있음, 보라 글로우 시연
    await expect(toggle).toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-1-on-default.png') })

    // ② 클릭 → OFF(뮤트 상태 시연) → 재클릭 → ON 복귀(지속 토글 상호작용 확인)
    await toggle.click()
    await expect(toggle).not.toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-2-off.png') })
    await toggle.click()
    await expect(toggle).toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-2b-on-again.png') })
    await page.screenshot({ path: join(SHOTS, 'ultracode-2-on-full.png') })

    // ③ 병렬 서브에이전트 유도(비파괴 — 파일 쓰기 없음)
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn TWO subagents in parallel. Tell subagent 1 to reply with exactly ALPHA. ' +
      'Tell subagent 2 to reply with exactly BRAVO. Neither should use tools or write files. ' +
      'After both finish, reply to me with their two words joined by a hyphen: ALPHA-BRAVO.'
    )
    await input.press('Enter')

    // **지속 토글(one-shot 폐기, ADR-032/UC1-P04)**: 전송 후에도 토글은 ON 유지되어야 함
    await expect(toggle).toHaveClass(/orch-on/)
    await page.screenshot({ path: join(SHOTS, 'ultracode-3-sent-persistent-on.png') })

    // 채팅 인라인 서브에이전트(.sa-inline) 실시간 표시
    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 240_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-3b-inline-subagents.png') })

    // ④ 결과 합성(맥락 연속)
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA', { timeout: 240_000 })
    await expect(lastMsg).toContainText('BRAVO', { timeout: 10_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-4-result.png') })

    console.log('[ultracode-demo] 스크린샷 →', SHOTS)
  })
})
