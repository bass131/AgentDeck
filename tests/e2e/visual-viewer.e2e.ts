/**
 * visual-viewer.e2e.ts — 시각 검증(Visual e2e) 정식 스위트.
 *
 * 목적: 실제 Electron 런타임을 띄워 UI를 *구동*하고, 렌더 결과를
 *   (1) DOM 단언으로 회귀 검증하고
 *   (2) 스크린샷 PNG로 캡처(사람/AI가 눈으로 확인)한다.
 *
 * 스크린샷 산출물: `artifacts/screenshots/*.png` (gitignore — 매 실행 재생성).
 * 실행:
 *   npm run test:e2e          # 전체 e2e(이 파일 포함)
 *   npm run test:e2e:visual   # 이 파일만 (better-sqlite3 ABI 자동 정렬/복구)
 *
 * 결정론: 뷰어는 fs.read만 사용(에이전트 백엔드 불필요).
 *   AGENTDECK_E2E_WORKSPACE → 네이티브 폴더 다이얼로그 우회.
 *
 * 확장 가이드: 새 UI Phase는 여기에 `<기능> 화면을 캡처한다` 케이스를 추가한다.
 *   - 좌측 탐색기는 파일 클릭 시 diff 탭으로 자동 전환되므로, 다음 파일을
 *     열기 전 '탐색기' 탭을 다시 눌러 트리를 복원할 것.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page
let workspace: string
let refWorkspace: string
let userDataDir: string

/** 스크린샷 저장 위치 (gitignore된 artifacts/) */
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

/** 캡처 헬퍼 — 전체 셸 뷰포트를 PNG로 저장 */
async function capture(name: string): Promise<void> {
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false })
}

// ── 픽스처 콘텐츠 ──────────────────────────────────────────────────────────────

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

// ── 라이프사이클 ───────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-visual-'))
  writeFileSync(join(workspace, 'README.md'), README)
  writeFileSync(join(workspace, 'logo.svg'), LOGO_SVG)
  writeFileSync(
    join(workspace, 'sample.ts'),
    'export interface User { id: number; name: string }\n\nexport const greet = (u: User): string => `안녕, ${u.name}`\n'
  )

  // 레퍼런스 폴더(읽기전용 보조 루트) — AGENTDECK_E2E_REFERENCE로 다이얼로그 우회
  refWorkspace = mkdtempSync(join(tmpdir(), 'agentdeck-ref-'))
  writeFileSync(join(refWorkspace, 'guide.md'), '# 레퍼런스 가이드\n\n워크스페이스 밖 **읽기전용** 보조 문서.\n')

  // 격리된 userData — 영속 DB(다른 e2e의 저장 대화)와 분리 → 빈 채팅 결정론
  userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-udata-'))

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_REFERENCE: refWorkspace
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.titlebar', { timeout: 15_000 })
  await page.getByRole('button', { name: '폴더 열기' }).click()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  if (refWorkspace) rmSync(refWorkspace, { recursive: true, force: true })
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

// ── 케이스 ─────────────────────────────────────────────────────────────────────

test('탐색기(F2): 파일타입 컬러 배지 + 검색 필터 + 사이드바 브랜딩/풋', async () => {
  // 탐색기 탭 활성(직전 상태 무관하게)
  await page.getByRole('button', { name: '탐색기', exact: true }).click()

  // 파일타입 배지(.ftbadge) — 루트 파일들(README/sample/logo)에 렌더
  await expect(page.locator('.fe-tree .ftbadge').first()).toBeVisible()
  expect(await page.locator('.fe-tree .ftbadge').count()).toBeGreaterThanOrEqual(2)

  // 검색 필터: 'sample' → sample.ts만, README 제외
  await page.getByLabel('파일 검색').fill('sample')
  await expect(page.locator('.fe-file', { hasText: 'sample.ts' })).toBeVisible()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toHaveCount(0)
  await page.getByLabel('검색 지우기').click()
  await expect(page.locator('.fe-file', { hasText: 'README.md' })).toBeVisible()

  // 사이드바 브랜딩 mark + 프로필 풋
  await expect(page.locator('.sb-mark')).toBeVisible()
  await expect(page.locator('.sb-foot')).toBeVisible()

  // 양 테마 스크린샷 (탐색기+사이드바 충실도 대조)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await capture('explorer-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await capture('explorer-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
})

test('대화(F3): 빈 채팅(welcome 추천칩) + 리치 컴포저(피커·게이지)', async () => {
  // 중앙 대화 탭 활성화
  await page.locator('.pane.chat .pane-tab', { hasText: '대화' }).click()

  // 빈 채팅: welcome + 추천 칩 2×2(4)
  await expect(page.locator('.welcome')).toBeVisible()
  expect(await page.locator('.wc-card').count()).toBe(4)

  // 리치 컴포저: textarea + 피커 3 + 게이지 3 + send
  await expect(page.locator('.composer textarea')).toBeVisible()
  expect(await page.locator('.composer-bar .pick').count()).toBe(3)
  expect(await page.locator('.ctx-strip .ctx-chip').count()).toBe(3)

  // 피커 로컬 선택: 모델 피커 열림 → 옵션
  await page.getByLabel('모델 선택').click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('.composer textarea').click() // 메뉴 닫기

  // 양 테마 스크린샷
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await capture('chat-empty-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await capture('chat-empty-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
})

test('대화(F9): 슬래시 메뉴 + @멘션 팔레트 + 이미지 첨부 트레이', async () => {
  await page.locator('.pane.chat .pane-tab', { hasText: '대화' }).click()
  const ta = page.locator('.composer textarea')

  // 슬래시 메뉴: '/' 입력 → slash-menu(명령어)
  await ta.click()
  await ta.fill('/')
  await expect(page.locator('.slash-menu')).toBeVisible()
  await expect(page.locator('.slash-opt', { hasText: 'ask' })).toBeVisible()
  await capture('composer-slash')

  // @멘션 팔레트: '@' 입력 → slash-menu(mention-loc)
  await ta.fill('@')
  await expect(page.locator('.slash-menu .mention-loc')).toBeVisible()
  await capture('composer-mention')
  await ta.fill('') // 입력 정리(팔레트 닫힘)
  await expect(page.locator('.slash-menu')).toHaveCount(0)

  // 이미지 첨부 트레이: attach 버튼 → img-tray 썸네일
  await page.getByLabel('이미지 첨부').click()
  await expect(page.locator('.img-tray .img-thumb').first()).toBeVisible()
  await capture('composer-attach')
  // 첨부 제거 → 트레이 정리
  await page.locator('.img-tray .img-thumb-x').first().click()
})

test('코드: .ts 파일을 CodeMirror 코드뷰어로 표시', async () => {
  await page.locator('.fe-tree .fe-file', { hasText: 'sample.ts' }).click()
  await page.waitForSelector('.code-viewer', { timeout: 10_000 })
  await expect(page.locator('.code-viewer')).toBeVisible()
  await capture('code')
})

test('마크다운: 렌더 + 코드 하이라이트 + 원격 이미지 차단', async () => {
  // 직전 코드 파일 클릭으로 좌측이 diff 탭 → 탐색기 복원
  await page.getByRole('button', { name: '탐색기', exact: true }).click()
  await page.locator('.fe-file', { hasText: 'README.md' }).click()
  await page.waitForSelector('.markdown-view', { timeout: 10_000 })

  // 구조 단언 — 표/코드 하이라이트가 실제 렌더되었는지
  await expect(page.locator('.markdown-view table')).toBeVisible()
  await expect(page.locator('.markdown-view .hljs').first()).toBeVisible()

  // 신뢰경계 — 원격 http 이미지는 차단(플레이스홀더), <img>로 로드되지 않음
  await expect(page.locator('.md-img-blocked')).toBeVisible()
  expect(await page.locator('.markdown-view img[src^="http"]').count()).toBe(0)

  await capture('markdown')
})

test('이미지: SVG 프리뷰가 <img>(data:)로 안전 렌더 + 토글', async () => {
  // 직전 파일 클릭으로 좌측이 diff 탭이 됨 → 탐색기 탭 복원 후 logo.svg 열기
  await page.getByRole('button', { name: '탐색기', exact: true }).click()
  await page.locator('.fe-file', { hasText: 'logo.svg' }).click()

  const img = page.locator('.image-preview img[src^="data:image/svg"]')
  await expect(img).toBeVisible()
  // SVG는 반드시 <img>로만 — object/iframe/inline-svg 미사용(스크립트 비활성 보장)
  expect(await page.locator('.image-preview object, .image-preview iframe, .image-preview svg').count()).toBe(0)
  // 맞춤/실제크기 토글 존재
  await expect(page.locator('.image-preview-toggle')).toBeVisible()

  await capture('image')
})

test('레퍼런스: 읽기전용 보조폴더 등록 → 탐색기 표시 → 뷰어 읽기전용', async () => {
  // 직전 파일 클릭으로 좌측이 diff 탭 → 탐색기 복원
  await page.getByRole('button', { name: '탐색기', exact: true }).click()
  // 레퍼런스 폴더 추가(AGENTDECK_E2E_REFERENCE 우회) → 섹션 + 읽기전용 배지 표시
  await page.getByRole('button', { name: '레퍼런스 폴더 추가' }).click()
  await expect(page.locator('.fe-ref-section')).toBeVisible()
  await expect(page.locator('.fe-ref-badge')).toContainText('읽기전용')

  // 레퍼런스 파일 클릭 → 뷰어 표시 + 읽기전용 태그(openedRootId가 ref id)
  await page.locator('.fe-ref-section .fe-file', { hasText: 'guide.md' }).click()
  await expect(page.locator('.markdown-view')).toBeVisible()
  await expect(page.locator('.cvp-readonly-badge')).toBeVisible()

  await capture('reference')
})
