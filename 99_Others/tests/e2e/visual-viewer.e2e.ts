import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

let app: ElectronApplication
let page: Page
let workspace: string
let refWorkspace: string
let userDataDir: string

const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

async function capture(name: string): Promise<void> {
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false })
}

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
async function attachSamplePng(): Promise<void> {
  const p = join(workspace, `_qa-attach-${Date.now()}.png`)
  writeFileSync(p, Buffer.from(SAMPLE_PNG_B64, 'base64'))
  await page.locator('.composer input[type="file"]').first().setInputFiles(p)
}

const README = `# AgentDeck 마크다운 뷰어

**굵게** / *기울임* / \`인라인 코드\` 렌더링.

## 리스트
- 첫 번째 항목
- 두 번째 항목

## GFM 표
| 백엔드 | 상태 | 트랙 |
|---|---|---|
| Claude Code | 동작 | Track 1 |
| Codex | 예정 | Track 2 |

## 코드 블록 (하이라이트)
\`\`\`typescript
export function resolveSafe(root: string, p: string): string | null {
  const candidate = resolve(root, p)
  return isWithin(root, candidate) ? candidate : null
}
\`\`\`

## 신뢰경계 검증
원격 이미지는 로드되지 않고 플레이스홀더로 차단되어야 한다:

![추적픽셀](http://evil.example/track.png)
`

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">
  <rect width="360" height="200" fill="#16181d"/>
  <rect x="24" y="24" width="312" height="152" rx="14" fill="#4c8dff"/>
  <circle cx="110" cy="100" r="44" fill="#3fb950"/>
  <text x="200" y="112" font-size="34" fill="#ffffff" font-family="sans-serif">AgentDeck</text>
</svg>`

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-visual-'))
  writeFileSync(join(workspace, 'README.md'), README)
  writeFileSync(join(workspace, 'logo.svg'), LOGO_SVG)
  writeFileSync(
    join(workspace, 'sample.ts'),
    'export interface User { id: number; name: string }\n\nexport const greet = (u: User): string => `안녕, ${u.name}`\n'
  )

  const gitOpts = {
    cwd: workspace,
    windowsHide: true,
    encoding: 'utf8' as const,
    stdio: 'pipe' as const,
  }

  try {
    execFileSync('git', ['init'], gitOpts)

    execFileSync('git', ['config', 'user.email', 'test@agentdeck.local'], gitOpts)
    execFileSync('git', ['config', 'user.name', 'AgentDeck Test'], gitOpts)

    execFileSync('git', ['add', '-A'], gitOpts)
    execFileSync('git', ['commit', '-m', '초기 커밋'], gitOpts)

    writeFileSync(join(workspace, 'notes.txt'), '두 번째 커밋에 추가된 노트 파일\n')
    execFileSync('git', ['add', '-A'], gitOpts)
    execFileSync('git', ['commit', '-m', '두 번째 커밋'], gitOpts)

    writeFileSync(join(workspace, 'notes.txt'), '두 번째 커밋에 추가된 노트 파일\n수정된 내용 (working change)\n')
  } catch (e) {
    console.warn('[e2e] git 초기화 실패 — GitModal은 비-git 상태로 테스트:', e)
  }

  refWorkspace = mkdtempSync(join(tmpdir(), 'agentdeck-ref-'))
  writeFileSync(join(refWorkspace, 'guide.md'), '# 레퍼런스 가이드\n\n워크스페이스 밖 **읽기전용** 보조 문서.\n')

  userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-udata-'))

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_REFERENCE: refWorkspace,
      AGENTDECK_E2E_PICK_FOLDER: refWorkspace
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForSelector('.login-body, .titlebar, .eg-auth-dialog, .boot-splash', { timeout: 15_000 })
  await capture('00-launch')
  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill('QA테스터')
    await page.locator('.login-body button.submit').click()
  }
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: 3000 })
    await capture('00b-engine-gate')
    await egSkip.click()
  } catch {
  }

  await page.waitForSelector('.titlebar', { timeout: 15_000 })

  const wn = page.locator('.wn-overlay')
  try {
    await wn.waitFor({ state: 'visible', timeout: 3000 })
    await capture('00c-whatsnew-autoshow')
    await page.locator('.wn-overlay .wn-nav-cta').click()
    await expect(wn).toHaveCount(0)
  } catch {
  }
  const un = page.locator('.un-overlay')
  if (await un.count()) {
    await page.keyboard.press('Escape').catch(() => {})
    await expect(un).toHaveCount(0)
  }

  await page.getByRole('button', { name: '폴더 선택' }).click()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  if (refWorkspace) rmSync(refWorkspace, { recursive: true, force: true })
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

test('탐색기(F2): 파일타입 컬러 배지 + 검색 필터 + 사이드바 브랜딩/풋', async () => {

  await expect(page.locator('.fe-tree .ftbadge').first()).toBeVisible()
  expect(await page.locator('.fe-tree .ftbadge').count()).toBeGreaterThanOrEqual(2)

  await page.getByLabel('파일 검색').fill('sample')
  await expect(page.locator('.fe-file', { hasText: 'sample.ts' })).toBeVisible()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toHaveCount(0)
  await page.getByLabel('검색 지우기').click()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toBeVisible()

  await expect(page.locator('.sb-mark')).toBeVisible()
  await expect(page.locator('.sb-foot')).toBeVisible()

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await capture('explorer-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await capture('explorer-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
})

test('대화(F3): 빈 채팅(welcome 추천칩) + 리치 컴포저(피커·게이지)', async () => {

  await expect(page.locator('.welcome')).toBeVisible()
  expect(await page.locator('.wc-card').count()).toBe(4)

  await expect(page.locator('.composer textarea')).toBeVisible()
  expect(await page.locator('.composer-bar .pick').count()).toBe(3)
  expect(await page.locator('.ctx-strip .ctx-chip').count()).toBe(3)

  await page.getByLabel('모델 선택').click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('.composer textarea').click()

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await capture('chat-empty-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await capture('chat-empty-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
})

test('대화(F9): 슬래시 메뉴 + @멘션 팔레트 + 이미지 첨부 트레이', async () => {
  const ta = page.locator('.composer textarea')

  await ta.click()
  await ta.fill('/')
  await expect(page.locator('.slash-menu')).toBeVisible()
  await expect(page.locator('.slash-opt', { hasText: 'ask' }).first()).toBeVisible()
  await capture('composer-slash')

  await ta.fill('@')
  await expect(page.locator('.slash-menu .mention-loc')).toBeVisible()
  await capture('composer-mention')
  await ta.fill('')
  await expect(page.locator('.slash-menu')).toHaveCount(0)

  await attachSamplePng()
  await expect(page.locator('.img-tray .img-thumb').first()).toBeVisible()
  await capture('composer-attach')
  await page.locator('.img-tray .img-thumb-x').first().click()
})

test('F14 폴리시: 라이프사이클/모달 미표시 + ZoomBadge(Ctrl+휠)', async () => {
  expect(
    await page.locator('.q-overlay, .wn-scrim, .pf-overlay').count(),
  ).toBe(0)

  const scroll = page.locator('.chat-scroll')
  const box = await scroll.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    const badge = page.locator('.zoom-badge.on')
    if (await badge.count()) await capture('zoom-badge')
  }
})

test('F12 ImageViewer: 컴포저 첨부 → 썸네일 클릭 → 라이트박스', async () => {
  expect(await page.locator('.wn-scrim, .un-hero, .install-card, .pf-overlay').count()).toBe(0)

  await attachSamplePng()
  await expect(page.locator('.img-tray .img-thumb').first()).toBeVisible()
  await page.locator('.img-tray .img-thumb-open').first().click()
  await expect(page.locator('.iv-overlay')).toBeVisible()
  await expect(page.locator('.iv-overlay .iv-img')).toBeVisible()
  await page.locator('.iv-overlay').screenshot({ path: join(SHOT_DIR, 'imageviewer.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.iv-overlay')).toHaveCount(0)
  await page.locator('.img-tray .img-thumb-x').first().click().catch(() => {})
  await page.locator('.composer textarea').fill('')
})

test('F11 모달군1: GitModal + PromptModal + AskModal', async () => {
  await page.getByLabel('Git').first().click()
  await expect(page.locator('.gitm-overlay')).toBeVisible()
  await expect(page.locator('.diff-head .gitm-name')).toBeVisible()

  await page.locator('.gitm-nav .gitm-item', { hasText: '모든 커밋' }).click()
  await page.waitForSelector('.gitm-commit', { timeout: 10_000 })
  const commitRows = page.locator('.gitm-commit')
  expect(await commitRows.count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.gitm-commit .t', { hasText: '두 번째 커밋' })).toBeVisible()
  await expect(page.locator('.gitm-commit .t', { hasText: '초기 커밋' })).toBeVisible()
  await capture('gitmodal-history')

  await page.locator('.gitm-nav .gitm-item', { hasText: '변경 사항' }).click()
  await page.waitForSelector('.gitm-compose', { timeout: 10_000 })
  const changeFileRows = page.locator('.gitm-list .gitm-file')
  expect(await changeFileRows.count()).toBeGreaterThanOrEqual(1)
  await expect(page.locator('.gitm-compose')).toBeVisible()
  await capture('gitmodal-changes')

  await page.keyboard.press('Escape')
  await expect(page.locator('.gitm-overlay')).toHaveCount(0)

  const sbMore = page.locator('.sb-list .sb-item .more')
  if (await sbMore.count()) {
    await sbMore.first().click()
    await expect(page.locator('.ctx-menu')).toBeVisible()
    await page.locator('.ctx-item', { hasText: '프롬프트 설정' }).click()
    await expect(page.locator('.pr-count')).toBeVisible()
    await capture('prompt-modal')
    await page.keyboard.press('Escape')
    await expect(page.locator('.pr-overlay, .pr-modal')).toHaveCount(0)
  }

  const ta = page.locator('.composer textarea')
  await ta.click()
  await ta.fill('/ask')
  await expect(page.locator('.slash-menu')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.ask-overlay, .ask-modal').first()).toBeVisible()
  await capture('ask-modal')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await ta.fill('')
})

test('F10 RecentFiles: 파일 열기 → 코드 패널 위 탭바(.chat-files)', async () => {
  await page.locator('.fe-tree .fe-file', { hasText: 'sample.ts' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)

  await page.locator('.fe-tree .fe-file', { hasText: 'README.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  const tabs = page.locator('.chat-files .cf-tab')
  expect(await tabs.count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.chat-files .cf-tab.on')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
  await capture('recentfiles-tabs')

  const before = await tabs.count()
  await page.locator('.chat-files .cf-tab .cf-x').first().click()
  expect(await tabs.count()).toBe(before - 1)
})

test('코드: .ts 파일을 CodeMirror 코드뷰어로 표시', async () => {
  await page.locator('.fe-tree .fe-file', { hasText: 'sample.ts' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await expect(page.locator('.fv-overlay')).toBeVisible()
  await expect(page.locator('.fv-overlay .code-viewer')).toBeVisible()
  await capture('code')
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

test('마크다운: 렌더 + 코드 하이라이트 + 원격 이미지 차단', async () => {
  await page.locator('.fe-file', { hasText: 'README.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  await expect(page.locator('.fv-overlay .markdown-view table')).toBeVisible()
  await expect(page.locator('.fv-overlay .markdown-view .hljs').first()).toBeVisible()

  await expect(page.locator('.fv-overlay .md-img-blocked')).toBeVisible()
  expect(await page.locator('.fv-overlay .markdown-view img[src^="http"]').count()).toBe(0)

  await capture('markdown')
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

test('이미지: SVG 프리뷰가 <img>(data:)로 안전 렌더 + 토글', async () => {
  await page.locator('.fe-file', { hasText: 'logo.svg' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  const img = page.locator('.fv-overlay .image-preview img[src^="data:image/svg"]')
  await expect(img).toBeVisible()
  expect(await page.locator('.fv-overlay .image-preview object, .fv-overlay .image-preview iframe, .fv-overlay .image-preview svg').count()).toBe(0)
  await expect(page.locator('.fv-overlay .image-preview-toggle')).toBeVisible()

  await capture('image')
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

async function openTestModal(id: 'whatsnew' | 'updatenotes' | 'profile'): Promise<void> {
  await page.evaluate((modalId) => {
    window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: modalId }))
  }, id)
}

test('default-off 모달 캡처: WhatsNew(.wn-overlay)', async () => {
  await openTestModal('whatsnew')
  await page.waitForSelector('.wn-overlay', { timeout: 10_000 })
  await expect(page.locator('.wn-overlay')).toBeVisible()
  await page.locator('.wn-overlay').screenshot({ path: join(SHOT_DIR, 'whatsnew.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.wn-overlay')).toHaveCount(0)
})

test('default-off 모달 캡처: UpdateNotes(.un-overlay)', async () => {
  await openTestModal('updatenotes')
  await page.waitForSelector('.un-overlay', { timeout: 10_000 })
  await expect(page.locator('.un-overlay')).toBeVisible()
  await page.locator('.un-overlay').screenshot({ path: join(SHOT_DIR, 'updatenotes.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.un-overlay')).toHaveCount(0)
})

test('default-off 모달 캡처: Profile(.pf-overlay)', async () => {
  await openTestModal('profile')
  await page.waitForSelector('.pf-overlay', { timeout: 10_000 })
  await expect(page.locator('.pf-overlay')).toBeVisible()
  const loginBodyDisplay = await page.evaluate(() => {
    const el = document.querySelector('.login-body')
    return el ? getComputedStyle(el).display : 'missing'
  })
  expect(loginBodyDisplay).toBe('flex')
  await page.locator('.pf-overlay').screenshot({ path: join(SHOT_DIR, 'profile-onboarding.png') })
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: '__close_profile_test__' }))
  })
  const input = page.locator('.pf-overlay input#nickname')
  if (await input.count()) {
    await input.fill('테스트')
    await page.locator('.pf-overlay button[type="submit"]').click()
  }
  await expect(page.locator('.pf-overlay')).toHaveCount(0)
})

test('레퍼런스: 읽기전용 보조폴더 등록 → 탐색기 viewing 스위처 → 뷰어 읽기전용', async () => {
  await page.locator('.fe-folder-add').click()
  await expect(page.locator('.fe-frow:not(.main)').first()).toBeVisible()

  await page.locator('.fe-frow:not(.main)').first().click()
  await expect(page.locator('.fe-frow:not(.main)').first()).toHaveClass(/active/)
  await expect(page.locator('.fe-tree .fe-file', { hasText: 'guide.md' })).toBeVisible()

  await page.locator('.fe-tree .fe-file', { hasText: 'guide.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await expect(page.locator('.fv-overlay')).toBeVisible()
  await expect(page.locator('.fv-overlay .cvp-readonly-badge')).toBeVisible()

  await capture('reference')
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

test('QA(P2): 사이드바 풋터가 온보딩 프로필(QA테스터)을 표시', async () => {
  await expect(page.locator('.sb-foot .n')).toHaveText('QA테스터')
  await expect(page.locator('.sb-foot .ava')).toHaveText('Q')
})

test('QA(P5): 설정 5탭 실데이터 — 엔진(Agent SDK)·Skill·MCP·Code·테마', async () => {
  await page.locator('.sb-foot').click()
  await expect(page.locator('.set-layout')).toBeVisible()

  await expect(page.locator('.set-body')).toContainText('Agent SDK', { timeout: 10_000 })
  expect(await page.locator('.vpick-menu, .vpick-btn').count()).toBe(0)
  await capture('qa-settings-engine')

  await page.locator('.set-nav-item', { hasText: 'Skill' }).click()
  await expect(page.locator('.set-h1')).toContainText('Skill')
  await capture('qa-settings-skill')

  await page.locator('.set-nav-item', { hasText: 'MCP' }).click()
  await expect(page.locator('.set-h1')).toContainText('MCP')
  await capture('qa-settings-mcp')

  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page.locator('.set-body')).toContainText('TypeScript')
  await capture('qa-settings-lsp')

  await page.locator('.set-nav-item', { hasText: '테마' }).click()
  await expect(page.locator('.set-theme-grid')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.set-layout')).toHaveCount(0)
})

test('QA(P15): 멀티 패널별 cwd — 폴더 버튼 → dialog.pickFolder → 패널 cwd 갱신', async () => {
  await page.getByRole('tab', { name: '멀티 에이전트' }).click()
  await expect(page.locator('.ma-grid')).toBeVisible()
  await capture('qa-multi-grid')

  const folderName = page.locator('.ma-panel .ma-p-folder .ma-p-folder-name').first()
  await page.locator('.ma-panel .ma-p-folder').first().click()
  await expect(folderName).toContainText('agentdeck-ref', { timeout: 10_000 })
  await capture('qa-multi-cwd')

  await page.getByRole('tab', { name: '단일 에이전트' }).click()
})
