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
 *   npm run test:e2e:visual   # 이 파일만
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
import { execFileSync } from 'node:child_process'

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

/**
 * 이미지 첨부 헬퍼 — 컴포저 숨김 file input에 1×1 PNG 주입(실 파일 picker 우회).
 * M4-2(P22c) 이후 첨부는 OS 파일 선택이라 e2e는 setInputFiles로 주입한다.
 * 실 첨부 플로우(pathForFile→saveImageData→data URL 썸네일)를 그대로 검증.
 */
const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
async function attachSamplePng(): Promise<void> {
  const p = join(workspace, `_qa-attach-${Date.now()}.png`)
  writeFileSync(p, Buffer.from(SAMPLE_PNG_B64, 'base64'))
  await page.locator('.composer input[type="file"]').first().setInputFiles(p)
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

  // ── git 레포 초기화 (GitModal 실데이터 검증용) ────────────────────────────
  // 워크스페이스 내부에서만 커밋 — 실 프로젝트 repo/origin 미영향.
  const gitOpts = {
    cwd: workspace,
    windowsHide: true,
    encoding: 'utf8' as const,
    stdio: 'pipe' as const,
  }

  try {
    // 1) git init
    execFileSync('git', ['init'], gitOpts)

    // 2) 테스트용 신원 설정 (전역 config 없어도 커밋 가능)
    execFileSync('git', ['config', 'user.email', 'test@agentdeck.local'], gitOpts)
    execFileSync('git', ['config', 'user.name', 'AgentDeck Test'], gitOpts)

    // 3) 첫 번째 커밋 (README + logo + sample 모두 포함)
    execFileSync('git', ['add', '-A'], gitOpts)
    execFileSync('git', ['commit', '-m', '초기 커밋'], gitOpts)

    // 4) 파일 하나 추가 후 두 번째 커밋
    writeFileSync(join(workspace, 'notes.txt'), '두 번째 커밋에 추가된 노트 파일\n')
    execFileSync('git', ['add', '-A'], gitOpts)
    execFileSync('git', ['commit', '-m', '두 번째 커밋'], gitOpts)

    // 5) 추적 파일 수정만 (커밋 안 함) → working change 1개
    writeFileSync(join(workspace, 'notes.txt'), '두 번째 커밋에 추가된 노트 파일\n수정된 내용 (working change)\n')
    // git add -A 하지 않음 — unstaged 변경으로 남겨 GitModal changes 뷰에 표시
  } catch (e) {
    // git 초기화 실패해도 다른 케이스는 진행 (git 없는 환경 대응)
    console.warn('[e2e] git 초기화 실패 — GitModal은 비-git 상태로 테스트:', e)
  }

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
      AGENTDECK_E2E_REFERENCE: refWorkspace,
      // P15: dialog.pickFolder(멀티 패널별 cwd) 네이티브 다이얼로그 우회
      AGENTDECK_E2E_PICK_FOLDER: refWorkspace
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // ── 진입 대문(P2 온보딩 → P3 engine-gate) 통과 + 첫 화면 실측 캡처 ──────────────
  // 빈 userData → getProfile()=null → 온보딩 화면. (기존 e2e는 이 대문을 몰라 .titlebar 타임아웃했음.)
  await page.waitForSelector('.login-body, .titlebar, .eg-auth-dialog, .boot-splash', { timeout: 15_000 })
  await capture('00-launch')
  // 온보딩: 닉네임 입력 + 입장하기
  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill('QA테스터')
    await page.locator('.login-body button.submit').click()
  }
  // engine-gate(미인증)면 "계속 진행"으로 우회 (authed면 미표시 → 바로 Shell)
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: 3000 })
    await capture('00b-engine-gate')
    await egSkip.click()
  } catch {
    /* authed → engine-gate 미표시 */
  }

  await page.waitForSelector('.titlebar', { timeout: 15_000 })

  // ── P4: 첫 실행 시 WhatsNew 온보딩 덱이 자동 표시(seen-key 빈값) — 실측 캡처 후 닫기 ──
  const wn = page.locator('.wn-overlay')
  try {
    await wn.waitFor({ state: 'visible', timeout: 3000 })
    await capture('00c-whatsnew-autoshow')
    await page.locator('.wn-overlay .wn-nav-cta').click() // 건너뛰기
    await expect(wn).toHaveCount(0)
  } catch {
    /* WhatsNew 미표시(seen-key 존재 등) */
  }
  // UpdateNotes 자동 표시도 방어적으로 닫기(드문 케이스)
  const un = page.locator('.un-overlay')
  if (await un.count()) {
    await page.keyboard.press('Escape').catch(() => {})
    await expect(un).toHaveCount(0)
  }

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
  // P10 실측: 슬래시가 빌트인 12 + 실 스킬(~/.claude/skills)을 IPC로 로드 →
  // 'ask' 부분일치가 빌트인 ask + 스킬 desc 등 다중 매칭 → .first()(빌트인 ask 먼저).
  await expect(page.locator('.slash-opt', { hasText: 'ask' }).first()).toBeVisible()
  await capture('composer-slash')

  // @멘션 팔레트: '@' 입력 → slash-menu(mention-loc)
  await ta.fill('@')
  await expect(page.locator('.slash-menu .mention-loc')).toBeVisible()
  await capture('composer-mention')
  await ta.fill('') // 입력 정리(팔레트 닫힘)
  await expect(page.locator('.slash-menu')).toHaveCount(0)

  // 이미지 첨부: M4-2(P22c) 이후 실 파일 picker — 샘플 자동삽입 아님. 숨김 input에 PNG 주입.
  await attachSamplePng()
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

  // 컴포저 attach(실 파일 picker — 숨김 input PNG 주입) → 썸네일 → 클릭 → ImageViewer
  await attachSamplePng()
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

  // ── history 뷰 단언: 실 git 커밋 2개 + 커밋 메시지 텍스트 ───────────────
  // 기본 뷰는 'history'. gitm-commit 행이 ≥ 2 (초기 커밋 + 두 번째 커밋).
  await page.locator('.gitm-nav .gitm-item', { hasText: '모든 커밋' }).click()
  // 커밋 행 로딩 대기 (IPC git.log 응답 후 렌더)
  await page.waitForSelector('.gitm-commit', { timeout: 10_000 })
  const commitRows = page.locator('.gitm-commit')
  expect(await commitRows.count()).toBeGreaterThanOrEqual(2)
  // 실제 커밋 subject 텍스트가 목록 안에 있어야 함
  // (gitm-commit 내 .t 스팬에 subject 텍스트 렌더)
  await expect(page.locator('.gitm-commit .t', { hasText: '두 번째 커밋' })).toBeVisible()
  await expect(page.locator('.gitm-commit .t', { hasText: '초기 커밋' })).toBeVisible()
  await capture('gitmodal-history')

  // ── changes 뷰 단언: working change ≥ 1 + 커밋 컴포저 ───────────────────
  await page.locator('.gitm-nav .gitm-item', { hasText: '변경 사항' }).click()
  // 변경 파일 행 렌더 대기 (git.status 응답 후)
  await page.waitForSelector('.gitm-compose', { timeout: 10_000 })
  // working change가 있으면 .gitm-file 행 ≥ 1 (notes.txt 수정됨)
  const changeFileRows = page.locator('.gitm-list .gitm-file')
  expect(await changeFileRows.count()).toBeGreaterThanOrEqual(1)
  // 커밋 컴포저 표시 확인
  await expect(page.locator('.gitm-compose')).toBeVisible()
  await capture('gitmodal-changes')

  await page.keyboard.press('Escape')
  await expect(page.locator('.gitm-overlay')).toHaveCount(0)

  // ── PromptModal: 사이드바 세션 more → 프롬프트 설정
  //    빈 userData(격리)는 저장된 세션이 없어 .sb-item 부재 → 조건부(있을 때만).
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
  // N9b 회귀 가드: .login-body가 flex 컨테이너로 적용되는지(주석 */ 버그로 규칙
  // 드롭되면 display:block이 됨). 풀높이 브랜드 패널의 선행 조건.
  const loginBodyDisplay = await page.evaluate(() => {
    const el = document.querySelector('.login-body')
    return el ? getComputedStyle(el).display : 'missing'
  })
  expect(loginBodyDisplay).toBe('flex')
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

// ══════════════════════════════════════════════════════════════════════════════
// QA 실측 — 이번 세션 신규 기능(P2 프로필·P5 Settings 실데이터·P15 멀티 cwd) 런타임 검증
// ══════════════════════════════════════════════════════════════════════════════

test('QA(P2): 사이드바 풋터가 온보딩 프로필(QA테스터)을 표시', async () => {
  // beforeAll에서 닉네임 "QA테스터"로 온보딩 완료 → 사이드바 풋터에 실 프로필 반영(샘플 아님)
  await expect(page.locator('.sb-foot .n')).toHaveText('QA테스터')
  await expect(page.locator('.sb-foot .ava')).toHaveText('Q')
})

test('QA(P5): 설정 5탭 실데이터 — 엔진(Agent SDK)·Skill·MCP·Code·테마', async () => {
  // 사이드바 풋터 클릭 → 설정 모달
  await page.locator('.sb-foot').click()
  await expect(page.locator('.set-layout')).toBeVisible()

  // 엔진 탭(기본): getEngineState 실데이터 → "Agent SDK" 표시 + 가짜 멀티버전 picker 제거됨(P5c)
  await expect(page.locator('.set-body')).toContainText('Agent SDK', { timeout: 10_000 })
  expect(await page.locator('.vpick-menu, .vpick-btn').count()).toBe(0)
  await capture('qa-settings-engine')

  // Skill 탭: 실 ~/.claude/skills 스캔(P5a) — 목록 또는 빈 상태 렌더(크래시 0)
  await page.locator('.set-nav-item', { hasText: 'Skill' }).click()
  await expect(page.locator('.set-h1')).toContainText('Skill')
  await capture('qa-settings-skill')

  // MCP 탭: 실 ~/.claude.json 스캔(P5b, 마스킹) — 목록 또는 빈 상태
  await page.locator('.set-nav-item', { hasText: 'MCP' }).click()
  await expect(page.locator('.set-h1')).toContainText('MCP')
  await capture('qa-settings-mcp')

  // Code(LSP) 탭: TS/Py 번들 표시(P5c). 'Code'는 "Claude Code"와 중복 → exact 매칭.
  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page.locator('.set-body')).toContainText('TypeScript')
  await capture('qa-settings-lsp')

  // 테마 탭: 실동작 picker
  await page.locator('.set-nav-item', { hasText: '테마' }).click()
  await expect(page.locator('.set-theme-grid')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.set-layout')).toHaveCount(0)
})

test('QA(P15): 멀티 패널별 cwd — 폴더 버튼 → dialog.pickFolder → 패널 cwd 갱신', async () => {
  // 멀티 에이전트 전환 (작업 모드 = role="tab")
  await page.getByRole('tab', { name: '멀티 에이전트' }).click()
  await expect(page.locator('.ma-grid')).toBeVisible()
  await capture('qa-multi-grid')

  // 첫 패널 폴더 버튼 클릭 → pickFolder(AGENTDECK_E2E_PICK_FOLDER=refWorkspace 우회) → 패널 cwd 라벨 갱신
  const folderName = page.locator('.ma-panel .ma-p-folder .ma-p-folder-name').first()
  await page.locator('.ma-panel .ma-p-folder').first().click()
  // refWorkspace basename(agentdeck-ref-*)로 라벨 변경
  await expect(folderName).toContainText('agentdeck-ref', { timeout: 10_000 })
  await capture('qa-multi-cwd')

  // 단일 에이전트로 복귀(후속 케이스 격리)
  await page.getByRole('tab', { name: '단일 에이전트' }).click()
})
