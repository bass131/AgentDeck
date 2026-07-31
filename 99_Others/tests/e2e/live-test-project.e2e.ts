import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')
const TEST_PROJECT = 'C:/Dev/Test_Project'

test.describe('Test_Project 실 에이전트 기능 종합 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  async function settleTurn(timeoutMs = 180_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator(permChoiceSelector('allow_always'))
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(1500)
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
    cpSync(TEST_PROJECT, workspace, {
      recursive: true,
      filter: (src) => !src.includes(`${'\\'}.git`) && !src.split(/[\\/]/).includes('.git')
    })
    mkdirSync(join(workspace, '.claude', 'commands'), { recursive: true })
    writeFileSync(
      join(workspace, '.claude', 'commands', 'hello-parity.md'),
      '---\ndescription: 패리티 검증용 로컬 슬래시 커맨드\nargument-hint: "[name]"\n---\n\n안녕 $1\n'
    )
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-tp-udata-'))

    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'TP검증' })
    await openWorkspace(page)
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('탐색기에 Test_Project 파일이 보인다', async () => {
    await page.screenshot({ path: join(SHOT_DIR, 'live-tp-00-initial.png') })
    await expect(page.locator('.fe-node-name', { hasText: 'national_anthem.txt' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.fe-node-name', { hasText: 'README.md' })).toBeVisible()
    await expect(page.locator('.fe-node-name', { hasText: 'src' })).toBeVisible()
  })

  test('B6: 로컬 슬래시 커맨드(.claude/commands)가 팔레트에 뜬다', async () => {
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/')
    const menu = page.locator('.slash-menu')
    await menu.waitFor({ state: 'visible', timeout: 6000 })
    const names = await menu.locator('.slash-name').allInnerTexts()
    console.log('[live-tp] 슬래시 팔레트 항목:', names.join(' '))
    expect(names.some((n) => n.includes('hello-parity'))).toBe(true)
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

    await expect(page.locator('.msg.ai-msg .content').last()).toBeVisible()

    expect(existsSync(join(workspace, 'GENERATED.md'))).toBe(true)

    await expect(page.locator('.fe-node-name', { hasText: 'GENERATED.md' })).toBeVisible({ timeout: 8000 })
    const changedDots = await page.locator('.fe-changed-dot').count()
    console.log('[live-tp] changed-dot 개수:', changedDots)

    const todoCount = await page.locator('.todos').count()
    console.log('[live-tp] todos 패널 존재:', todoCount)
  })

  test('Phase B: 파일편집 도구 카드에 diff 요약(+N −M)이 표시된다', async () => {
    const summaries = page.locator('.t-diff-summary')
    await expect(summaries.first()).toBeVisible({ timeout: 8000 })
    const count = await summaries.count()
    const texts = await summaries.allInnerTexts()
    console.log('[live-tp] diff 요약 카드 수:', count, '|', texts.join(' / '))
    expect(count).toBeGreaterThan(0)
  })

  test('B7 Step2(ADR-019): 실 run 후 팔레트가 SDK supportedCommands로 확장된다', async () => {
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/')
    const menu = page.locator('.slash-menu')
    await menu.waitFor({ state: 'visible', timeout: 6000 })
    const names = await menu.locator('.slash-name').allInnerTexts()
    console.log('[live-tp] 캡처 후 팔레트(' + names.length + '):', names.join(' '))
    const rawIpc = await page.evaluate(() => window.api.listSlashCommands())
    console.log('[live-tp] IPC 직접(' + rawIpc.length + '):', rawIpc.map((c) => c.name).join(' '))
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
    const convs = await page.evaluate(() => window.api.conversationLoad({ limit: 5 }))
    const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
    const withCwd = convs.conversations.filter((c) => c.cwd)
    console.log('[live-tp] 저장된 대화 cwd:', withCwd.map((c) => c.cwd).join(' | ') || '(없음)')
    expect(withCwd.length).toBeGreaterThan(0)
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
