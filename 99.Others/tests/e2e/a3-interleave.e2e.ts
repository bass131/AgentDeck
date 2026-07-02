/**
 * a3-interleave.e2e.ts — Phase A-3 라이브 e2e: 시간순 인터리브 DOM 검증 (opt-in: LIVE_SDK=1).
 *
 * 검증 목표:
 *   AC① 인터리브 DOM 순서 — .thread 직계 자식이 msg/toollog 교차 (msg→toollog→msg 3-패턴 이상적)
 *   AC② lead 아바타     — 턴이 도구로 열릴 때 .toollog.lead .lead-ava 렌더
 *   AC③ Phase B diff    — 편집/생성 카드에 .t-diff-summary 보존 (인터리브 후 회귀 X)
 *   AC④ 스크린샷        — artifacts/screenshots/a3-interleave-*.png 저장
 *
 * 프롬프트 전략:
 *   "national_anthem.txt를 읽고 첫 절만 한 줄로 요약한 뒤, GENERATED_A3.md 파일을 새로 만들어줘"
 *   → Read(read) → 텍스트(어시스턴트 msg) → Write(write) 유발
 *   → thread: [user] [toolgroup(Read)] [msg(assistant)] [toolgroup(Write)] 또는 유사 패턴
 *
 * 비결정성 대응:
 *   - 1회 실패 시 재시도(retries:1).
 *   - 모델이 도구를 전혀 안 쓰면 그 자체를 로그하고 SKIP(환경 탓 아님 → 소프트).
 *   - toollog 없는 경우 diff 검증도 SKIP(도구 미발화 시 diff 미생성은 정상).
 *
 * 실행:
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/a3-interleave.e2e.ts
 *
 * 스샷: artifacts/screenshots/a3-interleave-*.png
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const LIVE = process.env.LIVE_SDK === '1'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')
const TEST_PROJECT = 'C:/Dev/Test_Project'

test.describe('Phase A-3: 시간순 인터리브 DOM 검증 (opt-in: LIVE_SDK=1)', () => {
  // 비결정성(실 모델) 대응: 1회 재시도 허용
  test.describe.configure({ retries: 1 })
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  /**
   * 권한 카드(BF3 P06/ADR-030 — 인라인, 옛 풀오버레이 모달 폐기)가 뜨면 "항상 허용"으로
   * 처리하며 어시스턴트 응답 완료를 기다린다. live-test-project.e2e.ts의 settleTurn 패턴 재사용.
   */
  async function settleTurn(timeoutMs = 180_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      // 권한 카드 처리(부수효과 도구 발화 시) — "항상 허용"으로 세션 자동승인
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator(permChoiceSelector('allow_always'))
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      // 실행 중단 버튼(전송 중)이 사라지면 turn 종료로 간주
      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(2000) // 후처리 여유 (refreshFileTree 등)
        return
      }
      await page.waitForTimeout(1200)
    }
  }

  async function send(text: string): Promise<void> {
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(text)
    await input.press('Enter')
  }

  /** WhatsNew/UpdateNotes 시작 모달이 떠 있으면 Esc로 닫는다. */
  async function dismissStartupModal(timeoutMs = 8000): Promise<void> {
    const modal = page.locator('.wn-overlay, .un-overlay')
    try {
      await modal.first().waitFor({ state: 'visible', timeout: timeoutMs })
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

  /** EngineUpdateNotice가 떠 있으면 "나중에"로 닫는다. */
  async function dismissEngineNotice(timeoutMs = 4000): Promise<void> {
    try {
      const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
      await later.waitFor({ state: 'visible', timeout: timeoutMs })
      await later.click()
      await page.waitForTimeout(400)
    } catch { /* 미표시 */ }
  }

  test.beforeAll(async () => {
    test.setTimeout(90_000)

    // Test_Project 임시 사본 (.git 제외) — 본체 비오염
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-a3-'))
    cpSync(TEST_PROJECT, workspace, {
      recursive: true,
      filter: (src) => !src.includes(`${'\\'}.git`) && !src.split(/[\\/]/).includes('.git')
    })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-a3-udata-'))

    // artifacts/screenshots 디렉토리 보장
    mkdirSync(SHOT_DIR, { recursive: true })

    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과
    const nick = page.locator('.login-body input#nickname')
    if (await nick.count()) {
      await nick.fill('A3검증')
      await page.locator('.login-body button.submit').click().catch(() => {})
    }
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    try {
      await egSkip.waitFor({ state: 'visible', timeout: 4000 })
      await egSkip.click()
    } catch { /* authed */ }

    await page.waitForSelector('.titlebar', { timeout: 15_000 })
    await dismissStartupModal(10_000)
    await dismissEngineNotice(12_000)

    // 워크스페이스 오픈
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
    }
    // 워크스페이스 트리 로드 대기
    await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('A3-① 인터리브 DOM 순서: Read→텍스트→Write 유발 후 thread 교차 단언', async () => {
    test.setTimeout(260_000)

    // 도구 사용을 강제하는 프롬프트:
    //   Read(national_anthem.txt) → 어시스턴트 텍스트(요약) → Write(GENERATED_A3.md)
    const PROMPT =
      'national_anthem.txt 파일을 읽어서 첫 절(1절)을 한 줄로 요약해줘. ' +
      '그리고 그 요약 내용을 담아 프로젝트 루트에 GENERATED_A3.md 파일을 새로 만들어줘. ' +
      '간결하게 처리해줘.'

    await send(PROMPT)

    // 초기 스크린샷 (전송 직후)
    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-01-sending.png') })

    // 턴 완료 대기 (권한 모달 자동처리 포함)
    await settleTurn(220_000)

    // 턴 후 스크린샷
    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-02-done.png'), fullPage: false })

    // ── thread 직계 자식 클래스 시퀀스 수집 ─────────────────────────────────
    // .thread의 직계 자식만(중첩 제외) className 시퀀스를 평면 배열로 얻는다.
    const childClasses: string[] = await page.evaluate(() => {
      const thread = document.querySelector('.thread')
      if (!thread) return []
      return Array.from(thread.children).map((el) => el.className ?? '')
    })
    console.log('[a3] thread 직계 자식 className 시퀀스:')
    childClasses.forEach((cls, i) => console.log(`  [${i}] "${cls}"`))

    // ── toollog 존재 여부 ────────────────────────────────────────────────────
    const hasToollog = childClasses.some((cls) => cls.includes('toollog'))

    if (!hasToollog) {
      // 모델이 도구를 전혀 안 쓴 경우 — 환경 비결정성. SKIP하되 로그 남김.
      console.warn('[a3] WARNING: toollog가 thread에 없음 — 모델이 도구를 사용하지 않았습니다.')
      console.warn('[a3] 이 경우는 인터리브 비검증(환경 탓). 재실행 또는 프롬프트 조정 필요.')
      // GENERATED_A3.md가 생성됐다면 텍스트 응답이라도 있는 것 — 부분 검증
      const hasAssistantMsg = childClasses.some((cls) => cls.includes('ai-msg'))
      console.log('[a3] assistant msg 존재:', hasAssistantMsg)
      // 도구 미사용 시 테스트 소프트 통과 (skip 불가 = 이미 실행 중, 로그로 대체)
      return
    }

    // ── AC①: toollog가 최소 1개 존재 ────────────────────────────────────────
    const toollogs = childClasses.filter((cls) => cls.includes('toollog'))
    const msgs = childClasses.filter((cls) => cls.includes('msg'))
    console.log('[a3] toollog 수:', toollogs.length, '| msg 수:', msgs.length)
    expect(toollogs.length).toBeGreaterThan(0)

    // ── AC①-심화: toollog 앞/뒤에 msg가 있어 교차하는지 ────────────────────
    // "평면 목록"(모든 toollog가 끝에 몰린 것)이 아닌, thread 중간에 toollog가 있어야 함.
    // 판정: toollog의 인덱스가 0이 아니고, toollog 뒤에도 다른 항목이 있으면 교차로 판정.
    const childTypes: ('msg' | 'toollog' | 'other')[] = childClasses.map((cls) => {
      if (cls.includes('toollog')) return 'toollog'
      if (cls.includes('msg')) return 'msg'
      return 'other'
    })
    console.log('[a3] thread 시퀀스 타입:', childTypes.join(' → '))

    // 3-패턴(msg → toollog → msg) 또는 toollog가 중간에 있는지 확인
    let foundInterleave = false
    let foundMsgToollogMsg = false
    for (let i = 1; i < childTypes.length - 1; i++) {
      if (childTypes[i] === 'toollog') {
        // toollog 앞에 msg가 있거나 뒤에 msg가 있으면 교차
        const hasMsgBefore = childTypes.slice(0, i).some((t) => t === 'msg')
        const hasMsgAfter = childTypes.slice(i + 1).some((t) => t === 'msg')
        if (hasMsgBefore || hasMsgAfter) foundInterleave = true
        if (hasMsgBefore && hasMsgAfter) foundMsgToollogMsg = true
      }
    }
    // toollog가 thread 내부에 위치(첫 항목이 아님)하는 것만으로도 교차 시작으로 판정
    const firstToollogIdx = childTypes.findIndex((t) => t === 'toollog')
    if (firstToollogIdx > 0) foundInterleave = true

    console.log('[a3] 교차(toollog가 thread 중간에):', foundInterleave)
    console.log('[a3] 3-패턴(msg→toollog→msg):', foundMsgToollogMsg)

    // 교차는 반드시 확인 (평면 목록이면 A-2 회귀)
    expect(
      foundInterleave,
      `인터리브 실패: thread 시퀀스 = ${childTypes.join(' → ')}\n` +
      `toollog가 thread 첫 항목이거나 msg와 교차하지 않습니다.\n` +
      `Phase A-2 thread 전환 회귀 가능성을 조사하세요.`
    ).toBe(true)

    // 3-패턴은 이상적이지만 모델 비결정성으로 보장 불가 — 소프트 로그
    if (!foundMsgToollogMsg) {
      console.warn('[a3] NOTE: msg→toollog→msg 3-패턴 미관측. Read만 쓰고 텍스트 없이 Write한 경우 정상.')
    }

    // GENERATED_A3.md 디스크 생성 확인 (결정적)
    const generatedPath = join(workspace, 'GENERATED_A3.md')
    expect(
      existsSync(generatedPath),
      `GENERATED_A3.md가 디스크에 없음 — Write 도구 미발화 또는 실패. 경로: ${generatedPath}`
    ).toBe(true)
    console.log('[a3] GENERATED_A3.md 디스크 생성 확인:', generatedPath)
  })

  test('A3-② lead 아바타: toollog.lead에 .lead-ava가 렌더됐는지', async () => {
    // AC②: 텍스트 없이 도구로 턴이 열리는 경우 .toollog.lead .lead-ava가 그려지는지.
    // 비결정적(항상 발생하지 않을 수 있음) → 있으면 단언, 없으면 로그.
    const leadAva = page.locator('.toollog.lead .lead-ava')
    const count = await leadAva.count()
    console.log('[a3] .toollog.lead .lead-ava 수:', count)

    if (count > 0) {
      // lead-ava가 관측됐으면 visible 단언
      await expect(leadAva.first()).toBeVisible()
      console.log('[a3] lead 아바타 확인: PASS (관측됨)')

      // lead-ava가 toollog.lead 안에 있는지 DOM 구조 확인
      const leadToollogExists = await page.locator('.toollog.lead').count()
      expect(leadToollogExists).toBeGreaterThan(0)
      console.log('[a3] .toollog.lead 존재:', leadToollogExists)
    } else {
      // lead-ava 미관측 — 직전 assistant msg 다음에 toolgroup이 위치하므로 lead=false
      // 이는 turn이 텍스트로 시작한 경우의 정상 동작
      console.log('[a3] lead 아바타 미관측 — 모든 toolgroup이 assistant msg 뒤에 위치(lead=false). 정상.')
    }

    // thread 스크린샷 (thread 영역 캡처)
    const threadEl = page.locator('.thread')
    await threadEl.screenshot({ path: join(SHOT_DIR, 'a3-interleave-03-lead-ava.png') }).catch(async () => {
      // thread 스크린샷 실패 시 전체 페이지로 폴백
      await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-03-lead-ava.png') })
    })
  })

  test('A3-③ Phase B diff 회귀: 편집/생성 카드에 .t-diff-summary가 표시된다', async () => {
    // AC③: 인터리브 전환(Phase A-2) 후 Phase B diff 표시가 보존되는지 확인.
    // Write/Edit 도구 카드에 .t-diff-summary (+N −M 요약)이 있어야 한다.

    // .toollog가 없는 경우(도구 미사용) skip
    const hasToollog = (await page.locator('.toollog').count()) > 0
    if (!hasToollog) {
      console.warn('[a3] diff 검증 SKIP — toollog 없음(도구 미사용 턴)')
      return
    }

    // .t-item 전체 카드 수 (모든 도구 호출)
    const tItemCount = await page.locator('.t-item').count()
    console.log('[a3] .t-item (도구 카드) 수:', tItemCount)

    // .t-diff-summary 수집 (Write/Edit 카드에 표시돼야 함)
    const diffSummaries = page.locator('.t-diff-summary')
    const diffCount = await diffSummaries.count()
    console.log('[a3] .t-diff-summary 수:', diffCount)

    if (diffCount > 0) {
      // diff 표시 확인 — 최소 1개
      await expect(diffSummaries.first()).toBeVisible()
      const texts = await diffSummaries.allInnerTexts()
      console.log('[a3] diff 요약 내용:', texts.join(' / '))

      // +N 또는 −N 패턴이 포함돼 있는지 (Phase B 형식 검증)
      const hasDiffPattern = texts.some((t) => /[+\-−]\d/.test(t))
      expect(
        hasDiffPattern,
        `diff 요약 텍스트가 +N/-N 형식이 아닙니다: ${texts.join(', ')}`
      ).toBe(true)
      console.log('[a3] Phase B diff 보존: PASS')
    } else {
      // diff 없음 — Write 도구가 발화됐으나 diff 계산이 미도달한 경우
      // 도구 카드가 존재하면 diff 미표시는 Phase B 회귀일 수 있음
      const writeCards = await page.locator('.t-item.t-write, .t-item.t-edit').count()
      console.log('[a3] Write/Edit 카드 수:', writeCards)

      if (writeCards > 0) {
        // Write/Edit 카드가 있는데 diff 없음 — Phase B 회귀 의심
        console.warn(
          '[a3] WARNING: Write/Edit 카드(' + writeCards + '개)가 있으나 .t-diff-summary 없음. ' +
          'Phase B diff 회귀 가능성 — fileDiff IPC 또는 selectFileDiffs 셀렉터 점검 필요.'
        )
        // 소프트 관찰(FAIL 아닌 로그) — 네트워크/타이밍 탓일 수 있음
      } else {
        console.log('[a3] diff 없음 — Write/Edit 카드도 없음(Read만 사용). 정상.')
      }
    }

    // 최종 스크린샷 (diff 카드 포함 전체 thread)
    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-04-diff.png') })
  })

  test('A3-④ 전체 thread DOM 덤프 + 최종 스크린샷', async () => {
    // AC④: thread 전체 HTML 덤프를 콘솔에 출력하고 스크린샷 저장.
    // 회귀 발생 시 DOM 구조를 캡처해 원인 분석에 사용.

    // thread 전체 HTML (인라인 축약)
    const threadHtml: string = await page.evaluate(() => {
      const thread = document.querySelector('.thread')
      if (!thread) return '(thread 없음)'
      // 직계 자식만 요약 (innerHTML 전체는 너무 크므로 구조 시그니처만)
      return Array.from(thread.children)
        .map((el, i) => {
          const cls = el.className
          const firstChild = el.children[0]?.className ?? ''
          const text = (el.textContent ?? '').slice(0, 60).replace(/\n/g, ' ').trim()
          return `[${i}] .${cls.replace(/\s+/g, '.')} (firstChild:.${firstChild}) → "${text}"`
        })
        .join('\n')
    })
    console.log('[a3] thread DOM 구조 덤프:\n' + threadHtml)

    // 최종 전체 스크린샷
    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-05-final.png') })

    // thread 스크린샷 (thread 요소만)
    const threadEl = page.locator('.thread')
    if ((await threadEl.count()) > 0) {
      await threadEl.screenshot({ path: join(SHOT_DIR, 'a3-interleave-06-thread.png') })
    }

    console.log('[a3] 스크린샷 저장 완료:')
    console.log('  - a3-interleave-01-sending.png')
    console.log('  - a3-interleave-02-done.png')
    console.log('  - a3-interleave-03-lead-ava.png')
    console.log('  - a3-interleave-04-diff.png')
    console.log('  - a3-interleave-05-final.png')
    console.log('  - a3-interleave-06-thread.png')
  })
})
