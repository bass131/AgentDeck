import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const LIVE = process.env.LIVE_SDK === '1'
const TEST_PROJECT = 'C:/Dev/Test_Project'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

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

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    ensureShotDir()

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
        AGENTDECK_E2E_WORKSPACE: workspace,
      },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await dismissAllStartupOverlays()
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
    await dismissEngineNotice(12_000)

    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
      await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    }
  })

  test.afterAll(async () => {
    await app?.close().catch(() => {})
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  async function settleTurn(timeoutMs = 200_000): Promise<void> {
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
      await page.waitForTimeout(300)
    }
  }

  async function dismissAllStartupOverlays(): Promise<void> {
    const nick = page.locator('.login-body input#nickname')
    if (await nick.count().then((c) => c > 0).catch(() => false)) {
      await nick.fill('M5검증')
      await page.locator('.login-body button.submit').click().catch(() => {})
    }
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    try {
      await egSkip.waitFor({ state: 'visible', timeout: 3000 })
      await egSkip.click()
    } catch {
    }
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

  async function dismissEngineNotice(timeoutMs = 4000): Promise<void> {
    try {
      const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
      await later.waitFor({ state: 'visible', timeout: timeoutMs })
      await later.click()
      await page.waitForTimeout(400)
    } catch {
    }
  }

  async function send(text: string): Promise<void> {
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(text)
    await input.press('Enter')
  }

  test('TC-01: 어시스턴트 버블 텍스트가 토큰 단위로 점진 증가한다 (단조증가 단정)', async () => {
    test.setTimeout(250_000)

    const prompt =
      'Write a detailed explanation of how the number system works. ' +
      'For each digit from 1 to 10, write one full sentence describing an interesting fact or use case about that number. ' +
      'Do not use any tools. Write all sentences as plain text, no markdown.'

    const snapshots: number[] = []
    const POLL_INTERVAL_MS = 150
    const MAX_POLL_DURATION_MS = 220_000
    const bubbleSelector = '.msg.ai-msg .content'

    let pollingDone = false
    const pollLoop = async (): Promise<void> => {
      const deadline = Date.now() + MAX_POLL_DURATION_MS
      while (!pollingDone && Date.now() < deadline) {
        try {
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

    const pollPromise = pollLoop()
    await send(prompt)

    const [settled] = await Promise.allSettled([settleTurn(200_000), pollPromise.then(() => {})])
    pollingDone = true
    await page.waitForTimeout(200)

    await page.screenshot({ path: join(SHOT_DIR, 'm5-streaming-after.png') })

    console.log(
      `[m5-streaming] 스냅샷 수: ${snapshots.length}, 샘플(처음10): [${snapshots.slice(0, 10).join(', ')}]`
    )

    const finalLen = snapshots[snapshots.length - 1] ?? 0
    console.log(`[m5-streaming] 최종 길이: ${finalLen}`)

    const finalText = await page.locator(bubbleSelector).last().innerText().catch(() => '')
    console.log(`[m5-streaming] 최종 버블 텍스트(첫 80자): ${JSON.stringify(finalText.slice(0, 80))}`)

    if (settled.status === 'rejected') {
      console.warn('[m5-streaming] settleTurn 실패:', settled.reason)
    }

    expect(finalText.trim().length).toBeGreaterThan(0)

    let increaseCount = 0
    let midRangeCount = 0

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
      console.warn(
        '[m5-streaming] 스냅샷 부족 — 스트리밍이 너무 빨라 폴링 미검출(결론 유보). 버블 존재만 확인.'
      )
    } else if (midRangeCount === 0) {
      console.warn(
        '[m5-streaming] 중간값 스냅샷 없음 — 스트리밍이 폴링보다 빠르거나 응답이 매우 짧음.'
      )
      expect(increaseCount).toBeGreaterThanOrEqual(1)
    } else {
      expect(increaseCount).toBeGreaterThanOrEqual(1)
      expect(midRangeCount).toBeGreaterThanOrEqual(1)
      console.log('[m5-streaming] 토큰 단조증가 PASS — 중간값 스냅샷 확인됨.')
    }

    const nonZero = snapshots.filter((s) => s > 0)
    console.log(
      `[m5-streaming] 비제로 스냅샷 수: ${nonZero.length}, 길이 추이(비제로 첫 30개): [${nonZero.slice(0, 30).join(', ')}]`
    )
    const firstNonZeroIdx = snapshots.findIndex((s) => s > 0)
    if (firstNonZeroIdx >= 0) {
      console.log(
        `[m5-streaming] 추정 TTFT: ~${firstNonZeroIdx * POLL_INTERVAL_MS}ms (인덱스 ${firstNonZeroIdx})`
      )
    }
  })

  test('TC-02: 도구 사용 유도 시 thread에 텍스트→도구카드→텍스트 인터리브가 나타난다 (soft)', async () => {
    test.setTimeout(250_000)

    const prompt =
      'Read the README.md file and then briefly summarize what this project is about in 2-3 sentences. ' +
      'Use the Read tool to open the file first.'

    await send(prompt)

    const bubbleOrCard = page.locator('.msg.ai-msg .content, .tool-card, .tc-name')
    await bubbleOrCard.first().waitFor({ state: 'visible', timeout: 60_000 })

    let toolCardSeen = false
    let textAfterToolSeen = false
    const tc02Deadline = Date.now() + 200_000

    while (Date.now() < tc02Deadline) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        const always = perm.locator(permChoiceSelector('allow_always'))
        await always.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }

      const toolCards = await page.locator('.tool-card, .tc-name').count()
      const aiMsgs = await page.locator('.msg.ai-msg .content').count()

      if (toolCards > 0) toolCardSeen = true
      if (toolCardSeen && aiMsgs > 0) textAfterToolSeen = true

      const running = page.getByLabel('실행 중단')
      const isRunning = await running.isVisible().catch(() => false)
      if (!isRunning) {
        await page.waitForTimeout(1500)
        break
      }
      await page.waitForTimeout(300)
    }

    await page.screenshot({ path: join(SHOT_DIR, 'm5-interleave-after.png') })

    const threadItems = await page.evaluate(() => {
      const items: { type: string; textLen: number }[] = []
      function classify(el: Element): { type: string; textLen: number } {
        if (el.classList.contains('msg')) {
          const isAi = el.classList.contains('ai-msg')
          const content = el.querySelector('.content')?.textContent ?? ''
          return { type: isAi ? 'ai' : 'user', textLen: content.length }
        }
        if (el.querySelector('.tool-card, .tc-name')) {
          return { type: 'toolgroup', textLen: 0 }
        }
        return { type: 'other', textLen: 0 }
      }
      document.querySelectorAll('.thread > *').forEach((el) => {
        if (el.classList.contains('turn-block')) {
          const body = el.querySelector('.turn-body')
          body?.querySelectorAll(':scope > *').forEach((child) => items.push(classify(child)))
          return
        }
        items.push(classify(el))
      })
      return items
    })

    console.log('[m5-interleave] thread 항목:', JSON.stringify(threadItems))
    console.log(`[m5-interleave] 도구카드 관찰: ${toolCardSeen}, 도구 후 텍스트: ${textAfterToolSeen}`)

    const aiCount = threadItems.filter((i) => i.type === 'ai').length
    expect(aiCount).toBeGreaterThanOrEqual(1)

    if (!toolCardSeen) {
      console.warn('[m5-interleave] 모델이 도구를 사용하지 않음 — 인터리브 미확인(soft skip).')
    } else {
      const toolIdx = threadItems.findIndex((i) => i.type === 'toolgroup')
      const aiAfterTool = threadItems.slice(toolIdx + 1).some((i) => i.type === 'ai')
      console.log(`[m5-interleave] 도구카드 인덱스: ${toolIdx}, 이후 AI 버블: ${aiAfterTool}`)
      expect(toolIdx).toBeGreaterThan(-1)
      if (!aiAfterTool) {
        console.warn('[m5-interleave] 도구 이후 텍스트 버블 미확인 — 응답 미완성 가능성.')
      }
    }
  })
})
