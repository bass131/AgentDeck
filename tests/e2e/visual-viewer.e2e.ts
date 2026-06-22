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
 *   - F15-02: 탐색기·채팅 항상 표시(pane-tab 제거). 파일 클릭 → .fv-overlay 플로팅 모달.
 *   - 다음 파일 열기 전 Esc 또는 닫기 버튼으로 모달을 닫을 것(탭 복원 불필요).
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
  // F15-02: 빈상태 버튼 라벨이 "폴더 선택"으로 변경됨(AGENTDECK_E2E_WORKSPACE 우회)
  await page.getByRole('button', { name: '폴더 선택' }).click()
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
  // F15-02: 탐색기 항상 표시 — 탭 클릭 불필요

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
  // F15-02: 채팅 항상 표시 — 탭 클릭 불필요

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
  // F15-02: 채팅 항상 표시 — 탭 클릭 불필요
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

test('F14 폴리시: 라이프사이클/모달 미표시 + ZoomBadge(Ctrl+휠)', async () => {
  // 권한/질문 모달·라이프사이클 5개 런치 미표시(default off)
  expect(
    await page.locator('.q-overlay, .perm-modal, .wn-scrim, .pf-overlay').count(),
  ).toBe(0)

  // ZoomBadge: 채팅 스크롤 위 Ctrl+휠 → zoom-badge 노출 (채팅 항상 표시 — F15-02)
  const scroll = page.locator('.chat-scroll')
  const box = await scroll.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    // 줌 배지는 일시 노출 — 보이면 캡처(jsdom 미커버분 라이브 보강)
    const badge = page.locator('.zoom-badge.on')
    if (await badge.count()) await capture('zoom-badge')
  }
})

test('F12 ImageViewer: 컴포저 첨부 → 썸네일 클릭 → 라이트박스', async () => {
  // 라이프사이클 5개 오버레이는 런치 시 미표시(default off)
  expect(await page.locator('.wn-scrim, .un-hero, .install-card, .pf-overlay').count()).toBe(0)

  // 컴포저 attach → 샘플 썸네일 → 클릭 → ImageViewer (채팅 항상 표시 — F15-02)
  await page.getByLabel('이미지 첨부').click()
  await expect(page.locator('.img-tray .img-thumb').first()).toBeVisible()
  await page.locator('.img-tray .img-thumb-open').first().click()
  await expect(page.locator('.iv-overlay')).toBeVisible()
  await expect(page.locator('.iv-overlay .iv-img')).toBeVisible()
  await page.locator('.iv-overlay').screenshot({ path: join(SHOT_DIR, 'imageviewer.png') })
  await page.keyboard.press('Escape') // 라이트박스 닫기
  await expect(page.locator('.iv-overlay')).toHaveCount(0)
  // 정리: 첨부 제거 + textarea 비움
  await page.locator('.img-tray .img-thumb-x').first().click().catch(() => {})
  await page.locator('.composer textarea').fill('')
})

test('F11 모달군1: GitModal + PromptModal + AskModal', async () => {
  // ── GitModal: 탐색기 git 버튼(워크스페이스 로드됨) → 오버레이
  await page.getByLabel('Git').first().click()
  await expect(page.locator('.gitm-overlay')).toBeVisible()
  await expect(page.locator('.diff-head .gitm-name')).toBeVisible()
  await page.locator('.gitm-nav .gitm-item', { hasText: '모든 커밋' }).click()
  await capture('gitmodal-history')
  await page.locator('.gitm-nav .gitm-item', { hasText: '변경 사항' }).click()
  await expect(page.locator('.gitm-compose')).toBeVisible()
  await capture('gitmodal-changes')
  await page.keyboard.press('Escape')
  await expect(page.locator('.gitm-overlay')).toHaveCount(0)

  // ── PromptModal: 사이드바 세션 more → 프롬프트 설정
  await page.locator('.sb-list .sb-item .more').first().click()
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await page.locator('.ctx-item', { hasText: '프롬프트 설정' }).click()
  await expect(page.locator('.pr-count')).toBeVisible()
  await capture('prompt-modal')
  await page.keyboard.press('Escape')
  await expect(page.locator('.pr-overlay, .pr-modal')).toHaveCount(0)

  // ── AskModal: 컴포저 /ask 슬래시 선택 (채팅 항상 표시 — F15-02)
  const ta = page.locator('.composer textarea')
  await ta.click()
  await ta.fill('/ask')
  await expect(page.locator('.slash-menu')).toBeVisible()
  await page.keyboard.press('Enter') // ask 선택 → onSlashAsk → AskModal
  await expect(page.locator('.ask-overlay, .ask-modal').first()).toBeVisible()
  await capture('ask-modal')
  await page.keyboard.press('Escape') // 최소화
  await page.keyboard.press('Escape') // 닫기
  await ta.fill('') // 정리
})

test('F10 RecentFiles: 파일 열기 → 코드 패널 위 탭바(.chat-files)', async () => {
  // F15: 파일 클릭 → 센터+블러 플로팅 모달(.fv-overlay, 스크림 차단). 탐색기 항상 표시.
  // 스크림이 차단하므로 다음 파일을 열려면 Esc로 닫고 연다(원본과 동일).
  // 첫 번째 파일 열기 → 모달 → 닫기
  await page.locator('.fe-tree .fe-file', { hasText: 'sample.ts' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)

  // 두 번째 파일 열기 → 모달(openedFile = README.md). recentFiles 누적 = 2.
  await page.locator('.fe-tree .fe-file', { hasText: 'README.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  // 탭바: .chat-files cf-tab ≥ 2, 활성 .on(openedFile = README.md) — 스크림 뒤 DOM 가시
  const tabs = page.locator('.chat-files .cf-tab')
  expect(await tabs.count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.chat-files .cf-tab.on')).toBeVisible()

  // 모달 닫고 탭바를 직접 조작/캡처(스크림 없을 때만 클릭 가능)
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
  await capture('recentfiles-tabs')

  // x로 탭 1개 제거 → 개수 감소
  const before = await tabs.count()
  await page.locator('.chat-files .cf-tab .cf-x').first().click()
  expect(await tabs.count()).toBe(before - 1)
})

test('코드: .ts 파일을 CodeMirror 코드뷰어로 표시', async () => {
  // F15-02: 파일 클릭 → .fv-overlay 모달(탭 전환 없음)
  await page.locator('.fe-tree .fe-file', { hasText: 'sample.ts' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await expect(page.locator('.fv-overlay')).toBeVisible()
  await expect(page.locator('.fv-overlay .code-viewer')).toBeVisible()
  await capture('code')
  // 정리: 모달 닫기
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

test('마크다운: 렌더 + 코드 하이라이트 + 원격 이미지 차단', async () => {
  // F15-02: 탐색기 항상 표시(탭 복원 불필요). 파일 클릭 → .fv-overlay 모달.
  await page.locator('.fe-file', { hasText: 'README.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  // 구조 단언 — 표/코드 하이라이트가 모달 안에 실제 렌더되었는지
  await expect(page.locator('.fv-overlay .markdown-view table')).toBeVisible()
  await expect(page.locator('.fv-overlay .markdown-view .hljs').first()).toBeVisible()

  // 신뢰경계 — 원격 http 이미지는 차단(플레이스홀더), <img>로 로드되지 않음
  await expect(page.locator('.fv-overlay .md-img-blocked')).toBeVisible()
  expect(await page.locator('.fv-overlay .markdown-view img[src^="http"]').count()).toBe(0)

  await capture('markdown')
  // 정리: 모달 닫기
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

test('이미지: SVG 프리뷰가 <img>(data:)로 안전 렌더 + 토글', async () => {
  // F15-02: 탐색기 항상 표시(탭 복원 불필요). 파일 클릭 → .fv-overlay 모달.
  await page.locator('.fe-file', { hasText: 'logo.svg' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })

  const img = page.locator('.fv-overlay .image-preview img[src^="data:image/svg"]')
  await expect(img).toBeVisible()
  // SVG는 반드시 <img>로만 — object/iframe/inline-svg 미사용(스크립트 비활성 보장)
  expect(await page.locator('.fv-overlay .image-preview object, .fv-overlay .image-preview iframe, .fv-overlay .image-preview svg').count()).toBe(0)
  // 맞춤/실제크기 토글 존재
  await expect(page.locator('.fv-overlay .image-preview-toggle')).toBeVisible()

  await capture('image')
  // 정리: 모달 닫기
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})

// ── 헬퍼: agentdeck:test-open CustomEvent 디스패치 ──────────────────────────
/** Playwright 자동화(navigator.webdriver=true)에서만 Shell 리스너가 활성 */
async function openTestModal(id: 'whatsnew' | 'updatenotes' | 'profile'): Promise<void> {
  await page.evaluate((modalId) => {
    window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: modalId }))
  }, id)
}

// ══════════════════════════════════════════════════════════════════════════════
// default-off 모달 캡처 (navigator.webdriver 게이트 — 프로덕션 무영향)
// ══════════════════════════════════════════════════════════════════════════════

test('default-off 모달 캡처: WhatsNew(.wn-overlay)', async () => {
  // 1. agentdeck:test-open 'whatsnew' → Shell의 setWhatsNewOpen(true) 호출
  await openTestModal('whatsnew')
  // 2. .wn-overlay 대기 (오버레이 전체 — wn-scrim + wn-hero + wn-dock 포함)
  await page.waitForSelector('.wn-overlay', { timeout: 10_000 })
  await expect(page.locator('.wn-overlay')).toBeVisible()
  // 3. 오버레이 스크린샷 저장
  await page.locator('.wn-overlay').screenshot({ path: join(SHOT_DIR, 'whatsnew.png') })
  // 4. Esc로 닫기 + 오버레이 사라짐 단언 (다음 케이스 오염 방지)
  await page.keyboard.press('Escape')
  await expect(page.locator('.wn-overlay')).toHaveCount(0)
})

test('default-off 모달 캡처: UpdateNotes(.un-overlay)', async () => {
  // 1. agentdeck:test-open 'updatenotes' → Shell의 setUpdateNotesOpen(true) 호출
  await openTestModal('updatenotes')
  // 2. .un-overlay 대기
  await page.waitForSelector('.un-overlay', { timeout: 10_000 })
  await expect(page.locator('.un-overlay')).toBeVisible()
  // 3. 오버레이 스크린샷 저장
  await page.locator('.un-overlay').screenshot({ path: join(SHOT_DIR, 'updatenotes.png') })
  // 4. Esc로 닫기 + 오버레이 사라짐 단언
  await page.keyboard.press('Escape')
  await expect(page.locator('.un-overlay')).toHaveCount(0)
})

test('default-off 모달 캡처: Profile(.pf-overlay)', async () => {
  // 1. agentdeck:test-open 'profile' → Shell의 setProfileOpen(true) 호출
  await openTestModal('profile')
  // 2. .pf-overlay 대기 (.login-body 포함)
  await page.waitForSelector('.pf-overlay', { timeout: 10_000 })
  await expect(page.locator('.pf-overlay')).toBeVisible()
  // 3. 오버레이 스크린샷 저장
  await page.locator('.pf-overlay').screenshot({ path: join(SHOT_DIR, 'profile-onboarding.png') })
  // 4. Esc는 Profile에 핸들러 없음 → .pf-overlay 자체 X 버튼 없음.
  //    onEnter 콜백이 setProfileOpen(false)이므로, 닉네임 입력 후 입장하기로 닫는다.
  //    테스트 자동화 편의상: 폼 submit 또는 직접 evaluate로 닫기.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: '__close_profile_test__' }))
  })
  // Profile은 onEnter가 setProfileOpen(false)이므로 입장하기 submit 경로 사용
  const input = page.locator('.pf-overlay input#nickname')
  if (await input.count()) {
    await input.fill('테스트')
    await page.locator('.pf-overlay button[type="submit"]').click()
  }
  await expect(page.locator('.pf-overlay')).toHaveCount(0)
})

test('레퍼런스: 읽기전용 보조폴더 등록 → 탐색기 viewing 스위처 → 뷰어 읽기전용', async () => {
  // F15-02: 탐색기 항상 표시(탭 복원 불필요). viewing 모델: .fe-folder-add 클릭 →
  //   AGENTDECK_E2E_REFERENCE 우회 → 레퍼런스 .fe-frow:not(.main) 등록.
  await page.locator('.fe-folder-add').click()
  // 레퍼런스 폴더 행이 .fe-frow:not(.main)으로 추가됨
  await expect(page.locator('.fe-frow:not(.main)').first()).toBeVisible()

  // 레퍼런스 폴더 행 클릭 → viewing 전환(해당 ref 트리 .fe-tree 표시)
  await page.locator('.fe-frow:not(.main)').first().click()
  await expect(page.locator('.fe-frow:not(.main)').first()).toHaveClass(/active/)
  // ref 트리에 guide.md가 나타남
  await expect(page.locator('.fe-tree .fe-file', { hasText: 'guide.md' })).toBeVisible()

  // 레퍼런스 파일 클릭 → .fv-overlay 모달 + 읽기전용 배지(openedRootId = ref id)
  await page.locator('.fe-tree .fe-file', { hasText: 'guide.md' }).click()
  await page.waitForSelector('.fv-overlay .diff-head', { timeout: 10_000 })
  await expect(page.locator('.fv-overlay')).toBeVisible()
  await expect(page.locator('.fv-overlay .cvp-readonly-badge')).toBeVisible()

  await capture('reference')
  // 정리: 모달 닫기
  await page.keyboard.press('Escape')
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
})
