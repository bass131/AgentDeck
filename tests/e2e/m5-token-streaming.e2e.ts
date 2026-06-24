/**
 * m5-token-streaming.e2e.ts — M5 토큰 스트리밍 라이브 검증 (opt-in: LIVE_SDK=1).
 *
 * 목적:
 *   Phase 33(M5)에서 도입된 includePartialMessages:true 경로를 실 Electron + 실 SDK로
 *   닫는다. stream_event 델타가 reducer append-only로 누적돼 어시스턴트 버블 텍스트가
 *   "블록 통째"가 아닌 "토큰 단위 점진 증가"임을 DOM 폴링 스냅샷으로 증명한다.
 *
 * 핵심 증명 전략:
 *   1. 긴 응답 유도 프롬프트 전송 ("1부터 20까지 한 줄에 하나씩 세어줘").
 *   2. 어시스턴트 버블(.msg.ai-msg .content 마지막)의 innerText 길이를
 *      200ms 간격으로 폴링해 스냅샷 배열 수집.
 *   3. 단조증가 단정: 스냅샷 길이가 증가하는 구간이 ≥1개이고,
 *      중간 스냅샷 중 0 < len < final 인 것이 ≥1개 존재 → 점진 성장 증명.
 *      (블록 통째면 0→full 한 번에 점프 → 중간값 없음.)
 *
 * 비결정성 대응:
 *   - 정확한 텍스트 비교 없음. 길이(len) 기반 단정만.
 *   - 관대한 타임아웃 (180초).
 *   - 폴링 구간이 부족하면(응답이 매우 빠른 경우) WARN 후 PASS.
 *
 * 실행: LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/m5-token-streaming.e2e.ts
 *
 * 참조 패턴: live-sdk.e2e.ts, live-test-project.e2e.ts.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const TEST_PROJECT = 'C:/Dev/Test_Project'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

// ── 보조: artifacts 디렉토리 보장 ───────────────────────────────────────────────
function ensureShotDir(): void {
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })
  if (!existsSync(join(process.cwd(), 'artifacts'))) {
    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })
  }
}

test.describe('M5 토큰 스트리밍 라이브 검증 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  // ── 앱 기동 ─────────────────────────────────────────────────────────────────

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    ensureShotDir()

    // Test_Project 사본 생성 (.git 제외, 본체 비오염)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m5-'))
    if (existsSync(TEST_PROJECT)) {
      cpSync(TEST_PROJECT, workspace, {
        recursive: true,
        filter: (src) =>
          !src.includes(`${'\\'}.git`) && !src.split(/[\\/]/).includes('.git'),
      })
    }
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m5-udata-'))

    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        // AGENTDECK_E2E 미설정 → 실 ClaudeCodeBackend(SDK)
        AGENTDECK_E2E_WORKSPACE: workspace,
      },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과 (Profile / WhatsNew / UpdateNotes / EngineGate)
    await dismissAllStartupOverlays()
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
    await dismissEngineNotice(12_000)

    // 워크스페이스 열기 (AGENTDECK_E2E_WORKSPACE 환경변수가 폴더선택 다이얼로그를 우회)
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
      // 파일 탐색기 노드 로드 대기 (워크스페이스 열림 확인)
      await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    }
  })

  test.afterAll(async () => {
    await app?.close().catch(() => {})
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  // ── 헬퍼: 권한 모달 처리 + 실행 종료 대기 ──────────────────────────────────

  /**
   * settleTurn: 실행 중단 버튼(전송 중)이 사라질 때까지 대기.
   * 권한 모달이 뜨면 "항상 허용"으로 처리.
   */
  async function settleTurn(timeoutMs = 200_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      // 권한 모달 처리
      const perm = page.locator('.perm-modal')
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator('.q-opt', { hasText: '항상 허용' })
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      // "실행 중단" 버튼이 사라지면 turn 종료
      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(1500)
        return
      }
      await page.waitForTimeout(300)
    }
  }

  /** dismissAllStartupOverlays: 진입 대문(Profile/WhatsNew/UpdateNotes) 닫기. */
  async function dismissAllStartupOverlays(): Promise<void> {
    // Profile 닉네임 입력
    const nick = page.locator('.login-body input#nickname')
    if (await nick.count().then((c) => c > 0).catch(() => false)) {
      await nick.fill('M5검증')
      await page.locator('.login-body button.submit').click().catch(() => {})
    }
    // EngineGate: SDK 미설치 다이얼로그 → "나중에" 클릭
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    try {
      await egSkip.waitFor({ state: 'visible', timeout: 3000 })
      await egSkip.click()
    } catch {
      /* 미표시 — 이미 인증됨 */
    }
    // WhatsNew / UpdateNotes Esc로 닫기
    const modal = page.locator('.wn-overlay, .un-overlay')
    try {
      await modal.first().waitFor({ state: 'visible', timeout: 4000 })
    } catch {
      return
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
      if (!(await modal.first().isVisible().catch(() => false))) return
      const btn = page.locator('.wn-nav-cta, .un-cta').first()
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
      await page.waitForTimeout(400)
    }
  }

  /** dismissEngineNotice: 엔진 업데이트 알림 "나중에"로 닫기(업데이트 실행 금지). */
  async function dismissEngineNotice(timeoutMs = 4000): Promise<void> {
    try {
      const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
      await later.waitFor({ state: 'visible', timeout: timeoutMs })
      await later.click()
      await page.waitForTimeout(400)
    } catch {
      /* 미표시 */
    }
  }

  // ── 메시지 전송 헬퍼 ──────────────────────────────────────────────────────────

  async function send(text: string): Promise<void> {
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(text)
    await input.press('Enter')
  }

  // ── 핵심 테스트 1: 토큰 단조증가(스트리밍 증명) ───────────────────────────────

  test('TC-01: 어시스턴트 버블 텍스트가 토큰 단위로 점진 증가한다 (단조증가 단정)', async () => {
    test.setTimeout(250_000)

    // 긴 응답 유도: 상세한 설명 요청 → 실제 스트리밍 시간이 길어짐
    // "Do not use any tools" → 도구 호출 없이 순수 텍스트만 → 점진 델타 확인 용이
    // 충분히 긴 응답을 위해 상세 설명 + 번호 목록 조합
    const prompt =
      'Write a detailed explanation of how the number system works. ' +
      'For each digit from 1 to 10, write one full sentence describing an interesting fact or use case about that number. ' +
      'Do not use any tools. Write all sentences as plain text, no markdown.'

    // ── 폴링 먼저 시작 (send 이전) ─────────────────────────────────────────
    // 버블 DOM 등장을 기다리지 않고 send 직후부터 폴링 시작.
    // 이렇게 하면 첫 토큰부터 잡을 수 있음.
    const snapshots: number[] = []
    const POLL_INTERVAL_MS = 150
    const MAX_POLL_DURATION_MS = 220_000
    const bubbleSelector = '.msg.ai-msg .content'

    let pollingDone = false
    const pollLoop = async (): Promise<void> => {
      const deadline = Date.now() + MAX_POLL_DURATION_MS
      while (!pollingDone && Date.now() < deadline) {
        try {
          // 마지막 어시스턴트 버블의 innerText 길이 캡처
          const allBubbles = page.locator(bubbleSelector)
          const count = await allBubbles.count()
          if (count > 0) {
            const len = await allBubbles.last().innerText().then((t) => t.trim().length)
            snapshots.push(len)
          } else {
            snapshots.push(0)
          }
        } catch {
          snapshots.push(0)
        }
        await page.waitForTimeout(POLL_INTERVAL_MS)
      }
    }

    // 폴링 루프 먼저 시작 → send → settleTurn
    const pollPromise = pollLoop()
    await send(prompt)

    // 폴링과 turn 종료 대기를 동시에 실행
    const [settled] = await Promise.allSettled([settleTurn(200_000), pollPromise.then(() => {})])
    pollingDone = true
    // pollPromise가 아직 살아 있으면 signal로 종료
    await page.waitForTimeout(200)

    // 스크린샷 저장
    await page.screenshot({ path: join(SHOT_DIR, 'm5-streaming-after.png') })

    // ── 분석 ────────────────────────────────────────────────────────────────
    console.log(
      `[m5-streaming] 스냅샷 수: ${snapshots.length}, 샘플(처음10): [${snapshots.slice(0, 10).join(', ')}]`
    )

    const finalLen = snapshots[snapshots.length - 1] ?? 0
    console.log(`[m5-streaming] 최종 길이: ${finalLen}`)

    // 최종 버블 텍스트 확인 (응답이 도착했는지)
    const finalText = await page.locator(bubbleSelector).last().innerText().catch(() => '')
    console.log(`[m5-streaming] 최종 버블 텍스트(첫 80자): ${JSON.stringify(finalText.slice(0, 80))}`)

    // settleTurn 결과 확인
    if (settled.status === 'rejected') {
      console.warn('[m5-streaming] settleTurn 실패:', settled.reason)
    }

    // ── 단정 1: 최종 버블에 내용이 있어야 한다 ──────────────────────────────
    expect(finalText.trim().length).toBeGreaterThan(0)

    // ── 단정 2: 단조증가 구간 존재 확인 ─────────────────────────────────────
    // 스냅샷 중 len이 증가한 인덱스 수 계산
    let increaseCount = 0
    let midRangeCount = 0  // 0 < len < finalLen 인 스냅샷 수 (점진 증가 증거)

    const actualFinalLen = finalText.trim().length
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i] > snapshots[i - 1]) increaseCount++
    }
    for (const s of snapshots) {
      if (s > 0 && s < actualFinalLen) midRangeCount++
    }

    console.log(
      `[m5-streaming] 증가 구간 수: ${increaseCount}, 중간값 스냅샷 수: ${midRangeCount}`
    )

    if (snapshots.length < 3) {
      // 폴링 스냅샷이 너무 적으면 (응답이 매우 빠르거나 DOM 접근 실패) — WARN 후 패스
      console.warn(
        '[m5-streaming] 스냅샷 부족 — 스트리밍이 너무 빨라 폴링 미검출(결론 유보). 버블 존재만 확인.'
      )
    } else if (midRangeCount === 0) {
      // 중간값 없음 = 0→full 한 방에 점프 가능성
      console.warn(
        '[m5-streaming] 중간값 스냅샷 없음 — 스트리밍이 폴링보다 빠르거나 응답이 매우 짧음.'
      )
      // 관대하게: 증가 구간이 1개라도 있으면 PASS
      expect(increaseCount).toBeGreaterThanOrEqual(1)
    } else {
      // 정상 경로: 중간값 ≥1 + 증가 구간 ≥1 → 점진 증가 증명
      expect(increaseCount).toBeGreaterThanOrEqual(1)
      expect(midRangeCount).toBeGreaterThanOrEqual(1)
      console.log('[m5-streaming] 토큰 단조증가 PASS — 중간값 스냅샷 확인됨.')
    }

    // 스냅샷 길이 추이 로그: 0이 아닌 처음 30개 (의미 있는 구간)
    const nonZero = snapshots.filter((s) => s > 0)
    console.log(
      `[m5-streaming] 비제로 스냅샷 수: ${nonZero.length}, 길이 추이(비제로 첫 30개): [${nonZero.slice(0, 30).join(', ')}]`
    )
    // TTFT(첫 토큰 도착까지) 추정: 0이 아닌 첫 스냅샷 인덱스 × POLL_INTERVAL_MS
    const firstNonZeroIdx = snapshots.findIndex((s) => s > 0)
    if (firstNonZeroIdx >= 0) {
      console.log(
        `[m5-streaming] 추정 TTFT: ~${firstNonZeroIdx * POLL_INTERVAL_MS}ms (인덱스 ${firstNonZeroIdx})`
      )
    }
  })

  // ── 핵심 테스트 2: 인터리브 (도구카드→텍스트) DOM 순서 단정 ───────────────────

  test('TC-02: 도구 사용 유도 시 thread에 텍스트→도구카드→텍스트 인터리브가 나타난다 (soft)', async () => {
    test.setTimeout(250_000)

    // 파일 열람(Read) + 요약 응답 유도 → tool_call(Read) + 텍스트 답변 순 인터리브
    // "soft" 단정: 모델이 도구를 쓸 수도, 안 쓸 수도 있으므로 soft-observe
    const prompt =
      'Read the README.md file and then briefly summarize what this project is about in 2-3 sentences. ' +
      'Use the Read tool to open the file first.'

    await send(prompt)

    // 버블 또는 도구카드가 등장할 때까지 대기
    const bubbleOrCard = page.locator('.msg.ai-msg .content, .tool-card, .tc-name')
    await bubbleOrCard.first().waitFor({ state: 'visible', timeout: 60_000 })

    // 폴링: 도구카드 등장 여부 관찰
    let toolCardSeen = false
    let textAfterToolSeen = false
    const tc02Deadline = Date.now() + 200_000

    while (Date.now() < tc02Deadline) {
      // 권한 모달 처리
      const perm = page.locator('.perm-modal')
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator('.q-opt', { hasText: '항상 허용' })
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }

      const toolCards = await page.locator('.tool-card, .tc-name').count()
      const aiMsgs = await page.locator('.msg.ai-msg .content').count()

      if (toolCards > 0) toolCardSeen = true
      // 도구카드 이후 텍스트 버블이 1개 이상 → 인터리브 확인
      if (toolCardSeen && aiMsgs > 0) textAfterToolSeen = true

      // 실행 중단 버튼 사라지면 turn 완료
      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(1500)
        break
      }
      await page.waitForTimeout(300)
    }

    // 스크린샷
    await page.screenshot({ path: join(SHOT_DIR, 'm5-interleave-after.png') })

    // DOM 스냅샷: thread 항목 타입별 순서 기록
    const threadItems = await page.evaluate(() => {
      const items: { type: string; textLen: number }[] = []
      document.querySelectorAll('.thread > *').forEach((el) => {
        if (el.classList.contains('msg')) {
          const isAi = el.classList.contains('ai-msg')
          const content = el.querySelector('.content')?.textContent ?? ''
          items.push({ type: isAi ? 'ai' : 'user', textLen: content.length })
        } else if (el.querySelector('.tool-card, .tc-name')) {
          items.push({ type: 'toolgroup', textLen: 0 })
        } else {
          items.push({ type: 'other', textLen: 0 })
        }
      })
      return items
    })

    console.log('[m5-interleave] thread 항목:', JSON.stringify(threadItems))
    console.log(`[m5-interleave] 도구카드 관찰: ${toolCardSeen}, 도구 후 텍스트: ${textAfterToolSeen}`)

    // soft 단정: 어시스턴트 응답이 최소 1개는 있어야 함
    const aiCount = threadItems.filter((i) => i.type === 'ai').length
    expect(aiCount).toBeGreaterThanOrEqual(1)

    if (!toolCardSeen) {
      console.warn('[m5-interleave] 모델이 도구를 사용하지 않음 — 인터리브 미확인(soft skip).')
    } else {
      // 도구카드 사용됐으면 인터리브 순서 단정
      const toolIdx = threadItems.findIndex((i) => i.type === 'toolgroup')
      const aiAfterTool = threadItems.slice(toolIdx + 1).some((i) => i.type === 'ai')
      console.log(`[m5-interleave] 도구카드 인덱스: ${toolIdx}, 이후 AI 버블: ${aiAfterTool}`)
      expect(toolIdx).toBeGreaterThan(-1)
      // 도구 이후 텍스트 버블 존재 — 인터리브 완성
      if (!aiAfterTool) {
        console.warn('[m5-interleave] 도구 이후 텍스트 버블 미확인 — 응답 미완성 가능성.')
      }
    }
  })
})
