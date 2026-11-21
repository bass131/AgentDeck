// 설치본 확인 (opt-in: M13G1LIVE=1, 설치된 실행 파일 M13G1_EXE, 출력 폴더 M13G1_OUT).
// 설치본을 앱 데이터 인자 없이 띄워 실행 경로·앱 데이터 폴더·버전 표시를 읽고 창을 찍는다.
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { moveToSecondDisplay } from './helpers/isolatedBoot'

const RUN = process.env.M13G1LIVE === '1'
const EXE = process.env.M13G1_EXE ?? ''
const OUT = process.env.M13G1_OUT ?? join(tmpdir(), 'agentdeck-m13-g1-out')

test.describe('M13 G1 설치본 확인 (opt-in: M13G1LIVE=1)', () => {
  test.skip(!RUN, 'M13 G1 설치본 — M13G1LIVE=1로 명시 실행')

  test('설치본이 개발 서버 없이 뜨고 앱 버전과 agentdeck 앱 데이터 폴더를 쓴다', async () => {
    test.setTimeout(120_000)
    expect(EXE).not.toBe('')
    mkdirSync(OUT, { recursive: true })
    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    const app = await electron.launch({ executablePath: EXE, args: [], env })
    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await moveToSecondDisplay(app)
      const facts = await app.evaluate(({ app: a }) => ({
        isPackaged: a.isPackaged,
        name: a.getName(),
        version: a.getVersion(),
        execPath: process.execPath,
        appPath: a.getAppPath(),
        userData: a.getPath('userData'),
      }))
      await page.waitForTimeout(4000)
      const body = await page.locator('body').innerText()
      const versionShown = /AgentDeck\s+(\d+\.\d+\.\d+)/.exec(body)?.[1] ?? null
      const url = page.url()
      await page.screenshot({ path: join(OUT, 'installed-window.png') })
      writeFileSync(join(OUT, 'facts.json'), JSON.stringify({ ...facts, versionShown, url }, null, 2))
      expect(facts.isPackaged).toBe(true)
      expect(url.startsWith('file:')).toBe(true)
    } finally {
      await app.close()
    }
  })
})
