/**
 * orchestration-live.e2e.ts — UltraCode 오케스트레이션 라이브 검증 (opt-in, "둘 다").
 *
 * 사용자 실측 두 증상(①진행 실시간 안 보임 ②워크플로 결과 맥락 못 이음)이 해소됐는지
 * 실 Electron + 실 SDK로 직접 검증. F-A/F-B/F-C/F-G 통합:
 *  - Test1(Task 서브에이전트 경로): UltraCode ON → Task 서브에이전트 스폰 → 오른쪽 패널
 *    .subagent + 채팅 인라인 .sa-inline(F-G) 실시간 표시 → 결과 tool_result로 메인 복귀(맥락 연속).
 *  - Test2(Workflow 경로): UltraCode ON → Workflow 권한 허용 → orchestration 카드 라이브(F-C)
 *    → 워크플로 결과가 2번째 턴으로 복귀해 메인 대화 마지막 메시지에 도달(F-B 핵심 버그 수정).
 *
 * opt-in: `LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/orchestration-live.e2e.ts`
 * (실 구독 인증으로 실 API 호출 — 서브에이전트/워크플로 스폰, 토큰 소모.)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('UltraCode 서브에이전트 오케스트레이션 라이브 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-orch-'))
    // 프로필 격리(isolatedBoot.ts / bf2-interrupt-probe2.e2e.ts 선례): 공유 기본 userData를
    // 쓰면 이전 dev/e2e 세션이 누적한 대화 이력을 REPL이 이어받으려다 만료된 sessionId로
    // resume을 시도해 "No conversation found with session ID" 에러가 나 서브에이전트/워크플로
    // 검증이 오염됐다(2026-07 라이브 e2e 재실측 실증). 신선한 tmp --user-data-dir로 원천 차단.
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-orch-udata-'))
    app = await electron.launch({
      // --user-data-dir은 index.js '앞'에 둔다(Chromium 전역 파싱 — 순서 무관하나 관례, isolatedBoot.ts 동일).
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과(로그인 → eg-auth skip → titlebar → 시작모달 → 엔진알림) — 공용 헬퍼(bootGates.ts)
    // 옛 버전은 시작모달/엔진알림 dismiss가 없어 "폴더 선택" 클릭이 가려진 모달에 막혀 불발 →
    // 워크스페이스 미오픈 → composer disabled로 남는 회귀가 있었다(2026-07 라이브 e2e 일괄 실측).
    // isolatedBoot.ts 대신 이 헬퍼를 쓰는 이유: isolatedBoot는 .wn-overlay만 dismiss하고
    // .un-overlay/EngineUpdateNotice는 미처리라 신선 프로필에서도 그 알림이 뜨면 동일한
    // 가림 문제가 재발할 위험이 있음 — bootGates.ts가 더 완전한 상위집합(관문 ①~⑤ 전부 처리).
    await passBootGates(page, { nickname: 'tester' })
    // 워크스페이스 열기(AGENTDECK_E2E_WORKSPACE 우회) — "폴더 선택" 클릭.
    // 이 워크스페이스는 빈 스크래치 임시 디렉터리(파일 0개) — 트리에 `.fe-node-name`이
    // 나타날 일이 없으므로 waitForTree:false(대신 composer enabled로 오픈 완료 판정).
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('UltraCode ON → 서브에이전트 실시간 표시(오른쪽 패널) + 결과 합성', async () => {
    test.setTimeout(300_000) // 서브에이전트 2개 스폰+실행+합성 대기

    await expect(page.locator('.pane.chat')).toBeVisible()

    // UltraCode ON (단일 모드 .composer .orch-toggle)
    // 주의(위양성 한계): disallowedTools는 orchestration OFF에서 ['Workflow']만 차단하고
    // Task는 항상 허용(sdkOptions.ts) — 이 테스트(Task 경로)는 UltraCode가 실효하지 않아도
    // 통과할 수 있다. UltraCode 게이팅의 실검증은 Test2(Workflow 경로)가 담당.
    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if (!(await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)

    // composer enabled 확인(워크스페이스 오픈 완료 이후에만 활성화됨) — 메시지 입력 전 필수.
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    // 병렬 서브에이전트를 명시적으로 유도하는 작업(빠르고 비파괴 — 파일 쓰기 없음).
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn TWO subagents in parallel. ' +
      'Tell subagent 1 to reply with exactly the single word ALPHA. ' +
      'Tell subagent 2 to reply with exactly the single word BRAVO. ' +
      'Neither subagent should use any tools or write files. ' +
      'After both subagents finish, reply to me with their two words joined by a hyphen: ALPHA-BRAVO.'
    )
    await input.press('Enter')

    // ① 관측: 오른쪽 AgentPanel에 .subagent 카드가 실시간으로 나타남(서브에이전트 스폰됨).
    await expect(page.locator('.subagent').first()).toBeVisible({ timeout: 240_000 })
    const subCount = await page.locator('.subagent').count()
    console.log('[orch-live] .subagent 카드 수:', subCount)
    const saNames = await page.locator('.subagent .sa-name').allInnerTexts().catch(() => [])
    console.log('[orch-live] 서브에이전트 이름:', JSON.stringify(saNames))

    // ①-b F-G: 채팅 인라인 서브에이전트 카드(.sa-inline)도 thread에 나타남(단일·멀티 공통).
    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 30_000 })
    const inlineCount = await page.locator('.sa-inline').count()
    console.log('[orch-live] .sa-inline(채팅 인라인) 카드 수:', inlineCount)
    expect(inlineCount).toBeGreaterThanOrEqual(1)

    // 턴 완전 종료 대기(정지 버튼 소멸) — 반드시 최종 응답 단정 *전*에 와야 한다.
    // 배경: 얕은 toContainText('ALPHA')/('BRAVO') 부분일치는 어시스턴트의 중간 계획 메시지
    // ("one to reply ALPHA, one to reply BRAVO"에도 이미 등장)에 조기 매칭돼, 실제 서브에이전트가
    // 아직 백그라운드에서 도는데 이 테스트가 먼저 통과 처리되고 다음 테스트가 같은 REPL 세션에
    // 끼어드는 교차-테스트 경합을 낳았다(2026-07 라이브 e2e 재실측 실증).
    await settleTurn(page, { timeoutMs: 240_000 })

    // ② 연속(턴 정착 후): 서브에이전트 결과가 메인으로 복귀해 최종 응답에 합성됨.
    // 프롬프트가 요구한 최종 형태(하이픈 결합 "ALPHA-BRAVO")로 단정해 중간 계획 문구
    // ("...reply ALPHA, one to reply BRAVO")와의 조기/오탐 매칭을 추가로 배제한다.
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA-BRAVO', { timeout: 10_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-live.png') })

    // 최소 1개 서브에이전트가 관측됐어야 함(관측 증명).
    expect(subCount).toBeGreaterThanOrEqual(1)
  })

  test('UltraCode ON → Workflow 실행 → 결과가 메인 대화 마지막 메시지에 도달(F-B)', async () => {
    // Workflow 백그라운드 실행 + 2턴 대기. permCard 60s→180s 보정에 맞춰 테스트 전체
    // 타임아웃도 비례 확장(개별 expect 타임아웃 합보다 여유 있게 — 300s로는 permCard(180s)
    // +orch-card(120s)+lastMsg(240s) 최악값 합을 못 담아 테스트 레벨에서 먼저 끊길 위험).
    test.setTimeout(480_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    // ★ 새 대화에서 시작 — REPL held-open 세션의 도구 목록·시스템 가이드는 *세션 생성
    // 시점*(첫 send의 orchestration 플래그)에 영구 고정된다(agent-runs.ts sessionKey 재사용:
    // 같은 대화의 후속 send는 기존 세션에 turn만 push → 이 테스트의 토글이 무력).
    // Test1과 같은 대화를 이어 쓰면 ① orchestration 플래그 미실효 ② 선행 컨텍스트(서브
    // 에이전트 작업 + 자율발동 턴)에 모델이 헤매는 2중 결합이 생긴다 — 2026-07 라이브
    // 재실측에서 "단독 11s PASS vs 시퀀스 180s 타임아웃"으로 실증. 새 대화 = 새 sessionKey
    // = 이 send가 세션을 생성 = UltraCode 플래그 실효 + 컨텍스트 격리.
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    // UltraCode ON — Workflow 도구 자체가 UltraCode ON일 때만 노출/허용된다(영호 확인).
    // 위에서 새 대화로 전환했으므로 이 토글이 세션 생성 플래그로 실제 반영된다.
    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    const toggleClassBefore = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 시작 시 UltraCode 토글 class:', toggleClassBefore)
    if (!toggleClassBefore?.includes('orch-on')) {
      console.log('[orch-live] UltraCode OFF 확인 — ON으로 토글')
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)
    const toggleClassConfirmed = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 UltraCode 확정 상태(메시지 전송 전):', toggleClassConfirmed)

    // composer enabled 확인(워크스페이스 오픈 완료 이후에만 활성화됨) — 메시지 입력 전 필수.
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    // Workflow 명시 유도 — 단일 에이전트가 WORKFLOW_RESULT_OK 반환
    const input = page.getByLabel('메시지 입력')
    await input.click()
    // 프롬프트 유도력 강화(2026-07 재실측): 탐색을 명시적으로 금지하지 않으면 xhigh 모델이
    // Workflow 호출 전 코드 탐색으로 수 분을 소모한다("코드를 살펴보는 중" 정체 실증).
    await input.fill(
      'Call the Workflow tool IMMEDIATELY as your very first action — do not read files, do not ' +
      'explore the codebase, do not use any other tool first. The workflow: a meta block named ' +
      '"probe" and a single agent() call whose prompt asks it to reply with the exact string ' +
      'WORKFLOW_RESULT_OK. Keep it to ONE agent only. After the workflow finishes, reply to me ' +
      'with the workflow result string.'
    )
    // 전송 직전 재확인(가장 신뢰할 수 있는 시점 — 그 사이 리렌더로 꺼졌을 가능성까지 방어).
    const toggleClassAtSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 전송 직전 UltraCode 토글 class:', toggleClassAtSend)
    if (!toggleClassAtSend?.includes('orch-on')) {
      console.log('[orch-live] ⚠ 전송 직전 UltraCode가 다시 OFF로 확인됨 — 재토글 후 전송')
      await toggle.click()
      await expect(toggle).toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    // Workflow는 canUseTool 권한 게이트(ON→permission_request) → 카드 허용(BF3 P06/ADR-030
    // 인라인 카드 — "허용" 버튼 직접 클릭. 옛 풀오버레이 모달의 숫자키 전역 리스너는 폐기됨).
    // perm-card 미출현 시 진단을 위해 이 시점 UltraCode 상태도 로그로 남긴다(영호 지시).
    const toggleClassAfterSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 전송 직후 UltraCode 토글 class:', toggleClassAfterSend)
    // 60s→180s 보정(영호 승인): 비결정성 은폐가 아니라 이 스펙의 다른 라이브 대기(240s류)와
    // 정합을 맞춘 것 — 모델이 Workflow 호출 전 탐색성 도구를 몇 번 거치면 60s로는 빠듯하다.
    const permCard = page.locator(PERM_CARD)
    await expect(permCard).toBeVisible({ timeout: 180_000 })
    await permCard.locator(permChoiceSelector('allow')).click() // 허용

    // 진행: orchestration 카드(.orch-card)가 thread에 나타남(F-C 라이브).
    await expect(page.locator('.orch-card').first()).toBeVisible({ timeout: 120_000 })

    // 핵심(F-B): 워크플로 결과가 2번째 턴으로 복귀해 메인 대화 마지막 AI 메시지에 도달.
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('WORKFLOW_RESULT_OK', { timeout: 240_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'workflow-result-live.png') })
  })
})
