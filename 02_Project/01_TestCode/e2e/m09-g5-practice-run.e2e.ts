// M09 G5 — 연습 저장소 실주행 구동기(opt-in: M09_G5_RUN=1, G5_CTL=<제어 폴더>, G5_REPO=<연습 저장소>).
// 사용자 위임(결정 대장 [USER·위임] 2026-11-19)으로 메인이 사람 몫(브레인스토밍 답·스펙 승인·병합 버튼)을 앱 화면에서 누른다.
// 대화형이다: 화면 글자를 <ctl>/state.txt로 내보내고, 메인이 쓴 <ctl>/cmd.json(seq가 오른 것)을 읽어 동작을 돌린 뒤
// 결과를 <ctl>/res.txt와 <ctl>/shot.png에 쓴다. 'restart'는 같은 userData로 앱을 껐다 켜 재개를 실측한다. 'quit'로 끝난다.
// 창은 2번 모니터(주 모니터가 아닌 디스플레이)에 둔다 — 하나뿐이면 그대로 둔다.
// 작업 모드의 가운데는 메인 대화(.main-chat)이고 오른쪽은 현황판(.status-board)이다. 질문·승인 카드는 메인 대화 안에서 답한다
// (스펙 승인은 「스펙 승인」·「이어서 고치기」 — scope '.main-chat'). 「이어 가기」가 두 곳(멈춘 실행의 사람 판정 — scope '.status-board',
// 일시 정지 깃발 내리기 — 메인 대화)에 있으니 click에 scope를 준다. 메인에게 말하기는 'say', 이름 붙인 캡처는 'shot',
// 메인 대화에 글이 뜨기를 기다리기는 'waitMain'이다. state.txt에 [main] 절을 싣는다.
import { test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const RUN = process.env.M09_G5_RUN === '1'
const CTL = process.env.G5_CTL ?? ''
const REPO = process.env.G5_REPO ?? ''

type Action =
  | { op: 'click'; name: string; exact?: boolean; scope?: string; nth?: number }
  | { op: 'clickSel'; sel: string; nth?: number }
  | { op: 'fill'; label?: string; sel?: string; value: string }
  | { op: 'press'; key: string }
  | { op: 'qOption'; label: string }
  | { op: 'qOther'; text: string }
  | { op: 'qSubmit' }
  | { op: 'openLoop' }
  | { op: 'say'; text: string }
  | { op: 'shot'; name: string }
  | { op: 'waitMain'; text: string; ms?: number }
  | { op: 'wait'; ms: number }
  | { op: 'restart' }
  | { op: 'quit' }

const stamp = (): string => new Date().toISOString()

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    AGENTDECK_E2E_PICK_FOLDER: REPO,
  }
  delete env.AGENTDECK_E2E
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: env as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // 2번 모니터로 옮긴다
  await app.evaluate(({ BrowserWindow, screen }) => {
    const primary = screen.getPrimaryDisplay().id
    const other = screen.getAllDisplays().find((d) => d.id !== primary)
    const win = BrowserWindow.getAllWindows()[0]
    if (other && win) win.setBounds(other.workArea)
  }).catch(() => {})
  await Promise.race([
    page.waitForSelector('#nickname', { timeout: 25_000 }).catch(() => null),
    page.waitForSelector('.titlebar', { timeout: 25_000 }).catch(() => null),
  ])
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('g5')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
  }
  const gate = page.getByRole('button', { name: '계속 진행' })
  if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})
  await page.waitForSelector('.titlebar', { timeout: 20_000 }).catch(() => {})
  const whatsNew = page.locator('.wn-overlay')
  if (await whatsNew.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {})
    await whatsNew.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
  }
  return { app, page }
}

// 「열기」는 노드 세션 줄에도 있어서, 루프 열기는 「마일스톤」 칸 안에서 누른다
async function openLoop(page: Page): Promise<void> {
  if (!(await page.locator('.pane.work').isVisible().catch(() => false))) {
    await page.locator('.sb-mode-btn', { hasText: '작업' }).click({ timeout: 10_000 })
    await page.locator('.pane.work').waitFor({ state: 'visible', timeout: 10_000 })
  }
  await page.getByRole('tablist', { name: '오른쪽 탭' }).getByRole('tab', { name: '현황판', exact: true }).click({ timeout: 10_000 })
  await page.getByRole('tablist', { name: '가운데 탭' }).getByRole('tab', { name: '메인 대화', exact: true }).click({ timeout: 10_000 })
  await page.locator('.status-board').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('.main-chat').waitFor({ state: 'visible', timeout: 10_000 })
  const screen = page.getByRole('region', { name: '마일스톤', exact: true })
  await screen.getByRole('button', { name: '폴더 고르기', exact: true }).click({ timeout: 10_000 })
  await page.waitForTimeout(800)
  const openBtn = screen.getByRole('button', { name: '열기', exact: true })
  if (await openBtn.isEnabled().catch(() => false)) await openBtn.click({ timeout: 10_000 })
}

async function snapshot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = []
    // 현황판 탭이 숨겨져 있으면 innerText가 비어 있다
    const loop = document.querySelector('.status-board') as HTMLElement | null
    parts.push(loop ? `[loop]\n${loop.innerText}` : '[loop] (작업 모드 아님)')
    const main = document.querySelector('.main-chat') as HTMLElement | null
    if (main) parts.push(`[main]\n${main.innerText}`)
    const q = document.querySelector('.q-modal') as HTMLElement | null
    if (q) parts.push(`[question]\n${q.innerText}`)
    const pill = document.querySelector('.q-mini-pill') as HTMLElement | null
    if (pill) parts.push('[question-pill] 내려둔 질문 있음')
    return parts.join('\n\n')
  }).catch((e: unknown) => `[snapshot-error] ${String(e)}`)
}

async function runAction(page: Page, a: Action): Promise<void> {
  const t = { timeout: 10_000 }
  switch (a.op) {
    case 'click': {
      const found = page.locator(a.scope ?? 'body').getByRole('button', { name: a.name, exact: a.exact ?? true })
      // nth도 scope도 없으면 하나만 맞아야 한다 — 같은 이름의 버튼 둘(「이어 가기」: 루프 화면의 사람 판정 / 메인 대화의 깃발 내리기)을
      // 첫째로 골라 누르지 않는다(G3 독립 검수 사소 7). 늦게 뜨는 버튼은 엄격 모드의 click이 여럿이면 던진다
      if (a.nth === undefined && a.scope === undefined) {
        const n = await found.count()
        if (n > 1) throw new Error(`버튼 「${a.name}」이 ${n}개다 — scope나 nth를 준다`)
        await found.click(t)
        return
      }
      await found.nth(a.nth ?? 0).click(t)
      return
    }
    case 'clickSel':
      await page.locator(a.sel).nth(a.nth ?? 0).click(t)
      return
    case 'fill':
      await (a.label ? page.getByLabel(a.label, { exact: true }) : page.locator(a.sel ?? '')).first().fill(a.value, t)
      return
    case 'press':
      await page.keyboard.press(a.key)
      return
    case 'qOption':
      await page.locator('.q-modal .q-opt', { hasText: a.label }).first().click(t)
      return
    case 'qOther':
      await page.locator('.q-modal .q-opt-other').click(t)
      await page.locator('.q-modal .q-custom').fill(a.text, t)
      await page.locator('.q-modal .q-custom-go').click(t)
      return
    case 'qSubmit':
      await page.locator('.q-modal .q-submit').click(t)
      return
    case 'openLoop':
      await openLoop(page)
      return
    case 'say': {
      // 메인에게 말하기 — 메인 대화의 입력칸에 쓰고 보낸다(브레인스토밍 답·지시)
      const chat = page.locator('.main-chat')
      await chat.getByLabel('메인에게 말하기', { exact: true }).fill(a.text, t)
      await chat.getByRole('button', { name: '보내기', exact: true }).click(t)
      return
    }
    case 'shot':
      // 이름 붙인 캡처 — <ctl>/<name>.png. 이름은 글자·숫자·-·_만 받는다(제어 폴더 밖으로 쓰지 않게)
      if (!/^[\w-]{1,64}$/.test(a.name)) throw new Error(`캡처 이름이 틀렸다 — ${a.name}`)
      await page.screenshot({ path: join(CTL, `${a.name}.png`) })
      return
    case 'waitMain':
      // 메인의 글만 본다 — 사람 글·사건 줄·알림에 같은 글자가 있어도 기다림이 끝나지 않는다(G3 독립 검수 사소 7)
      await page.locator('.main-chat .mc-thread .mc-msg.assistant', { hasText: a.text }).first().waitFor({ state: 'visible', timeout: a.ms ?? 180_000 })
      return
    case 'wait':
      await page.waitForTimeout(a.ms)
      return
    default:
      // 모르는 동작은 「ok」로 적히지 않게 던진다(독립 검수 사소 6)
      throw new Error(`모르는 동작 ${JSON.stringify(a)}`)
  }
}

test.describe('M09 G5 연습 저장소 실주행 구동기 (opt-in: M09_G5_RUN=1)', () => {
  test.skip(!RUN || CTL === '' || REPO === '', '실주행 구동기 — M09_G5_RUN=1, G5_CTL, G5_REPO로 명시 실행')

  test('실주행', async () => {
    test.setTimeout(8 * 60 * 60_000)
    // 위임 범위는 연습 저장소뿐이다 — 이 저장소(또는 그 안쪽)를 작업 저장소로 주면 시작하지 않는다(독립 검수 사소 5)
    const repoAbs = resolve(REPO).toLowerCase()
    const here = resolve(process.cwd()).toLowerCase()
    if (repoAbs === here || repoAbs.startsWith(here + sep)) throw new Error(`G5_REPO가 이 저장소 안이다 — ${REPO}`)
    mkdirSync(CTL, { recursive: true })
    const userDataDir = join(CTL, 'udd')
    // 마지막으로 돌린 명령 번호 — 파일이 있는데 읽지 못하면 옛 명령을 다시 돌리지 않게 시작하지 않는다(독립 검수 사소 6)
    const seqFile = join(CTL, 'last-seq')
    let lastSeq = 0
    if (existsSync(seqFile)) {
      const raw = readFileSync(seqFile, 'utf8').trim()
      lastSeq = Number(raw)
      // 빈 파일(쓰다 죽은 경우)은 Number('')가 0이라 따로 막는다(확인 검수 사소)
      if (raw === '' || !Number.isInteger(lastSeq) || lastSeq < 0) throw new Error(`last-seq를 읽지 못했다 — ${seqFile}`)
    }
    let { app, page } = await launch(userDataDir)
    await openLoop(page).catch(() => {})
    const cmdFile = join(CTL, 'cmd.json')
    let lastState = ''
    let restarts = 0
    for (;;) {
      const snap = await snapshot(page)
      if (snap !== lastState) {
        lastState = snap
        writeFileSync(join(CTL, 'state.txt'), `${stamp()} restarts=${restarts}\n${snap}\n`)
      }
      let cmd: { seq: number; actions: Action[] } | null = null
      try {
        if (existsSync(cmdFile)) cmd = JSON.parse(readFileSync(cmdFile, 'utf8')) as { seq: number; actions: Action[] }
      } catch {
        cmd = null
      }
      if (cmd && typeof cmd.seq === 'number' && cmd.seq > lastSeq) {
        lastSeq = cmd.seq
        writeFileSync(join(CTL, 'last-seq'), String(lastSeq))
        const log: string[] = []
        let quit = false
        for (const a of cmd.actions ?? []) {
          try {
            if (a.op === 'quit') { quit = true; break }
            if (a.op === 'restart') {
              await app.close().catch(() => {})
              ;({ app, page } = await launch(userDataDir))
              restarts++
              await openLoop(page).catch((e: unknown) => log.push(`openLoop after restart: ${String(e)}`))
              log.push('ok restart')
              continue
            }
            await runAction(page, a)
            log.push(`ok ${JSON.stringify(a)}`)
          } catch (e) {
            log.push(`ERR ${JSON.stringify(a)} :: ${String(e).split('\n')[0]}`)
            break
          }
        }
        await page.waitForTimeout(700)
        await page.screenshot({ path: join(CTL, 'shot.png') }).catch(() => {})
        writeFileSync(join(CTL, 'res.txt'), `${stamp()} seq=${lastSeq}\n${log.join('\n')}\n\n${await snapshot(page)}\n`)
        if (quit) break
      }
      await page.waitForTimeout(1500)
    }
    await app.close().catch(() => {})
  })
})
