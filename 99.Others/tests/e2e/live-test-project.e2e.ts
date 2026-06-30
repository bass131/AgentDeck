/**
 * live-test-project.e2e.ts — Test_Project 실 에이전트 기능 종합 검증 (opt-in: LIVE_SDK=1).
 *
 * 실 Electron + 실 Agent SDK(구독 인증)로 Test_Project 사본을 워크스페이스 삼아
 * 에이전트에게 실제 작업을 시키고 GUI 반영을 실측한다:
 *   B1 채팅 스트리밍 · B2 파일산출(Write) · B3 변경파일 GUI 갱신(트리/changed-dot) ·
 *   B4 Task(todos) 갱신 · B5 SubAgent 갱신 · 권한 모달 흐름.
 *
 * 실행: LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/live-test-project.e2e.ts
 * 스샷: artifacts/screenshots/live-tp-*.png (사람/AI 육안 검증)
 *
 * 비결정성(실 모델): 디스크 산출·트리 반영처럼 결정적인 건 hard-assert,
 *   모델 의존(todos/subagent 사용 여부)은 soft-observe(로그+스샷)로 관찰.
 * Test_Project 본체는 건드리지 않는다(임시 사본에서만 작업).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')
const TEST_PROJECT = 'C:/Dev/Test_Project'

test.describe('Test_Project 실 에이전트 기능 종합 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  /** 권한 모달이 뜨면 "항상 허용"으로 처리하며 어시스턴트 응답 완료를 기다린다. */
  async function settleTurn(timeoutMs = 180_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      // 권한 모달 처리(부수효과 도구 발화 시) — "항상 허용"으로 세션 자동승인
      const perm = page.locator('.perm-modal')
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator('.q-opt', { hasText: '항상 허용' })
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      // 실행 중단 버튼(전송 중)이 사라지면 turn 종료로 간주
      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(1500) // P13 refreshFileTree 등 후처리 여유
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

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-tp-'))
    // Test_Project 사본(.git 제외) — 본체 비오염
    cpSync(TEST_PROJECT, workspace, {
      recursive: true,
      filter: (src) => !src.includes(`${'\\'}.git`) && !src.split(/[\\/]/).includes('.git')
    })
    // B6: 프로젝트 로컬 슬래시 커맨드 — .claude/commands/<name>.md 생성(팔레트 노출 검증용)
    mkdirSync(join(workspace, '.claude', 'commands'), { recursive: true })
    writeFileSync(
      join(workspace, '.claude', 'commands', 'hello-parity.md'),
      '---\ndescription: 패리티 검증용 로컬 슬래시 커맨드\nargument-hint: "[name]"\n---\n\n안녕 $1\n'
    )
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-tp-udata-'))

    app = await electron.launch({
      // AGENTDECK_E2E 미설정 → 실 ClaudeCodeBackend(SDK). 워크스페이스만 env 우회.
      args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과
    const nick = page.locator('.login-body input#nickname')
    if (await nick.count()) {
      await nick.fill('TP검증')
      await page.locator('.login-body button.submit').click().catch(() => {})
    }
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    try {
      await egSkip.waitFor({ state: 'visible', timeout: 4000 })
      await egSkip.click()
    } catch { /* authed */ }
    await page.waitForSelector('.titlebar', { timeout: 15_000 })
    // 시작 모달(WhatsNew 첫실행 / UpdateNotes 버전업) — 비동기 등장, Esc로 닫는다(둘 다 지원).
    await dismissStartupModal(10_000)
    // 엔진 업데이트 알림(비동기 등장) — 반드시 "나중에"(sd-cancel)로 닫는다.
    // sd-go("업데이트")를 누르면 실 npm 설치가 시작되므로 금지.
    await dismissEngineNotice(12_000)
    // 워크스페이스 오픈: AGENTDECK_E2E_WORKSPACE는 자동오픈이 아니라 "폴더 선택" 동작 시
    // 네이티브 다이얼로그를 우회한다 → 빈상태면 "폴더 선택" 클릭으로 워크스페이스를 연다.
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
    }
    // 워크스페이스 트리 로드 확인
    await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: 10_000 })
  })

  /** WhatsNew/UpdateNotes 시작 모달이 떠 있으면 Esc(+CTA)로 닫는다. */
  async function dismissStartupModal(timeoutMs = 8000): Promise<void> {
    const modal = page.locator('.wn-overlay, .un-overlay')
    try {
      await modal.first().waitFor({ state: 'visible', timeout: timeoutMs })
    } catch { return /* 안 뜸 */ }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
      if (!(await modal.first().isVisible().catch(() => false))) return
      // Esc 미동작 시 스킵/CTA 버튼
      const btn = page.locator('.wn-nav-cta, .un-cta').first()
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
      await page.waitForTimeout(400)
    }
  }

  /** EngineUpdateNotice가 떠 있으면 "나중에"로 닫는다(업데이트 시작 금지). */
  async function dismissEngineNotice(timeoutMs = 4000): Promise<void> {
    try {
      const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
      await later.waitFor({ state: 'visible', timeout: timeoutMs })
      await later.click()
      await page.waitForTimeout(400)
    } catch { /* 미표시 */ }
  }

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('탐색기에 Test_Project 파일이 보인다', async () => {
    await page.screenshot({ path: join(SHOT_DIR, 'live-tp-00-initial.png') })
    // 트리에 핵심 파일/폴더 노출(워크스페이스 로드 확인)
    await expect(page.locator('.fe-node-name', { hasText: 'national_anthem.txt' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.fe-node-name', { hasText: 'README.md' })).toBeVisible()
    await expect(page.locator('.fe-node-name', { hasText: 'src' })).toBeVisible()
  })

  test('B6: 로컬 슬래시 커맨드(.claude/commands)가 팔레트에 뜬다', async () => {
    // '/' 입력 → 슬래시 팔레트 노출 → 프로젝트 로컬 커맨드 hello-parity 포함 확인.
    // (실 에이전트 불요 — command.list IPC + 워크스페이스 .claude/commands 스캔 검증.)
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/')
    const menu = page.locator('.slash-menu')
    await menu.waitFor({ state: 'visible', timeout: 6000 })
    const names = await menu.locator('.slash-name').allInnerTexts()
    console.log('[live-tp] 슬래시 팔레트 항목:', names.join(' '))
    expect(names.some((n) => n.includes('hello-parity'))).toBe(true)
    // 빌트인도 함께(정직한 6개 중 하나)
    expect(names.some((n) => n.includes('compact'))).toBe(true)
    await input.fill('')
  })

  test('B1~B4: 파일생성+수정+todo → 채팅 응답·트리갱신·changed-dot·todos', async () => {
    test.setTimeout(260_000)
    await send(
      'TaskCreate와 TaskUpdate 도구를 반드시 사용해서 진행해줘. ' +
      '먼저 TaskCreate로 두 개의 할 일을 만들어: (1) GENERATED.md 생성, (2) national_anthem.txt 수정. ' +
      '그다음 각 단계를 실제로 수행하면서 TaskUpdate로 진행/완료 상태를 갱신해줘: ' +
      '1) 프로젝트 루트에 GENERATED.md 파일을 만들고 이 프로젝트가 무엇인지 한 문장으로 적어줘. ' +
      '2) national_anthem.txt 끝에 "# verified by agent" 한 줄을 추가해줘. 간결하게.'
    )
    await settleTurn(220_000)
    await page.screenshot({ path: join(SHOT_DIR, 'live-tp-01-after-edit.png') })

    // B1 채팅: 어시스턴트 응답 존재
    await expect(page.locator('.msg.ai-msg .content').last()).toBeVisible()

    // B2 파일산출: 디스크에 GENERATED.md 생성(결정적)
    expect(existsSync(join(workspace, 'GENERATED.md'))).toBe(true)

    // B3 변경파일 GUI: 트리에 새 파일 노출 + national_anthem.txt changed-dot
    await expect(page.locator('.fe-node-name', { hasText: 'GENERATED.md' })).toBeVisible({ timeout: 8000 })
    const changedDots = await page.locator('.fe-changed-dot').count()
    console.log('[live-tp] changed-dot 개수:', changedDots)

    // B4 todos(soft): 모델이 TodoWrite 썼으면 패널 노출
    const todoCount = await page.locator('.todos').count()
    console.log('[live-tp] todos 패널 존재:', todoCount)
  })

  test('Phase B: 파일편집 도구 카드에 diff 요약(+N −M)이 표시된다', async () => {
    // 직전 B1~B4에서 Write(GENERATED.md 신규)+Edit(national_anthem.txt)를 수행 →
    // backend가 whole-file diff 계산·emit → ToolCallCard에 +add −del 요약 표시.
    const summaries = page.locator('.t-diff-summary')
    await expect(summaries.first()).toBeVisible({ timeout: 8000 })
    const count = await summaries.count()
    const texts = await summaries.allInnerTexts()
    console.log('[live-tp] diff 요약 카드 수:', count, '|', texts.join(' / '))
    expect(count).toBeGreaterThan(0)
  })

  test('B7 Step2(ADR-019): 실 run 후 팔레트가 SDK supportedCommands로 확장된다', async () => {
    // 직전 B1~B4 run에서 ClaudeCodeBackend가 supportedCommands()를 캡처·캐시.
    // 이제 '/' 팔레트가 큐레이션 6 + 커스텀 외에 캡처된 엔진 빌트인(config/context/...)을 포함해야 한다.
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/')
    const menu = page.locator('.slash-menu')
    await menu.waitFor({ state: 'visible', timeout: 6000 })
    const names = await menu.locator('.slash-name').allInnerTexts()
    console.log('[live-tp] 캡처 후 팔레트(' + names.length + '):', names.join(' '))
    // 원인 분리: 렌더러 캐시 우회하고 IPC 직접 호출 → 백엔드(캡처/wsKey) 검증
    const rawIpc = await page.evaluate(() => window.api.listSlashCommands())
    console.log('[live-tp] IPC 직접(' + rawIpc.length + '):', rawIpc.map((c) => c.name).join(' '))
    // 큐레이션 6 + 커스텀(hello-parity·meetingnote) = 8. 캡처가 더해지면 8 초과.
    const curatedAndCustom = new Set([
      'ask', 'clear', 'compact', 'init', 'review', 'security-review',
      'hello-parity', 'meetingnote'
    ])
    const captured = names.filter((n) => !curatedAndCustom.has(n.trim()))
    console.log('[live-tp] 캡처로 추가된 커맨드:', captured.join(' ') || '(없음)')
    expect(captured.length).toBeGreaterThan(0)
    await input.fill('')
  })

  test('ADR-020: 실 run으로 저장된 대화에 cwd(워크스페이스)가 기록된다', async () => {
    // 직전 B1~B4 run이 대화를 저장 → cwd=현재 워크스페이스가 DB에 기록돼야 한다.
    const convs = await page.evaluate(() => window.api.conversationLoad({ limit: 5 }))
    const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
    const withCwd = convs.conversations.filter((c) => c.cwd)
    console.log('[live-tp] 저장된 대화 cwd:', withCwd.map((c) => c.cwd).join(' | ') || '(없음)')
    expect(withCwd.length).toBeGreaterThan(0)
    // 워크스페이스 경로(임시 사본)와 일치하는 cwd가 있어야 한다(앵커링).
    expect(withCwd.some((c) => norm(c.cwd as string) === norm(workspace))).toBe(true)
  })

  test('B5: SubAgent 유발 → subagent 카드 노출(soft)', async () => {
    test.setTimeout(220_000)
    await send(
      'Task 도구로 general-purpose 서브에이전트를 띄워서 README.md의 첫 줄이 무엇인지 보고하게 해줘.'
    )
    await settleTurn(180_000)
    await page.screenshot({ path: join(SHOT_DIR, 'live-tp-02-subagent.png') })
    const subCount = await page.locator('.subagents, .sa-name').count()
    console.log('[live-tp] subagent 노드 수:', subCount)
  })
})
