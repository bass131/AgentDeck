/**
 * orchestration-live.e2e.ts — UltraCode 오케스트레이션 라이브 검증 (opt-in, "넷").
 *
 * 실 Electron + 실 SDK로 UltraCode 재설계(ADR-032 + 개정 v2)의 핵심 완료조건을 직접 검증.
 * F-A/F-B/F-C/F-G(초기 두 증상) + UC1(mid-session·비승격·deny 가시화) 통합:
 *  - Test1(Task 서브에이전트 경로): UltraCode ON → Task 서브에이전트 스폰 → 오른쪽 패널
 *    .subagent + 채팅 인라인 .sa-inline(F-G) 실시간 표시 → 결과 tool_result로 메인 복귀(맥락 연속).
 *  - Test2(Workflow 경로 — 새 대화): UltraCode ON → Workflow 권한 허용 → orchestration 카드
 *    라이브(F-C) → 워크플로 결과가 2번째 턴으로 복귀해 메인 대화 마지막 메시지에 도달(F-B).
 *  - Test3(mid-session — ADR-032 ①'): *같은 대화의 후속 턴*에서 UltraCode OFF→ON 플립 →
 *    Workflow → perm-card → 결과 복귀. 구 구조(세션 고정 disallowedTools)에선 영영 불가능했던
 *    시나리오가 PASS = P02(Workflow 상시 노출)·P03(후속 턴 orchestration 라이브 반영)의 증거.
 *  - Test4(비승격 + deny 가시화 — ADR-032 v2 ②'+⑥): 토글 OFF + 본문 "ultracode" 언급 →
 *    승격 안 됨 → 모델의 Workflow 시도가 즉시 deny(G4) → 대화창 .notice-row 시스템 라인 표시.
 *
 * opt-in: `LIVE_SDK=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/orchestration-live.e2e.ts`
 * (실 구독 인증으로 실 API 호출 — 서브에이전트/워크플로 스폰, 토큰 소모. 스펙당 1회 원칙.)
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
    // 주의(위양성 한계, UC1-P02로 갱신 — ADR-032 ④): Workflow는 이제 disallowedTools에서
    // 완전히 제거돼 항상 모델에 노출되고, 턴별 허용/거부는 canUseTool 게이트(permissionCoordinator)
    // 가 라이브로 판정한다. Task는 orchestration 여부와 무관하게 항상 허용(READONLY_TOOLS) —
    // 이 테스트(Task 경로)는 UltraCode가 실효하지 않아도 통과할 수 있다. UltraCode 게이팅의
    // 실검증은 Test2(Workflow 경로)가 담당.
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

    // ★ 새 대화에서 시작 — ⚠ UC1 이후 갱신(구 주석의 "후속 send 토글 무력" 논거는 폐기됨):
    // 예전엔 held-open 세션의 도구 목록이 *세션 생성 시점*에 영구 고정돼(disallowedTools
    // frozen) 같은 대화의 후속 send에서 켠 UltraCode가 그 세션에 영영 무력했다. 그 결함은
    // UC1 P02(Workflow를 disallowedTools에서 제거·상시 노출) + P03(held-open 후속 턴의
    // orchestration을 ActiveRun에 라이브 반영)로 고쳐졌고, "후속 턴에서도 실효한다"는 증거는
    // 아래 Test3(mid-session OFF→ON 플립)가 전담한다.
    // → 그러므로 Test2가 새 대화를 쓰는 이유는 이제 오직 하나: ② 컨텍스트 격리(Test1이 남긴
    // 서브에이전트 작업 + 자율발동 턴에 xhigh 모델이 헤매는 걸 차단 — "단독 11s PASS vs
    // 오염 시퀀스 180s 타임아웃"으로 실측). Test2는 "새 대화 = Workflow 정상 경로"를,
    // Test3는 "같은 대화 후속 턴 = mid-session 경로"를 각각 검증하는 상보 관계다.
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    // UltraCode ON — ⚠ UC1 이후 갱신: Workflow는 이제 disallowedTools에서 제거돼 *항상*
    // 모델에 노출되고(P02), 턴별 허용/거부는 canUseTool 게이트가 라이브로 판정한다(P03).
    // 따라서 이 토글 ON은 "도구를 노출시키는" 게 아니라 "이 send의 canUseTool 게이트를
    // 승인 요청(G1/G2)으로 보내는" 값이다 — ON이면 perm-card, OFF면 즉시 deny(G4).
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

  test('mid-session: 같은 대화 후속 턴에서 UltraCode OFF→ON 플립 → Workflow → perm-card → 결과(ADR-032 ①\')', async () => {
    // ADR-032 완료조건 ①'의 라이브 실증. Test2가 "새 대화"로 세션 생성 시점의 orchestration을
    // 실효시키는 경로를 봤다면, 이 테스트는 정확히 그 반대 — *같은 대화의 후속 턴*(mid-session)
    // 에서 UltraCode를 켜 Workflow가 실행되는지를 본다. 구 구조(세션 고정 disallowedTools +
    // "후속 send 토글 무력")에서는 영영 불가능했던 시나리오이며(ADR-032 근본 문제로 P01이
    // 박제), UC1 P02(Workflow 상시 노출) + P03(held-open 후속 턴 orchestration ActiveRun
    // 라이브 반영)로 고쳐졌음을 "고장을 재현하던 형태 그대로" PASS로 뒤집어 증명한다.
    //
    // 설계(가장 강한 증거 형태 — OFF→ON 플립): 턴1을 UltraCode **OFF**로 세션을 낳고(구
    // 구조라면 이 세션의 Workflow가 disallowedTools로 영구 봉인), 턴2에서 같은 세션에 대해
    // 토글을 **ON**으로 뒤집어 Workflow를 요청한다. 세션 생성 이후의 토글 변경이 canUseTool
    // 게이트에 라이브로 반영돼야만(P03) perm-card가 뜬다. 토글 기본값이 ON이므로(ADR-032 v2)
    // 턴1의 OFF는 명시적 클릭으로 만든다. "둘 다 ON"보다 강한 이유: 세션이 ON으로 태어났다는
    // 반론("애초에 Workflow가 열려 있었다")을 OFF 출발이 원천 제거한다.
    test.setTimeout(600_000) // 턴1(benign)+턴2(Workflow: perm-card 180s + orch-card 120s + 결과 240s)

    await expect(page.locator('.pane.chat')).toBeVisible()

    // 새 대화로 깨끗한 세션 시작(직전 테스트 잔여 컨텍스트 격리). 단, 턴2는 반드시 *같은
    // 대화*를 이어 써 mid-session을 성립시킨다 — 새 대화는 여기서 딱 한 번, 턴 사이엔 금지.
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()

    // ── 턴1: UltraCode OFF로 세션 생성(benign 교환) ──────────────────────────
    // 기본 ON이므로 OFF로 내린다. 이 send가 held-open 세션을 orchestration=false로 낳는다
    // (구 구조라면 이 세션의 Workflow는 여기서 disallowedTools로 영구 봉인됐을 지점).
    if ((await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).not.toHaveClass(/orch-on/)
    console.log('[orch-live] Test3 턴1 토글 OFF 확정 — 세션을 OFF로 생성')

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('Reply with exactly the single word READY. Do not use any tools, do not write files.')
    await input.press('Enter')

    // 턴1 완전 종료 대기(다음 턴이 같은 세션의 진행 중 턴에 끼어들지 않도록). benign이라
    // perm-card 없음 — settleTurn 기본 autoApprove는 무해(카드가 안 뜨면 그냥 대기).
    await settleTurn(page, { timeoutMs: 240_000 })
    const firstMsg = page.locator('.msg.ai-msg .content').last()
    await expect(firstMsg).toContainText('READY', { timeout: 10_000 })
    console.log('[orch-live] Test3 턴1(OFF) 완료 — held-open 세션 성립')

    // ── 턴2: 같은 대화에서 UltraCode ON으로 플립하고 Workflow 요청(mid-session) ──
    // ★ '새 대화' 클릭 없음 — 같은 sessionKey에 turn만 push되는 mid-session이 이 테스트의 핵심.
    const toggleBefore = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test3 턴2 진입 시 토글 class(OFF 기대, 지속 토글):', toggleBefore)
    if (!toggleBefore?.includes('orch-on')) {
      await toggle.click() // OFF → ON (mid-session 플립)
    }
    await expect(toggle).toHaveClass(/orch-on/)
    console.log('[orch-live] Test3 턴2 토글 ON 확정 — mid-session 플립 완료')

    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
    await input.click()
    // Test2와 동형 프롬프트(즉시 Workflow 호출 강제 — 탐색 지연 방지). 결과 문자열만 구분.
    await input.fill(
      'Call the Workflow tool IMMEDIATELY as your very first action — do not read files, do not ' +
      'explore the codebase, do not use any other tool first. The workflow: a meta block named ' +
      '"probe3" and a single agent() call whose prompt asks it to reply with the exact string ' +
      'MIDSESSION_OK. Keep it to ONE agent only. After the workflow finishes, reply to me with ' +
      'the workflow result string.'
    )
    // 전송 직전 토글 ON 재확인(리렌더로 꺼졌을 가능성 방어).
    const toggleAtSend = await toggle.getAttribute('class').catch(() => null)
    if (!toggleAtSend?.includes('orch-on')) {
      await toggle.click()
      await expect(toggle).toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    // 핵심 증거: mid-session 후속 턴의 Workflow가 canUseTool ON 게이트(G1/G2)에 걸려
    // perm-card를 띄운다(구 구조라면 세션 봉인으로 여기 도달 불가). 인라인 카드 "허용" 클릭.
    const permCard = page.locator(PERM_CARD)
    await expect(permCard).toBeVisible({ timeout: 180_000 })
    console.log('[orch-live] Test3 perm-card 등장 — mid-session ON 게이트 실효 증거')
    await permCard.locator(permChoiceSelector('allow')).click()

    // 진행: orchestration 카드(.orch-card)가 thread에 라이브(F-C).
    await expect(page.locator('.orch-card').first()).toBeVisible({ timeout: 120_000 })

    // 결과가 같은(mid-session) 대화 마지막 AI 메시지로 복귀.
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('MIDSESSION_OK', { timeout: 240_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-midsession-live.png') })
  })

  test('비승격 + G4 deny 가시화: 토글 OFF + "ultracode" 언급 → 승격 없음 → .notice-row deny 라인(ADR-032 v2 ②\'+⑥)', async () => {
    // ADR-032 개정 v2 §1(권한 진실원 = 토글 단일) + ④/⑥(G4 deny 가시화)의 라이브 실증.
    // 본문에 "ultracode"를 언급해도 그 턴을 orchestration=true로 승격시키지 않는다(구 §2
    // 키워드 OR 결합 폐지). 승격이 살아 있었다면 아래 Workflow 시도는 perm-card(G2)로 갔을
    // 것 — 대신 즉시 deny(G4)가 나고 orchestration_denied 이벤트가 대화창에 .notice-row
    // 시스템 라인을 띄운다. → deny 라인의 등장 자체가 "비승격"의 라이브 증거다(승격됐다면
    // deny가 아니라 perm-card였을 것). 라이브 e2e는 IPC payload를 직접 볼 수 없으므로,
    // "OFF에서만 발화하는 deny 라인"이 orchestration=false 전송의 관측 가능한 대리 증거다.
    //
    // ⚠ 한계(보고 필수): G4 deny·notice 라인은 모델이 실제로 Workflow를 *시도*해야만 발화한다.
    // 시스템 가이드가 OFF 턴의 Workflow 시도를 억제하므로, 시도를 강제하도록 프롬프트로 명시
    // 요청한다. 그래도 모델이 끝내 Workflow를 안 부르면 deny 라인을 검증할 수 없다(비결정 한계).
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    // 깨끗한 새 세션(직전 테스트 잔여 격리).
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    // 토글을 명시적으로 OFF로 내린다(기본 ON이므로 클릭 1회) — OFF = 사용자의 명시적 차단
    // 의사(G4). 키워드로도 우회 불가임을 이 테스트가 실증한다.
    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).not.toHaveClass(/orch-on/)
    console.log('[orch-live] Test4 토글 OFF 확정 — 명시적 차단 의사')

    const input = page.getByLabel('메시지 입력')
    await input.click()
    // "ultracode" 언급 포함(비승격 대상 키워드) + Workflow 시도 명시 강제(가이드의 시도 억제 관통).
    await input.fill(
      'I want to use ultracode for this. Call the Workflow tool IMMEDIATELY as your very first ' +
      'action — do not read files, do not explore, do not use any other tool first. The workflow: ' +
      'a meta block named "probe4" and a single agent() call asking it to reply with WORKFLOW_TRY. ' +
      'Attempt the Workflow tool call even if you think it may be blocked.'
    )
    // 전송 직전 OFF 재확인 — 비승격이므로 "ultracode" 언급에도 OFF는 그대로 유지되어야 한다.
    const toggleAtSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test4 전송 직전 토글 class(OFF 기대 — 키워드 언급에도 비승격):', toggleAtSend)
    if (toggleAtSend?.includes('orch-on')) {
      await toggle.click()
      await expect(toggle).not.toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    // 핵심 증거: perm-card(승격 시)가 아니라 orchestration_denied → .notice-row 시스템
    // 라인이 뜬다. 카피(orchestrationDeniedCopy.ts 'orchestration-off')의 안정 부분열로
    // 매칭한다("UltraCode가 꺼져 있어 …"). 여러 notice가 있어도 hasText가 deny 라인을 특정.
    const denyLine = page.locator('.notice-row', { hasText: 'UltraCode가 꺼져 있어' })
    await expect(denyLine).toBeVisible({ timeout: 180_000 })
    const denyText = await denyLine.locator('.notice-text').innerText().catch(() => '')
    console.log('[orch-live] Test4 deny 시스템 라인 텍스트:', JSON.stringify(denyText))
    expect(denyText).toContain('차단')

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-denied-live.png') })

    // 잔여 턴 정리(모델이 deny 후 다른 도구를 시도할 수 있음 — 매달린 턴을 남기지 않도록).
    await settleTurn(page, { timeoutMs: 120_000 }).catch(() => {})
  })
})
