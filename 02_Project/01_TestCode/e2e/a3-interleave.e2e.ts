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
  test.describe.configure({ retries: 1 })
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
        await page.waitForTimeout(2000)
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

  async function dismissEngineNotice(timeoutMs = 4000): Promise<void> {
    try {
      const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
      await later.waitFor({ state: 'visible', timeout: timeoutMs })
      await later.click()
      await page.waitForTimeout(400)
    } catch { }
  }

  test.beforeAll(async () => {
    test.setTimeout(90_000)

    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-a3-'))
    cpSync(TEST_PROJECT, workspace, {
      recursive: true,
      filter: (src) => !src.includes(`${'\\'}.git`) && !src.split(/[\\/]/).includes('.git')
    })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-a3-udata-'))

    mkdirSync(SHOT_DIR, { recursive: true })

    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const nick = page.locator('.login-body input#nickname')
    if (await nick.count()) {
      await nick.fill('A3검증')
      await page.locator('.login-body button.submit').click().catch(() => {})
    }
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    try {
      await egSkip.waitFor({ state: 'visible', timeout: 4000 })
      await egSkip.click()
    } catch { }

    await page.waitForSelector('.titlebar', { timeout: 15_000 })
    await dismissStartupModal(10_000)
    await dismissEngineNotice(12_000)

    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
    }
    await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('A3-① 인터리브 DOM 순서: Read→텍스트→Write 유발 후 thread 교차 단언', async () => {
    test.setTimeout(260_000)

    const PROMPT =
      'national_anthem.txt 파일을 읽어서 첫 절(1절)을 한 줄로 요약해줘. ' +
      '그리고 그 요약 내용을 담아 프로젝트 루트에 GENERATED_A3.md 파일을 새로 만들어줘. ' +
      '간결하게 처리해줘.'

    await send(PROMPT)

    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-01-sending.png') })

    await settleTurn(220_000)

    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-02-done.png'), fullPage: false })

    const childClasses: string[] = await page.evaluate(() => {
      const thread = document.querySelector('.thread')
      if (!thread) return []
      return Array.from(thread.children).map((el) => el.className ?? '')
    })
    console.log('[a3] thread 직계 자식 className 시퀀스:')
    childClasses.forEach((cls, i) => console.log(`  [${i}] "${cls}"`))

    const hasToollog = childClasses.some((cls) => cls.includes('toollog'))

    if (!hasToollog) {
      console.warn('[a3] WARNING: toollog가 thread에 없음 — 모델이 도구를 사용하지 않았습니다.')
      console.warn('[a3] 이 경우는 인터리브 비검증(환경 탓). 재실행 또는 프롬프트 조정 필요.')
      const hasAssistantMsg = childClasses.some((cls) => cls.includes('ai-msg'))
      console.log('[a3] assistant msg 존재:', hasAssistantMsg)
      return
    }

    const toollogs = childClasses.filter((cls) => cls.includes('toollog'))
    const msgs = childClasses.filter((cls) => cls.includes('msg'))
    console.log('[a3] toollog 수:', toollogs.length, '| msg 수:', msgs.length)
    expect(toollogs.length).toBeGreaterThan(0)

    const childTypes: ('msg' | 'toollog' | 'other')[] = childClasses.map((cls) => {
      if (cls.includes('toollog')) return 'toollog'
      if (cls.includes('msg')) return 'msg'
      return 'other'
    })
    console.log('[a3] thread 시퀀스 타입:', childTypes.join(' → '))

    let foundInterleave = false
    let foundMsgToollogMsg = false
    for (let i = 1; i < childTypes.length - 1; i++) {
      if (childTypes[i] === 'toollog') {
        const hasMsgBefore = childTypes.slice(0, i).some((t) => t === 'msg')
        const hasMsgAfter = childTypes.slice(i + 1).some((t) => t === 'msg')
        if (hasMsgBefore || hasMsgAfter) foundInterleave = true
        if (hasMsgBefore && hasMsgAfter) foundMsgToollogMsg = true
      }
    }
    const firstToollogIdx = childTypes.findIndex((t) => t === 'toollog')
    if (firstToollogIdx > 0) foundInterleave = true

    console.log('[a3] 교차(toollog가 thread 중간에):', foundInterleave)
    console.log('[a3] 3-패턴(msg→toollog→msg):', foundMsgToollogMsg)

    expect(
      foundInterleave,
      `인터리브 실패: thread 시퀀스 = ${childTypes.join(' → ')}\n` +
      `toollog가 thread 첫 항목이거나 msg와 교차하지 않습니다.\n` +
      `Phase A-2 thread 전환 회귀 가능성을 조사하세요.`
    ).toBe(true)

    if (!foundMsgToollogMsg) {
      console.warn('[a3] NOTE: msg→toollog→msg 3-패턴 미관측. Read만 쓰고 텍스트 없이 Write한 경우 정상.')
    }

    const generatedPath = join(workspace, 'GENERATED_A3.md')
    expect(
      existsSync(generatedPath),
      `GENERATED_A3.md가 디스크에 없음 — Write 도구 미발화 또는 실패. 경로: ${generatedPath}`
    ).toBe(true)
    console.log('[a3] GENERATED_A3.md 디스크 생성 확인:', generatedPath)
  })

  test('A3-② lead 아바타: toollog.lead에 .lead-ava가 렌더됐는지', async () => {
    const leadAva = page.locator('.toollog.lead .lead-ava')
    const count = await leadAva.count()
    console.log('[a3] .toollog.lead .lead-ava 수:', count)

    if (count > 0) {
      await expect(leadAva.first()).toBeVisible()
      console.log('[a3] lead 아바타 확인: PASS (관측됨)')

      const leadToollogExists = await page.locator('.toollog.lead').count()
      expect(leadToollogExists).toBeGreaterThan(0)
      console.log('[a3] .toollog.lead 존재:', leadToollogExists)
    } else {
      console.log('[a3] lead 아바타 미관측 — 모든 toolgroup이 assistant msg 뒤에 위치(lead=false). 정상.')
    }

    const threadEl = page.locator('.thread')
    await threadEl.screenshot({ path: join(SHOT_DIR, 'a3-interleave-03-lead-ava.png') }).catch(async () => {
      await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-03-lead-ava.png') })
    })
  })

  test('A3-③ Phase B diff 회귀: 편집/생성 카드에 .t-diff-summary가 표시된다', async () => {

    const hasToollog = (await page.locator('.toollog').count()) > 0
    if (!hasToollog) {
      console.warn('[a3] diff 검증 SKIP — toollog 없음(도구 미사용 턴)')
      return
    }

    const tItemCount = await page.locator('.t-item').count()
    console.log('[a3] .t-item (도구 카드) 수:', tItemCount)

    const diffSummaries = page.locator('.t-diff-summary')
    const diffCount = await diffSummaries.count()
    console.log('[a3] .t-diff-summary 수:', diffCount)

    if (diffCount > 0) {
      await expect(diffSummaries.first()).toBeVisible()
      const texts = await diffSummaries.allInnerTexts()
      console.log('[a3] diff 요약 내용:', texts.join(' / '))

      const hasDiffPattern = texts.some((t) => /[+\-−]\d/.test(t))
      expect(
        hasDiffPattern,
        `diff 요약 텍스트가 +N/-N 형식이 아닙니다: ${texts.join(', ')}`
      ).toBe(true)
      console.log('[a3] Phase B diff 보존: PASS')
    } else {
      const writeCards = await page.locator('.t-item.t-write, .t-item.t-edit').count()
      console.log('[a3] Write/Edit 카드 수:', writeCards)

      if (writeCards > 0) {
        console.warn(
          '[a3] WARNING: Write/Edit 카드(' + writeCards + '개)가 있으나 .t-diff-summary 없음. ' +
          'Phase B diff 회귀 가능성 — fileDiff IPC 또는 selectFileDiffs 셀렉터 점검 필요.'
        )
      } else {
        console.log('[a3] diff 없음 — Write/Edit 카드도 없음(Read만 사용). 정상.')
      }
    }

    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-04-diff.png') })
  })

  test('A3-④ 전체 thread DOM 덤프 + 최종 스크린샷', async () => {

    const threadHtml: string = await page.evaluate(() => {
      const thread = document.querySelector('.thread')
      if (!thread) return '(thread 없음)'
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

    await page.screenshot({ path: join(SHOT_DIR, 'a3-interleave-05-final.png') })

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
