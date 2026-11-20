// M11 G4 실앱 확인 (opt-in: M11G4LIVE=1, 출력 폴더 M11G4_OUT). 창은 2번 모니터에 둔다(디스플레이가 하나면 그대로 — 놓인 자리를 report에 남긴다).
// 연습 앱 데이터(%USERPROFILE%\.agentdeck-practice\udd)로 띄운다. M11G4_TOKEN_FILE을 주면 앱 프로세스에만 GH_TOKEN으로 넣는다(값은 출력하지 않는다).
// 메인 대화 턴과 알림은 임시 git 저장소에서 낸다 — 연습 저장소의 메인 대화 기록에 시험 턴을 남기지 않는다.
// 임시 저장소의 실행 상태는 스키마 밖이라 루프가 사람을 부르는 상태(진행 불가 또는 위조 래치)가 되고, 그 Windows 알림 객체에 누름 사건을 낸다.
// 연습 앱 데이터의 ui-prefs.json·loop/alerts.json·loop/open.json은 시작 때 읽어 두고 끝에 되돌린다.
//   A) 메인 대화가 추론 중 표시·흘러나오는 글·도구 호출을 채팅과 같은 ThreadView로 보인다(M10-22), 대리 입력 표지(M06-29)
//   B) 「파일·변경」 탐색기가 작업 폴더를 보인다(M10-13·M10-16)
//   C) 알림 누름 → 창을 앞으로, 그 폴더의 작업 모드(M10-17)
//   D) 재기동 직후 알림 표시와 루프 다시 열림(M10-19·M09-10), 기동 직후 클릭(M09-10)
//   E) 둘째 실행이 첫 창을 앞으로 가져온다(M10-18)
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { dismissStartupModal } from './helpers/bootGates'
import { moveToSecondDisplay } from './helpers/isolatedBoot'

const RUN = process.env.M11G4LIVE === '1'
const OUT = process.env.M11G4_OUT ?? join(tmpdir(), 'agentdeck-m11-g4-out')
const TOKEN_FILE = process.env.M11G4_TOKEN_FILE ?? ''
const UDD = join(homedir(), '.agentdeck-practice', 'udd')
const PRACTICE_CWD = 'C:/Dev/AgentDeck_Test'
const KEPT = ['ui-prefs.json', join('loop', 'alerts.json'), join('loop', 'open.json')]

let app: ElectronApplication
let page: Page
let probe: string
const kept = new Map<string, string | null>()
const report: Record<string, unknown> = {}

function appEnv(): Record<string, string> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    AGENTDECK_E2E_PICK_FOLDER: probe,
    ANTHROPIC_MODEL: 'haiku',
  }
  if (TOKEN_FILE) {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim()
    if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error('M11G4_TOKEN_FILE에 fine-grained 토큰 한 줄이 아니다')
    delete env.GITHUB_TOKEN
    env.GH_TOKEN = token
  }
  delete env.AGENTDECK_E2E
  delete env.ELECTRON_RUN_AS_NODE
  return env as Record<string, string>
}

// 기동 직후 첫 클릭까지 잰다(M09-10) — 제목 줄이 뜨자마자 모드 탭을 누르고 화면이 바뀌는지 본다
async function launch(tag: string): Promise<void> {
  const t0 = Date.now()
  app = await electron.launch({ args: [`--user-data-dir=${UDD}`, join(process.cwd(), 'out', 'main', 'index.js')], env: appEnv() })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await moveToSecondDisplay(app)
  const placeWindow = (): Promise<unknown> => app.evaluate(({ BrowserWindow, screen }) => {
    const primary = screen.getPrimaryDisplay()
    const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
    const win = BrowserWindow.getAllWindows()[0]
    if (other && win) win.setBounds({ x: other.workArea.x + 40, y: other.workArea.y + 40, width: 1500, height: 950 })
    return { displays: screen.getAllDisplays().length, primary: primary.bounds, other: other?.bounds ?? null, window: win?.getBounds() ?? null }
  })
  await placeWindow()
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  const titlebarMs = Date.now() - t0
  // 되살린 표시인지 다시 연 루프가 새로 낸 표시인지 가르려고, 제목 줄 직후의 알림 목록과 같은 때의 그 폴더 상태를 함께 남긴다(M10-19)
  // 목록을 먼저 읽고 상태를 뒤에 읽는다 — 상태가 아직 열리기 전이면 그 앞에 읽은 표시는 되살린 것이다
  const alertsAtBoot = await page.evaluate(async () => (await (window as unknown as { api: { loop: { alerts(): Promise<{ alerts: unknown[] }> } } }).api.loop.alerts()).alerts).catch((e: unknown) => String(e))
  const probeAtBoot = await page.evaluate(async (cwd) => ((await (window as unknown as { api: { loop: { status(r: { cwd: string }): Promise<{ phase: string }> } } }).api.loop.status({ cwd })).phase), probe).catch((e: unknown) => String(e))
  // 창이 보이기 전(show 전)에는 화면이 그려지지 않아(requestAnimationFrame 0회) 클릭의 안정 판정이 끝나지 않는다(M09-10).
  // 구동기는 창이 보일 때까지 기다리고, 10초 안에 안 보이면 캡처 한 장으로 한 장면을 그리게 한 뒤 다시 본다
  const shown = (): Promise<boolean> => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false).catch(() => false)
  const waitShown = async (ms: number): Promise<number | null> => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await shown()) return Date.now() - t0
      await page.waitForTimeout(250)
    }
    return null
  }
  let shownMs = await waitShown(10_000)
  let forcedFrame = false
  if (shownMs === null) {
    forcedFrame = true
    await page.screenshot({ path: join(OUT, `${tag}-before-show.png`) })
    shownMs = await waitShown(10_000)
  }
  // 보이기 전의 setBounds가 보일 때 덮이면 다시 옮긴다 — 실제 놓인 자리를 남긴다
  report[`boot-${tag}-show`] = { shownMs, forcedFrame, display: await placeWindow() }
  // 첫 시도의 실패 사유를 남기고, 붙을 때까지 짧게 다시 누른다(구동기의 기다림 — M09-10)
  const tries: string[] = []
  let firstClick = 'ok'
  for (;;) {
    try {
      await page.getByRole('tablist', { name: '작업 모드' }).getByRole('tab', { name: '채팅' }).click({ timeout: 1_500 })
      await page.locator('.pane.chat').waitFor({ state: 'visible', timeout: 1_500 })
      await page.getByRole('tablist', { name: '작업 모드' }).getByRole('tab', { name: '작업' }).click({ timeout: 1_500 })
      await page.locator('.pane.work').waitFor({ state: 'visible', timeout: 1_500 })
      break
    } catch (e) {
      if (tries.length === 0) {
        report[`boot-${tag}-tab`] = await page.evaluate(() => {
          const b = document.querySelector('.sb-mode-btn') as HTMLElement | null
          if (!b) return null
          const r = b.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return { rect: [r.x, r.y, r.width, r.height], visible: b.checkVisibility(), style: getComputedStyle(b).visibility, hit: hit ? `${hit.tagName}.${(hit as HTMLElement).className}` : null, hidden: document.hidden, vis: document.visibilityState }
        }).catch((x: unknown) => String(x))
        report[`boot-${tag}-raf`] = await page.evaluate(() => new Promise<number>((done) => {
          let n = 0
          const tick = (): void => { n++; requestAnimationFrame(tick) }
          requestAnimationFrame(tick)
          setTimeout(() => done(n), 1000)
        })).catch((x: unknown) => String(x))
        report[`boot-${tag}-proj`] = await page.locator('.sb-proj-head').first().click({ trial: true, timeout: 1_500 }).then(() => 'ok', (x: unknown) => String(x).replace(/\s+/g, ' ').slice(0, 300))
        report[`boot-${tag}-win`] = await app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0]
          return w ? { visible: w.isVisible(), focused: w.isFocused(), minimized: w.isMinimized(), bounds: w.getBounds(), throttling: w.webContents.getBackgroundThrottling() } : null
        }).catch((x: unknown) => String(x))
      }
      tries.push(String(e).replace(/\s+/g, ' ').slice(0, 700))
      if (Date.now() - t0 > 40_000) { firstClick = '실패 — 40초 안에 붙지 않았다'; break }
    }
  }
  report[`boot-${tag}`] = { titlebarMs, firstClickMs: Date.now() - t0, firstClick, failedTries: tries.length, firstFailure: tries[0] ?? null, alertsAtBoot, probeAtBoot }
  await page.screenshot({ path: join(OUT, `${tag}-after-boot.png`) })
  await dismissStartupModal(page, 3000)
}

type Api = { loop: Record<string, (req?: unknown) => Promise<unknown>> }
const call = (name: string, req?: unknown): Promise<unknown> =>
  page.evaluate(async ([n, r]) => (window as unknown as { api: Api }).api.loop[n as string]!(r), [name, req] as const)
const phaseOf = async (cwd: string): Promise<string> => ((await call('status', { cwd })) as { phase: string }).phase

async function choose(name: string): Promise<void> {
  await page.locator('.sb-proj-head', { has: page.locator('.sb-proj-name', { hasText: name }) }).first().click({ timeout: 10_000 })
  await page.waitForTimeout(500)
}

async function openChosen(): Promise<void> {
  const box = page.getByRole('region', { name: '마일스톤', exact: true })
  const openBtn = box.getByRole('button', { name: '열기', exact: true })
  if (await openBtn.isEnabled().catch(() => false)) await openBtn.click({ timeout: 10_000 })
}

async function rightTab(label: string): Promise<void> {
  await page.getByRole('tablist', { name: '오른쪽 탭' }).getByRole('tab', { name: label, exact: true }).click({ timeout: 10_000 })
}

async function untilPhase(cwd: string, ok: (p: string) => boolean, ms: number): Promise<string> {
  const end = Date.now() + ms
  let p = ''
  while (Date.now() < end) {
    p = await phaseOf(cwd).catch(() => '')
    if (ok(p)) return p
    await page.waitForTimeout(500)
  }
  return p
}

test.describe.serial('M11 G4 작업 모드 실앱 (opt-in: M11G4LIVE=1)', () => {
  test.skip(!RUN, 'M11 G4 실앱 — M11G4LIVE=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    for (const f of KEPT) kept.set(f, existsSync(join(UDD, f)) ? readFileSync(join(UDD, f), 'utf8') : null)
    probe = mkdtempSync(join(tmpdir(), 'agentdeck-m11g4-probe-'))
    writeFileSync(join(probe, 'README.md'), 'm11 g4 probe — the answer word is pelican\n')
    mkdirSync(join(probe, '.agentdeck'))
    writeFileSync(join(probe, '.agentdeck', 'run-state.json'), '{}\n')
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: probe })
    // 실행기는 origin 주소로 gh 저장소를 정한다 — 없는 저장소 주소를 준다(연습 저장소를 건드리지 않는다)
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example-invalid/m11g4-probe.git'], { cwd: probe })
    execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], { cwd: probe })
    execFileSync('git', ['add', '.'], { cwd: probe })
    execFileSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', 'commit', '-q', '-m', 'init'], { cwd: probe })
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: probe })
    await launch('first')
    // 알림 객체를 잡아 둔다 — Windows 알림 화면 자체는 누를 수 없어 그 객체에 누름 사건을 낸다
    await app.evaluate(({ Notification }) => {
      const g = globalThis as unknown as { __m11g4Notes: unknown[] }
      g.__m11g4Notes = []
      const show = Notification.prototype.show
      Notification.prototype.show = function (this: InstanceType<typeof Notification>) { g.__m11g4Notes.push(this); return show.call(this) }
    })
  })

  test.afterAll(async () => {
    try {
      if (page && !page.isClosed()) {
        await call('close', { cwd: probe }).catch(() => {})
        await page.getByRole('tablist', { name: '작업 모드' }).getByRole('tab', { name: '작업' }).click({ timeout: 5_000 }).catch(() => {})
        await choose('AgentDeck_Test').catch(() => {})
      }
      await app?.close()
    } finally {
      for (const [f, text] of kept) {
        if (text === null) rmSync(join(UDD, f), { force: true })
        else writeFileSync(join(UDD, f), text)
      }
      writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
      if (probe) rmSync(probe, { recursive: true, force: true })
    }
  })

  test('B) 「파일·변경」 탐색기가 작업 폴더를 보인다', async () => {
    test.setTimeout(120_000)
    await choose('AgentDeck_Test')
    await openChosen()
    const phase = await untilPhase(PRACTICE_CWD, (p) => p !== '' && p !== 'closed' && p !== 'opening', 60_000)
    await rightTab('파일·변경')
    const explorer = page.locator('.files-panel .files-explorer')
    await expect(explorer).toContainText('src', { timeout: 20_000 })
    report.explorer = { phase, text: (await explorer.innerText()).slice(0, 400) }
    await page.locator('.files-panel').screenshot({ path: join(OUT, 'b-files-explorer.png') })
    await page.screenshot({ path: join(OUT, 'b-work-mode.png') })
    expect(await explorer.innerText()).toContain('test')
  })

  test('A) 메인 대화가 추론 중·흘러나오는 글·도구 호출을 ThreadView로 보인다', async () => {
    test.setTimeout(300_000)
    await rightTab('현황판')
    await page.locator('.loop-btn', { hasText: '폴더 고르기' }).click({ timeout: 10_000 })
    await page.waitForTimeout(800)
    await openChosen()
    const phase = await untilPhase(probe, (p) => ['blocked', 'latched', 'halted', 'open-failed', 'not-started'].includes(p), 60_000)
    report.probePhase = phase
    report.probeStatus = await call('status', { cwd: probe })
    if (phase === 'open-failed') throw new Error(`임시 저장소 루프를 열지 못했다 — ${JSON.stringify(report.probeStatus).slice(0, 600)}`)
    await page.getByRole('tablist', { name: '가운데 탭' }).getByRole('tab', { name: '메인 대화', exact: true }).click({ timeout: 10_000 })
    const chat = page.locator('.main-chat')
    await chat.waitFor({ state: 'visible', timeout: 10_000 })
    const sent = await call('mainSend', { cwd: probe, text: 'Use the Read tool exactly once to read README.md in the work folder, then reply with one short sentence that includes the answer word written there.', proxy: true })
    report.mainSend = { ok: (sent as { ok: boolean }).ok, reason: (sent as { reason?: string }).reason ?? null }
    const seen = { thinking: false, stream: false, tool: false }
    const end = Date.now() + 240_000
    while (Date.now() < end) {
      if (!seen.thinking && await chat.locator('[data-testid="thinking-progress"]').first().isVisible().catch(() => false)) {
        seen.thinking = true
        await chat.screenshot({ path: join(OUT, 'a-main-thinking.png') })
      }
      if (!seen.tool && await chat.locator('.mc-turn .toollog').first().isVisible().catch(() => false)) {
        seen.tool = true
        await chat.screenshot({ path: join(OUT, 'a-main-tool.png') })
      }
      const turnText = await chat.locator('.mc-turn').last().innerText().catch(() => '')
      if (!seen.stream && /pelican/i.test(turnText)) {
        seen.stream = true
        await chat.screenshot({ path: join(OUT, 'a-main-stream.png') })
      }
      if (seen.stream && !(await chat.locator('[data-testid="thinking-progress"]').first().isVisible().catch(() => false))) break
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(1500)
    await chat.screenshot({ path: join(OUT, 'a-main-done.png') })
    report.mainChat = {
      seen,
      proxyTag: await chat.locator('.mc-proxy').count(),
      turns: await chat.locator('.mc-turn').count(),
      threadClasses: await chat.locator('.mc-turn').last().getAttribute('class'),
      text: (await chat.innerText()).slice(-1200),
    }
    // 실제로 쓴 모델은 그 세션의 대화 기록(assistant 줄의 message.model)에서 읽는다
    const transcripts = join(homedir(), '.claude', 'projects', probe.replace(/[^A-Za-z0-9]/g, '-'))
    const models: Record<string, number> = {}
    if (existsSync(transcripts)) {
      for (const f of readdirSync(transcripts).filter((n) => n.endsWith('.jsonl'))) {
        for (const line of readFileSync(join(transcripts, f), 'utf8').split('\n')) {
          try {
            const j = JSON.parse(line) as { type?: string; message?: { model?: string } }
            if (j.type === 'assistant' && j.message?.model) models[j.message.model] = (models[j.message.model] ?? 0) + 1
          } catch { /* 빈 줄 */ }
        }
      }
    }
    report.mainModels = models
    expect((sent as { ok: boolean }).ok).toBe(true)
    expect(seen.tool).toBe(true)
    expect(seen.stream).toBe(true)
    expect(await chat.locator('.mc-proxy').count()).toBeGreaterThan(0)
  })

  test('C) 알림을 누르면 창이 앞으로 오고 그 폴더의 작업 모드가 열린다', async () => {
    test.setTimeout(90_000)
    const alerts = (await call('alerts')) as { alerts: { cwd: string; phase: string; level: string; text: string }[] }
    const noteCount = await app.evaluate(() => (globalThis as unknown as { __m11g4Notes: unknown[] }).__m11g4Notes.length)
    report.alertsBeforeClick = { alerts: alerts.alerts, noteCount }
    await page.getByRole('tablist', { name: '작업 모드' }).getByRole('tab', { name: '채팅' }).click({ timeout: 5_000 })
    await page.locator('.pane.chat').waitFor({ state: 'visible', timeout: 5_000 })
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.minimize() })
    await page.waitForTimeout(800)
    const before = await app.evaluate(({ BrowserWindow }) => ({ minimized: BrowserWindow.getAllWindows()[0]?.isMinimized() ?? null }))
    const clicked = await app.evaluate(() => {
      const notes = (globalThis as unknown as { __m11g4Notes: { emit(ev: string): boolean }[] }).__m11g4Notes
      const n = notes.at(-1)
      if (!n) return false
      n.emit('click')
      return true
    })
    await page.waitForTimeout(1500)
    const after = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      return { minimized: w?.isMinimized() ?? null, visible: w?.isVisible() ?? null, focused: w?.isFocused() ?? null }
    })
    const workVisible = await page.locator('.pane.work').isVisible().catch(() => false)
    await rightTab('현황판').catch(() => {})
    const board = await page.getByRole('region', { name: '마일스톤', exact: true }).innerText().catch(() => '')
    const probeName = probe.split(/[\\/]/).at(-1) ?? ''
    report.alertClick = { before, clicked, after, workVisible, boardShowsProbe: board.includes(probeName), board: board.slice(0, 300) }
    await page.screenshot({ path: join(OUT, 'c-after-alert-click.png') })
    expect(noteCount).toBeGreaterThan(0)
    expect(clicked).toBe(true)
    expect(after.minimized).toBe(false)
    expect(workVisible).toBe(true)
    expect(board).toContain(probeName)
  })

  test('D) 재기동 직후 알림 표시가 돌아오고 열려 있던 루프가 다시 열린다', async () => {
    test.setTimeout(180_000)
    const openStore = (): unknown => { try { return JSON.parse(readFileSync(join(UDD, 'loop', 'open.json'), 'utf8')) } catch { return null } }
    const alertStore = (): unknown => { try { return JSON.parse(readFileSync(join(UDD, 'loop', 'alerts.json'), 'utf8')) } catch { return null } }
    await app.close()
    report.storesAtClose = { open: openStore(), alerts: alertStore() }
    await launch('restart')
    const dot = await page.locator('.sb-proj-alert').count()
    const practice = await untilPhase(PRACTICE_CWD, (p) => p !== '' && p !== 'closed' && p !== 'opening', 90_000)
    const probed = await untilPhase(probe, (p) => p !== '' && p !== 'closed' && p !== 'opening', 90_000)
    const alerts = (await call('alerts')) as { alerts: unknown[] }
    report.restart = { sidebarAlertDots: dot, practicePhase: practice, probePhase: probed, alertsAfterReopen: alerts.alerts }
    await page.screenshot({ path: join(OUT, 'd-after-restart.png') })
    const boot = report['boot-restart'] as { firstClick: string; alertsAtBoot: unknown }
    expect(boot.firstClick).toBe('ok')
    expect(Array.isArray(boot.alertsAtBoot) && boot.alertsAtBoot.length > 0).toBe(true)
    expect(practice).not.toBe('closed')
    expect(probed).not.toBe('closed')
  })

  test('E) 둘째 실행은 바로 끝나고 첫 창을 앞으로 가져온다', async () => {
    test.setTimeout(90_000)
    const exe = await app.evaluate(() => process.execPath)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.minimize() })
    await page.waitForTimeout(800)
    const t0 = Date.now()
    const second = spawn(exe, [`--user-data-dir=${UDD}`, join(process.cwd(), 'out', 'main', 'index.js')], { env: appEnv(), stdio: 'ignore' })
    const code = await new Promise<number | string>((done) => {
      const timer = setTimeout(() => { second.kill(); done('timeout') }, 30_000)
      second.once('exit', (c) => { clearTimeout(timer); done(c ?? -1) })
    })
    const exitMs = Date.now() - t0
    await page.waitForTimeout(1000)
    const after = await app.evaluate(({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows()
      return { windows: all.length, minimized: all[0]?.isMinimized() ?? null, visible: all[0]?.isVisible() ?? null, focused: all[0]?.isFocused() ?? null }
    })
    report.secondInstance = { code, exitMs, after }
    await page.screenshot({ path: join(OUT, 'e-after-second-launch.png') })
    expect(code).toBe(0)
    expect(after.windows).toBe(1)
    expect(after.minimized).toBe(false)
  })
})
