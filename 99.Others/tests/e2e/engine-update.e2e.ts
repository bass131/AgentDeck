/**
 * engine-update.e2e.ts — 엔진 버전 업데이트 체크+팝업 실 런타임 검증 (#2-a).
 *
 * 실 Electron을 띄워 부트 흐름을 그대로 구동하고:
 *   1) window.api.checkEngineUpdate()가 **실 npm registry**를 조회해 generic
 *      EngineUpdateInfo{current,latest,updateAvailable}를 반환하는지(전 IPC 체인:
 *      preload→handler→registry backend→ClaudeCodeBackend.latestVersion 실 fetch),
 *   2) updateAvailable일 때 "새 엔진 버전" set-dialog 팝업이 실 버전으로 뜨고
 *      "확인"으로 닫히는지(닫을 때 seen-key 도장)
 * 를 검증한다.
 *
 * 실행: node scripts/run-e2e.cjs tests/e2e/engine-update.e2e.ts
 * 스샷: artifacts/screenshots/engine-update-*.png (gitignore)
 *
 * 결정론 주의: latest는 실 네트워크 값이라 고정 버전을 하드코딩하지 않는다.
 *   구조(semver 형태)·일관성(updateAvailable == current<latest)만 단정.
 *   오프라인이면 latest=null → 팝업 미표시 → graceful 경로로 단정(크래시 0).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page

const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

function cmpVer(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-engupd-'))
  writeFileSync(join(workspace, 'README.md'), '# 엔진 업데이트 e2e\n')
  const userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-engupd-udata-'))

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E_WORKSPACE: workspace,
      // 설치 흐름 결정성(auditor 🔴): 실 npm spawn 대신 가짜 progress→done 스텁.
      AGENTDECK_E2E_ENGINE_INSTALL: '1',
      // 이 테스트는 *팝업 자체*를 검증하므로 config의 전역 억제를 ''로 되살린다(게이트 truthy 검사 → falsy).
      AGENTDECK_E2E_NO_ENGINE_UPDATE: ''
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 진입 대문 통과: 온보딩 → engine-gate(미인증 skip) → Shell
  await page.waitForSelector('.login-body, .titlebar, .eg-auth-dialog, .boot-splash', { timeout: 15_000 })
  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill('엔진QA')
    await page.locator('.login-body button.submit').click()
  }
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: 3000 })
    await egSkip.click()
  } catch {
    /* authed → 미표시 */
  }
  await page.waitForSelector('.titlebar', { timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
})

test('checkEngineUpdate IPC가 실 npm registry로 generic EngineUpdateInfo를 반환한다', async () => {
  // 전 체인 실측: preload → ipcMain.handle → registry backend → 실 fetch
  const info = await page.evaluate(() => window.api.checkEngineUpdate())
  console.log('[engine-update] checkEngineUpdate():', JSON.stringify(info))

  // 시크릿 0 — 정확히 3개 필드만
  expect(Object.keys(info).sort()).toEqual(['current', 'latest', 'updateAvailable'])

  // current = 실 번들 SDK 버전(semver) — 폴백이 아닌 실 읽기여야 한다
  expect(info.current).toMatch(/^\d+\.\d+\.\d+/)

  if (info.latest === null) {
    // 오프라인 graceful — 업데이트 불가 단정
    expect(info.updateAvailable).toBe(false)
    console.log('[engine-update] latest=null (오프라인) — graceful 경로')
    return
  }

  // 온라인: latest도 semver, updateAvailable은 current<latest와 일치해야 한다
  expect(info.latest).toMatch(/^\d+\.\d+\.\d+/)
  expect(info.updateAvailable).toBe(cmpVer(info.current as string, info.latest) < 0)
})

test('"새 엔진 버전" 프롬프트 → "업데이트" 클릭 → 설치 로그 스트리밍 → 완료', async () => {
  const info = await page.evaluate(() => window.api.checkEngineUpdate())

  // WhatsNew 자동표시가 위에 떠 있으면 먼저 닫는다(부트 동시 트리거).
  const wn = page.locator('.wn-overlay')
  try {
    await wn.waitFor({ state: 'visible', timeout: 2000 })
    await page.locator('.wn-overlay .wn-nav-cta').click()
    await expect(wn).toHaveCount(0)
  } catch {
    /* 미표시 */
  }

  if (!info.updateAvailable) {
    console.log('[engine-update] updateAvailable=false — 팝업 미표시 정상')
    await expect(page.locator('.set-dialog .sd-title', { hasText: '새 엔진 버전' })).toHaveCount(0)
    return
  }

  // ── prompt: "새 엔진 버전" + 실 버전 + "나중에"/"업데이트" 2버튼 ──────────────
  const dialog = page.locator('.set-dialog', { has: page.locator('.sd-title', { hasText: '새 엔진 버전' }) })
  await dialog.waitFor({ state: 'visible', timeout: 12_000 })
  const msg = await dialog.locator('.sd-msg').innerText()
  console.log('[engine-update] 프롬프트 메시지:', msg)
  expect(msg).toContain(info.current as string)
  expect(msg).toContain(info.latest as string)
  await expect(dialog.locator('.sd-cancel', { hasText: '나중에' })).toBeVisible()
  const updateBtn = dialog.locator('.sd-go', { hasText: '업데이트' })
  await expect(updateBtn).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-prompt.png'), fullPage: false })

  // ── "업데이트" 클릭 → installing: install-card + 스트리밍 로그(스텁 게이트) ──────
  await updateBtn.click()
  const card = page.locator('.install-card')
  await card.waitFor({ state: 'visible', timeout: 8000 })
  // 스텁 게이트가 가짜 npm progress 라인을 push → .ic-log에 누적
  await expect(card.locator('.ic-log .ic-ln').first()).toBeVisible({ timeout: 8000 })
  const logLines = await card.locator('.ic-log .ic-ln').count()
  console.log('[engine-update] 설치 로그 라인 수:', logLines)
  expect(logLines).toBeGreaterThan(0)
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-installing.png'), fullPage: false })

  // ── done: "설치 완료" → "확인"으로 닫힘 ───────────────────────────────────────
  await card.locator('.ic-title', { hasText: '설치 완료' }).waitFor({ state: 'visible', timeout: 8000 })
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-done.png'), fullPage: false })
  await card.locator('.sd-go', { hasText: '확인' }).click()
  await expect(page.locator('.install-card')).toHaveCount(0)
})
