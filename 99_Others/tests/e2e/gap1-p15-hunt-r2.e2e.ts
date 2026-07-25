/**
 * gap1-p15-hunt-r2.e2e.ts — GAP1 P15 라이브 버그 헌팅 루프 라운드 2 신규 시나리오 (opt-in).
 *
 * Phase 정본 = `01.Phases/17_GAP1-core-parity/15-live-bug-hunt-loop.md` ① 배터리 확장 —
 * 라운드 2 배정 축(대형 파일 필수 + 장시간 다턴 선택) + R1 봉합 5건(커밋 09d256d)의
 * 라이브 검증(V1~V4). 원장 = 15-rounds-log.md.
 *
 *   L1) 대형 파일 종주(필수 축): git 커밋된 6,000줄(~440KB) 파일에 검색→열람→부분
 *       수정→diff 열람을 실 SDK로 종주. 검증 축:
 *       - [V1] P08 검색 결과 카드가 실 SDK Grep 출력에서 실제 렌더되는지 — expect.soft
 *         단정(실패해도 종주 계속: 헌팅 스펙은 나머지 축 데이터를 계속 수집해야 한다).
 *         R1 S6b(filenames 대조 드롭)의 라이브 정합(reviewer 🟡2). 1차 통주 실측(R2-T1):
 *         실 SDK Grep(content)은 `filenames:[]`·`numFiles:0`으로 반환(세션 트랜스크립트
 *         기계 증거) → S6b 대조가 유효 매치 전량을 드롭 → 카드 구조화 렌더 소멸.
 *         soft 실패 시 뷰어 열람 측정은 FileExplorer 노드 클릭 폴백으로 계속한다.
 *       - 대형 파일 뷰어 열람/diff 렌더 지연 측정(로그·annotation — 하드 단정 X.
 *         fs.diff는 LCS O(m·n) 동기 계산이라 6000² 셀에서 메인 프로세스 블록 가능 —
 *         지연치가 티켓 판단 데이터).
 *       - 스트리밍/렌더 프리즈 관찰: rAF 프레임 갭 프로브(>100ms 갭 수집) — 관찰 전용.
 *       - [V2-e 인접] 변경 파일 인디케이터(.agent-panel .files .file)가 워크스페이스
 *         상대 경로만 노출(절대/`..` 경로 0 하드 단정 — S5 컨테인먼트).
 *   L2) plan 모드 봉합 검증: 새 세션을 plan 모드로 시작 → ExitPlanMode 카드에서
 *       - [V2-c] planFilePath 표시가 basename만인지(구분자 0) + title(호버)이 전체 경로를
 *         보존하는지 하드 단정(S2). planFilePath 미제공 런이면 '미관측' annotation.
 *       - [V2-e] plan 파일 Write(SDK 임시 디렉토리 = 워크스페이스 밖)가 변경 파일
 *         인디케이터에 안 뜨는지(S5) — 카드 등장 시점 + 실행 완료 후 2회 하드 단정.
 *   L3) 인터럽트 봉합 + R1-T3 타이밍 프로브: 긴 턴 2연속 mid-turn 인터럽트로
 *       - [V2-a] 메인 콘솔 UnhandledPromiseRejection 0건 하드 단정(S1 — R1 실측은
 *         인터럽트당 2건 + teardown 경로. teardown 후에도 재단정).
 *       - [V2-b] 잘린 assistant msg에 '중단됨' muted pill(.msg-interrupted /
 *         [data-interrupted]) 표시 하드 단정(S3).
 *       - [V3/R1-T3] 인터럽트 클릭→pill 등장(t_pill = IPC accepted 반영)·클릭→done
 *         (t_done = 정지버튼 소멸) 시간 측정 + 잘린 버블 텍스트가 다음 턴 이후에도
 *         불변인지(버블 확정) 비교 — 판별 데이터는 annotation(하드 단정 X — 열린 티켓의
 *         증거 수집이 목적, 결함을 pass/fail로 오염하지 않는다).
 *       ⚠ 인터럽트 창 신호(1차 통주 교훈): 스레드 전체 텍스트 성장은 user 버블 자체
 *         성장에 조기 발화해 어시스턴트 첫 토큰 전에 인터럽트를 눌렀다(트랜스크립트 실증
 *         — user 메시지 +200ms 인터럽트, openMsgId null이라 S3 마킹이 정합적으로 no-op).
 *         → **AI 버블 텍스트 성장**(새 ai-msg 등장 + content ≥40자)으로 교체. hunt-r1의
 *         waitThreadGrowth에도 같은 잠복 flake가 있다(테스트 측 — 원장 보고).
 *   L4) goal 정지 어포던스: `/goal` 시작 → goal 배너(.loop-goal)에
 *       - [V2-d] `.loop-goal-stop` 정지 버튼 렌더 하드 단정(S4) + 클릭 → 배너 소멸·런
 *         정지 확인. `/goal x y` 형태는 공백 포함이라 슬래시 팔레트가 열리지 않는다
 *         (useSlashPalette.parseSlashQuery — 공백 있으면 null).
 *   L5) 장시간 다턴(선택 축): 같은 REPL 세션 11턴(코드워드 → 짧은 턴 9 → 회상) —
 *       컨텍스트 연속성(코드워드 회상 하드 단정), 스레드 오토스크롤(최종 핀 하드 단정),
 *       토큰 게이지(.ctx-strip)·JS 힙 추이 관찰(annotation).
 *
 *   [V4] outputTruncated 오표시(.bgt-trunc 이중 의미)는 이 스펙에 bg 시나리오가 없어
 *   dogfood-live/live2 재통주 스크린샷(02-bg-tail-live·10-bg-task-stopped)으로 관측한다 —
 *   미관측이면 원장에 '미관측' 명기(보류 확정 근거).
 *
 * 실 구독 인증으로 실 SDK를 호출하므로 **opt-in**(hunt-r1 선례):
 *   GAP1HUNT2=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/gap1-p15-hunt-r2.e2e.ts
 *
 * 결정론 주의: 회귀 게이트가 아니라 *헌팅 통주* — 실 모델 응답에 의존한다. 기본 스위트는
 * skip(env 게이트). 프롬프트는 도구·응답 토큰을 명시해 변동성을 줄인다.
 * ⚠️ AGENTDECK_E2E 미설정(설정 시 EchoBackend 모크 — 로컬 부트 헬퍼가 라이브 모드에서
 *   부모 셸 상속을 코드로 차단, isolatedBoot 계약 미러).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isolatedBoot } from './helpers/isolatedBoot'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1HUNT2 === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

// ── 셀렉터 상수(소스 실측 — hunt-r1/dogfood 관례 계승) ─────────────────────────
const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
/** 변경 파일 인디케이터(AgentPanel '변경된 파일' 행 — title=경로 전체). */
const CHANGED_FILE_ROW = '.agent-panel .files .file'

function log(...a: unknown[]): void {
  console.log('[P15R2]', ...a)
}

/** 워크스페이스 밖 경로 판정(절대 경로·드라이브·`..` 탈출) — S5 컨테인먼트 검증용. */
function isOutsideWorkspacePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\') || p.startsWith('..')
}

/** 메인 프로세스 stdout/stderr 탭 — UnhandledPromiseRejection 채증(hunt-r1 미러). */
function attachMainConsoleTap(app: ElectronApplication): { lines: string[]; rejections: string[] } {
  const lines: string[] = []
  const rejections: string[] = []
  const proc = app.process()
  const tap = (src: 'stdout' | 'stderr') => (chunk: Buffer | string): void => {
    for (const ln of chunk.toString().split(/\r?\n/)) {
      if (!ln.trim()) continue
      lines.push(`[main:${src}] ${ln}`)
      if (/UnhandledPromiseRejection|unhandledRejection|Unhandled promise rejection/i.test(ln)) {
        rejections.push(ln)
        log(`⚠ 메인 콘솔 unhandled rejection 관찰: ${ln}`)
      }
    }
  }
  proc.stdout?.on('data', tap('stdout'))
  proc.stderr?.on('data', tap('stderr'))
  return { lines, rejections }
}

/** 스레드 innerText 길이(안전) — 성장 측정용(hunt-r1 미러). */
async function textLen(page: Page, selector: string): Promise<number> {
  try {
    const loc = page.locator(selector)
    if ((await loc.count()) === 0) return 0
    return (await loc.first().innerText({ timeout: 2_000 })).length
  } catch {
    return -1
  }
}

/**
 * 어시스턴트 스트리밍 성장 대기 — 새 ai-msg 버블 등장 + content ≥minChars(mid-turn 확보).
 * 스레드 전체 텍스트 성장(hunt-r1 방식)은 user 버블 자체 성장에 조기 발화한다 — 1차 통주
 * 실측: 어시스턴트 첫 토큰 전(+200ms) 인터럽트가 눌려 openMsgId null → S3 마킹 no-op.
 * AI 버블 content 성장은 openMsgId가 설정된 상태(텍스트 스트리밍 중)를 구조적으로 보장.
 */
async function waitAiStreamGrowth(page: Page, prevAiCount: number, minChars: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = await page.locator(AI_MSG).count().catch(() => 0)
    if (count > prevAiCount) {
      const txt = await page
        .locator(`${AI_MSG} .content`)
        .last()
        .innerText({ timeout: 2_000 })
        .catch(() => '')
      if (txt.length >= minChars) return true
    }
    await page.waitForTimeout(300)
  }
  return false
}

/**
 * 스레드 reveal 수렴 대기(관찰용) — SmoothMarkdown 점진 reveal이 done 이후에도 텍스트를
 * 표출하므로 3회 연속(3×1.5s) 동일 스냅샷까지 기다린다(hunt-r1 R1-T2 교훈 미러).
 */
async function waitThreadRevealSettled(page: Page, maxMs: number): Promise<number> {
  const deadline = Date.now() + maxMs
  let prev = await textLen(page, `${CHAT} .thread`)
  let stable = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500)
    const cur = await textLen(page, `${CHAT} .thread`)
    if (cur === prev) {
      if (++stable >= 2) return cur
    } else {
      stable = 0
    }
    prev = cur
  }
  return prev
}

/** 컴포저 전송(단일챗). 공백 포함 텍스트는 슬래시 팔레트가 열리지 않는다(fill 사용). */
async function send(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT).locator(INPUT)
  await input.click()
  await input.fill(text)
  await input.press('Enter')
}

/** 컴포저 피커(모델/모드) 선택(dogfood 미러). */
async function pick(page: Page, ariaLabel: string, optionText: string): Promise<void> {
  await page.getByLabel(ariaLabel).click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.locator('.pick-menu .pick-opt', { hasText: optionText }).first().click()
  await expect(page.locator('.pick-menu')).toHaveCount(0)
}

/** REPL 지속세션 ON 보장(기본 true — OFF 관찰 시 로그 후 토글, hunt-r1 미러). */
async function ensureRepl(page: Page): Promise<void> {
  const replToggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  const pressed = await replToggle.getAttribute('aria-pressed').catch(() => null)
  log(`REPL aria-pressed=${pressed}`)
  if (pressed !== 'true') {
    await replToggle.click().catch(() => {})
    log('REPL OFF였음 → ON 토글(기본값 회귀 관찰 — 기본은 true여야 함)')
  }
}

/** rAF 프레임 갭 프로브 설치 — 100ms 초과 갭만 수집(관찰 전용, 프리즈 판별 데이터). */
async function installFrameGapProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __p15Gaps?: { t: number; gap: number }[]; __p15Raf?: number }
    w.__p15Gaps = []
    let last = performance.now()
    const loop = (t: number): void => {
      const gap = t - last
      if (gap > 100) w.__p15Gaps!.push({ t: Math.round(t), gap: Math.round(gap) })
      last = t
      w.__p15Raf = requestAnimationFrame(loop)
    }
    w.__p15Raf = requestAnimationFrame(loop)
  })
}

/** 프레임 갭 프로브 수거 — {count, max} 반환 + 상세 로그. */
async function collectFrameGaps(page: Page, label: string): Promise<{ count: number; max: number }> {
  const gaps = await page
    .evaluate(() => {
      const w = window as unknown as { __p15Gaps?: { t: number; gap: number }[]; __p15Raf?: number }
      if (w.__p15Raf) cancelAnimationFrame(w.__p15Raf)
      return w.__p15Gaps ?? []
    })
    .catch(() => [] as { t: number; gap: number }[])
  const max = gaps.reduce((m, g) => Math.max(m, g.gap), 0)
  log(`${label} 프레임 갭(>100ms) ${gaps.length}건, 최대 ${max}ms`)
  for (const g of gaps.filter((x) => x.gap > 500)) log(`  ⚠ 렌더러 프리즈 의심 갭: ${g.gap}ms @${g.t}`)
  return { count: gaps.length, max }
}

/** 마지막 assistant 응답 내용 locator. */
function lastAi(page: Page): ReturnType<Page['locator']> {
  return page.locator(`${AI_MSG} .content`).last()
}

/**
 * 픽스처 워크스페이스 선주입 부트(dogfood 패턴 + isolatedBoot의 AGENTDECK_E2E 차단 계약).
 * isolatedBoot는 워크스페이스 tmp를 내부 생성해 파일 선주입이 불가능하므로(FileExplorer
 * 트리는 오픈 시점 스냅샷 — 이후 테스트가 만든 파일은 안 보임) L1/L2는 이 로컬 부트를 쓴다.
 */
async function bootWithFixture(
  slug: string,
  prep: (ws: string) => void
): Promise<{ app: ElectronApplication; page: Page; workspace: string; teardown: () => Promise<void> }> {
  const workspace = mkdtempSync(join(tmpdir(), `${slug}-ws-`))
  prep(workspace)
  const userDataDir = mkdtempSync(join(tmpdir(), `${slug}-udd-`))

  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_WORKSPACE: workspace,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
  }
  delete childEnv.AGENTDECK_E2E // 라이브 필수 — 부모 셸 상속 차단(isolatedBoot 계약 미러)

  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: childEnv as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await passBootGates(page, { nickname: 'p15r2' })
  await openWorkspace(page, { waitForTree: true })
  await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

  let torn = false
  const teardown = async (): Promise<void> => {
    if (torn) return
    torn = true
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  }
  return { app, page, workspace, teardown }
}

// ── L1 대형 파일 픽스처 ─────────────────────────────────────────────────────────
// 6,000줄 · ~440KB. NEEDLE_ALPHA 3개(1500/3000/4500행 — Grep content 매치 고정),
// hotspot()는 5990행 부근 "return 41" 유일 1개(Edit old_string 유일성 보장).
const BIG_FILE = 'big-data.ts'
const BIG_LINES = 6_000

function buildBigFile(): string {
  const lines: string[] = []
  lines.push('// big-data.ts — P15 R2 대형 파일 픽스처(생성물, 사람이 편집하지 않음)')
  while (lines.length < BIG_LINES) {
    const n = lines.length + 1
    if (n === 1500 || n === 3000 || n === 4500) {
      lines.push(`export const MARK_${n} = 'NEEDLE_ALPHA' // marker line ${n}`)
    } else if (n === 5990) {
      lines.push('export function hotspot(): number { return 41 } // HOTSPOT')
    } else {
      lines.push(`export const v${n} = ${n} // filler ${n} 0123456789abcdefghijklmnopqrstuvwxyz`)
    }
  }
  return lines.join('\n') + '\n'
}

/** 워크스페이스를 git 저장소로 만들어 HEAD 스냅샷 확보 — fs.diff는 git HEAD 기준이라
 *  (resolveFsDiffLines) 비-git이면 전부-add 폴백이 되어 "수정 diff" 축이 죽는다. */
function gitCommitAll(ws: string): void {
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: ws, stdio: 'ignore' })
  }
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.email=p15r2@test.local', '-c', 'user.name=p15r2', 'commit', '-q', '-m', 'fixture')
}

test.describe('GAP1 P15 R2-L1: 대형 파일 종주 — 검색 카드(V1)·뷰어·부분수정·diff·프리즈 관찰 (opt-in: GAP1HUNT2=1)', () => {
  test.skip(!RUN, 'P15 라운드 2 라이브 헌팅 — GAP1HUNT2=1로 명시 실행')

  test('6000줄 git 파일: Grep 카드 렌더 → 뷰어 열람 → Edit → diff 렌더 + 지연/컨테인먼트', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await bootWithFixture('p15r2-l1', (ws) => {
      writeFileSync(join(ws, BIG_FILE), buildBigFile())
      writeFileSync(join(ws, 'README.md'), '# P15 R2 대형 파일 워크스페이스\n')
      gitCommitAll(ws)
    })
    const tapped = attachMainConsoleTap(app)
    try {
      await ensureRepl(page)
      await installFrameGapProbe(page)

      // ── 턴 A: Grep(content) — V1 검색 카드 라이브 렌더 하드 단정 ────────────────
      await send(
        page,
        `Call the Grep tool exactly once with pattern "NEEDLE_ALPHA" and output_mode "content" over this ` +
          `workspace, then reply exactly SEARCH_DONE and end your turn. Do not use any other tools and do not read any files.`
      )
      await settleTurn(page, { timeoutMs: 240_000, autoApprove: 'allow' })
      await expect(lastAi(page)).toContainText('SEARCH_DONE')

      // V1: 검색 도구 카드 자체는 tool_call 렌더라 존재해야 한다(없으면 별개 결함).
      const searchCard = page.locator('.t-item.t-search')
      expect(
        await searchCard.count(),
        '검색 도구 카드 자체 미렌더(tool_call 렌더 결함 의심 — V1과 별개)'
      ).toBeGreaterThan(0)
      await searchCard.locator('.t-row').last().click()
      // V1 구조화 렌더([data-search-file/match]) — soft 단정: 실패해도 종주 계속(헌팅
      // 스펙의 목적은 결함 확인 + 나머지 축 데이터 수집. R2-T1 기계 증거 = 세션
      // 트랜스크립트 toolUseResult{mode:'content', filenames:[], numFiles:0} → S6b 전량 드롭).
      const structured = await page
        .locator('[data-search-file]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
      const matchCount = structured ? await page.locator('[data-search-match]').count() : 0
      log(`검색 카드 구조화 렌더=${structured}, 매치 ${matchCount}건(기대 3 — NEEDLE_ALPHA 1500/3000/4500행)`)
      expect
        .soft(structured, 'V1 결함 — 실 SDK Grep(content) 검색 카드 구조화 렌더 실패(S6b filenames 대조 오드롭, R2-T1)')
        .toBe(true)
      test.info().annotations.push({
        type: 'V1',
        description: structured
          ? `P08 검색 카드 라이브 렌더 OK — 매치 ${matchCount}건(기대 3)`
          : 'P08 검색 카드 구조화 렌더 실패 — S6b가 filenames:[] 실 출력에서 매치 전량 드롭(R2-T1)',
      })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-01-large-search-card.png') })

      // 대형 파일 뷰어 열람 지연 측정(관찰) — 구조화 렌더 시 매치 클릭 경로,
      // 실패 시 FileExplorer 노드 클릭 폴백(변경 전이라 diff 아닌 코드 뷰어).
      const tOpen = Date.now()
      if (structured) {
        await page.locator('[data-search-match]').first().click()
      } else {
        await page.locator('.fe-node.fe-file', { hasText: BIG_FILE }).first().click()
      }
      await page.waitForSelector('.fv-overlay .diff-head', { timeout: 20_000 })
      await page.waitForSelector('.fv-overlay .cm-editor', { timeout: 20_000 })
      const openMs = Date.now() - tOpen
      log(`대형 파일 뷰어 열람 ${openMs}ms (440KB/6000줄, 경로=${structured ? '검색 매치 클릭' : '탐색기 폴백'})`)
      test.info().annotations.push({ type: 'perf', description: `대형 파일 뷰어(CodeMirror) 열람 ${openMs}ms` })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-02-large-viewer-open.png') })
      await page.keyboard.press('Escape')
      await expect(page.locator('.fv-overlay')).toHaveCount(0)

      // ── 턴 B: 부분 읽기(offset/limit) — 대형 파일 Read 경로 ────────────────────
      await send(
        page,
        `Use the Read tool exactly once on ${BIG_FILE} with offset 5980 and limit 30, then reply with exactly ` +
          `the number returned by the hotspot function and end your turn. Do not use any other tools.`
      )
      await settleTurn(page, { timeoutMs: 240_000, autoApprove: 'allow' })
      await expect(lastAi(page), '부분 Read 실패 — hotspot 반환값(41) 회수 불가').toContainText('41')

      // ── 턴 C: 부분 수정(Edit) — 6000줄 파일의 1줄 교체 ─────────────────────────
      await send(
        page,
        `Use the Edit tool exactly once on ${BIG_FILE}: replace the exact string "return 41" with "return 42". ` +
          `If the Edit tool requires reading the file first, first call the Read tool exactly once on ${BIG_FILE} ` +
          `with offset 5980 and limit 30. Then reply exactly EDIT_DONE and end your turn.`
      )
      await settleTurn(page, { timeoutMs: 240_000, autoApprove: 'allow' })
      await expect(lastAi(page)).toContainText('EDIT_DONE')
      const onDisk = readFileSync(join(workspace, BIG_FILE), 'utf8')
      expect(onDisk.includes('return 42'), '디스크 미반영 — Edit 실패').toBe(true)

      // 변경 파일 인디케이터: 대형 파일이 상대 경로로 노출 + 전 항목 컨테인먼트(S5 인접)
      const rows = page.locator(CHANGED_FILE_ROW)
      await expect(rows.first(), '변경 파일 인디케이터 미등장(file_changed 유실 의심)').toBeVisible({
        timeout: 15_000,
      })
      const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''))
      log(`변경 파일 인디케이터: ${JSON.stringify(titles)}`)
      expect(titles.some((t) => t.includes(BIG_FILE)), '대형 파일이 변경 인디케이터에 없음').toBe(true)
      for (const t of titles) {
        // soft — 컨테인먼트 위반은 결함 기록 후 diff 측정 계속(헌팅 데이터 보존)
        expect.soft(isOutsideWorkspacePath(t), `워크스페이스 밖 경로 노출(S5 컨테인먼트 위반): ${t}`).toBe(false)
      }

      // ── diff 렌더: FileExplorer 변경 노드 클릭 → DiffViewer(6000² LCS) 지연 측정 ──
      const feNode = page.locator('.fe-node.fe-file', { hasText: BIG_FILE }).first()
      await expect(feNode, 'FileExplorer에 대형 파일 노드 없음').toBeVisible({ timeout: 10_000 })
      const badge = await feNode.locator('.exp-chg').innerText().catch(() => '(없음)')
      log(`FileExplorer 변경 배지: "${badge}" (기대 M)`)
      const tDiff = Date.now()
      await feNode.click()
      await page.waitForSelector('.fv-overlay', { timeout: 15_000 })
      // LCS O(m·n) 동기 계산(메인 프로세스 블록 가능) — 90s 상한, 소요치가 티켓 데이터.
      await page.waitForSelector('.fv-overlay .diff-viewer', { timeout: 90_000 })
      const diffMs = Date.now() - tDiff
      log(`대형 파일 diff 렌더 ${diffMs}ms (git HEAD 기준 6000줄 LCS + 전체 라인 DOM)`)
      test.info().annotations.push({ type: 'perf', description: `대형 파일 diff 렌더 ${diffMs}ms` })
      expect(
        await page.locator('.fv-overlay .diff-viewer--empty').count(),
        'diff가 "변경 없음"으로 렌더(git HEAD 기준선 미탐지 의심)'
      ).toBe(0)
      await expect(
        page.locator('.fv-overlay .diff-line.diff-add .diff-content', { hasText: 'return 42' }).first(),
        'diff에 수정 라인(+return 42) 부재'
      ).toBeVisible({ timeout: 10_000 })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-03-large-diff.png') })
      await page.keyboard.press('Escape')
      await expect(page.locator('.fv-overlay')).toHaveCount(0)

      // ── 프리즈 관찰 수거 + 메인 콘솔 관찰 ───────────────────────────────────────
      const gaps = await collectFrameGaps(page, 'L1')
      test.info().annotations.push({
        type: 'perf',
        description: `L1 프레임 갭(>100ms) ${gaps.count}건, 최대 ${gaps.max}ms${gaps.max > 1_000 ? ' — 프리즈 의심(티켓 후보)' : ''}`,
      })
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, unhandled rejection ${tapped.rejections.length}건`)
      test.info().annotations.push({
        type: 'main-console',
        description: `unhandled rejection ${tapped.rejections.length}건 / 전체 ${tapped.lines.length}줄`,
      })
    } finally {
      await teardown()
    }
  })
})

test.describe('GAP1 P15 R2-L2: plan 모드 봉합 검증 — planFilePath basename(V2-c)·plan Write 컨테인먼트(V2-e) (opt-in: GAP1HUNT2=1)', () => {
  test.skip(!RUN, 'P15 라운드 2 라이브 헌팅 — GAP1HUNT2=1로 명시 실행')

  test('plan 카드 경로 표시 basename + 워크스페이스 밖 plan 파일 인디케이터 무노출', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const SNIPPET = `export function greet(name: string): string {\n  return \`Hello, \${name}\`\n}\n`
    const { page, workspace, teardown } = await bootWithFixture('p15r2-l2', (ws) => {
      writeFileSync(join(ws, 'snippet.ts'), SNIPPET)
    })
    try {
      // plan 모드는 세션 시작 전에 설정해야 성립(dogfood-live2 실측 — 진행 중 세션 모드
      // 변경은 P13 라이브 전환 경로로 별도 검증됨. 여기선 새 세션 첫 턴 = plan).
      await pick(page, '모드 선택', '플랜')
      await send(
        page,
        'Plan the following change: add a function `farewell(name: string): string` that returns ' +
          '`Bye, ${name}` to snippet.ts. Keep the plan short (under 6 lines), then exit plan mode ' +
          'to request approval.'
      )

      const planCard = page.locator(`${PERM_CARD}[data-plan-mode]`)
      await planCard.waitFor({ state: 'visible', timeout: 300_000 })

      // [V2-e ①] plan 파일 Write(SDK 임시 디렉토리 = 워크스페이스 밖)가 인디케이터에 안 뜸.
      // S5 봉합 후 이 시점 변경 파일은 0이어야 정상(planning 턴은 워크스페이스를 안 건드림).
      const rowsAtPlan = await page
        .locator(CHANGED_FILE_ROW)
        .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''))
      log(`plan 카드 시점 변경 파일 인디케이터: ${JSON.stringify(rowsAtPlan)}`)
      for (const t of rowsAtPlan) {
        expect(isOutsideWorkspacePath(t), `V2-e 위반 — plan 단계에서 밖 경로 노출: ${t}`).toBe(false)
      }
      test.info().annotations.push({
        type: 'V2-e',
        description: `plan 카드 시점 인디케이터 ${rowsAtPlan.length}건(밖 경로 0) — ${JSON.stringify(rowsAtPlan)}`,
      })

      // [V2-c] planFilePath 표시 = basename만(구분자 0) + title(호버) = 전체 경로 보존.
      const toggle = planCard.locator('[data-plan-toggle]')
      if (await toggle.count()) await toggle.click()
      await page.waitForTimeout(300)
      const pathEl = planCard.locator('.perm-card-plan-path')
      if ((await pathEl.count()) === 0) {
        test.info().annotations.push({
          type: 'V2-c',
          description: 'planFilePath 미제공 런 — basename 표시 검증 관측 불가(이번 런 한정)',
        })
        log('V2-c: 이 런에서는 planFilePath가 payload에 없음 — 관측 불가 기록')
      } else {
        const shown = (await pathEl.innerText()).trim()
        const full = (await pathEl.getAttribute('title')) ?? ''
        log(`plan 경로 표시="${shown}" title="${full}"`)
        expect(shown, `V2-c 위반 — 표시가 basename이 아님: "${shown}"`).not.toMatch(/[\\/]/)
        if (/[\\/]/.test(full)) {
          const base = full.split(/[\\/]/).filter(Boolean).pop() ?? full
          expect(base, 'V2-c — title 전체 경로의 basename과 표시 불일치').toBe(shown)
        }
        test.info().annotations.push({
          type: 'V2-c',
          description: `plan 경로 basename 표시 OK — "${shown}" (title="${full.slice(0, 120)}")`,
        })
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-04-plan-card-basename.png') })

      // 실행 승인 → (plan 고정 모드) 후속 권한 카드 자동 허용 → 완주(dogfood-live2 미러)
      expect(await planCard.locator('[data-perm-choice="allow_always"]').count()).toBe(0)
      await planCard.locator('[data-perm-choice="allow"]').click()
      const deadline = Date.now() + 300_000
      while (Date.now() < deadline) {
        const nonPlanCard = page.locator(`${PERM_CARD}:not([data-plan-mode])`)
        if (await nonPlanCard.isVisible().catch(() => false)) {
          await nonPlanCard.locator('[data-perm-choice="allow"]').click().catch(() => {})
          await page.waitForTimeout(800)
          continue
        }
        const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(1_000)
      }
      await settleTurn(page, { timeoutMs: 60_000, autoApprove: 'allow' })

      const edited = readFileSync(join(workspace, 'snippet.ts'), 'utf8')
      expect(edited.includes('farewell'), 'plan 승인 실행 미반영 — snippet.ts에 farewell 없음').toBe(true)

      // [V2-e ②] 실행 완료 후에도 인디케이터는 워크스페이스 상대 경로만.
      const rowsAfter = await page
        .locator(CHANGED_FILE_ROW)
        .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''))
      log(`실행 완료 후 변경 파일 인디케이터: ${JSON.stringify(rowsAfter)}`)
      for (const t of rowsAfter) {
        expect(isOutsideWorkspacePath(t), `V2-e 위반 — 실행 후 밖 경로 노출: ${t}`).toBe(false)
      }
      expect(rowsAfter.some((t) => t.includes('snippet.ts')), '실행 후 snippet.ts 인디케이터 부재').toBe(true)
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-05-plan-executed-containment.png') })
    } finally {
      await teardown()
    }
  })
})

test.describe('GAP1 P15 R2-L3: 인터럽트 봉합 검증(V2-a·b) + R1-T3 타이밍 프로브(V3) (opt-in: GAP1HUNT2=1)', () => {
  test.skip(!RUN, 'P15 라운드 2 라이브 헌팅 — GAP1HUNT2=1로 명시 실행')

  test('긴 턴 2연속 인터럽트: rejection 0 + 중단됨 pill + t_pill/t_done + 버블 확정 관찰', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, teardown } = await isolatedBoot({ slug: 'p15r2-l3' })
    const tapped = attachMainConsoleTap(app)
    try {
      await ensureRepl(page)
      const input = page.locator(CHAT).locator(INPUT)

      const turns = [
        { prompt: '1부터 300까지 숫자만 줄바꿈으로 세줘. 도구는 쓰지 마.', tag: 'int1' },
        { prompt: '500부터 800까지 숫자만 줄바꿈으로 세줘. 도구는 쓰지 마.', tag: 'int2' },
      ]
      const bubbleTexts: string[] = []
      for (const [i, t] of turns.entries()) {
        const aiBefore = await page.locator(AI_MSG).count()
        await input.click()
        await input.fill(t.prompt)
        await input.press('Enter')
        await expect(page.locator(STOP), `#${i + 1} 턴 시작(정지버튼)`).toBeVisible({ timeout: 30_000 })
        // AI 버블 content ≥40자 = 어시스턴트 텍스트 스트리밍 중(openMsgId 설정) 보장 —
        // 스레드 전체 길이 신호는 user 버블에 조기 발화(1차 통주 실측, 파일 헤더 참조).
        const grew = await waitAiStreamGrowth(page, aiBefore, 40, 60_000)
        expect(grew, `#${i + 1} 인터럽트 창 확보 실패(어시스턴트 스트리밍 미관찰)`).toBe(true)
        await page.waitForTimeout(1_000)

        // ★ 인터럽트 — t_pill(accepted 반영 = renderer 로컬 마킹, S3)·t_done(done 도달) 측정
        const t0 = Date.now()
        await page.locator(STOP).first().click()
        // [V2-b] '중단됨' muted pill — i+1번째 pill 등장까지
        await expect(
          page.locator(`${CHAT} .thread [data-interrupted]`),
          `#${i + 1} V2-b 위반 — 잘린 msg에 '중단됨' pill(.msg-interrupted) 미표시`
        ).toHaveCount(i + 1, { timeout: 20_000 })
        const tPill = Date.now() - t0
        await expect(
          page.locator(STOP),
          `#${i + 1} 인터럽트 후 45s 내 done 미도달(정지버튼 잔존 — R1-T3 done 유실 축)`
        ).toBeHidden({ timeout: 45_000 })
        const tDone = Date.now() - t0
        log(`#${i + 1} [V3] t_pill=${tPill}ms t_done=${tDone}ms`)
        test.info().annotations.push({
          type: 'V3-timing',
          description: `인터럽트 #${i + 1}: 클릭→pill ${tPill}ms · 클릭→done ${tDone}ms`,
        })

        // reveal 수렴 후 잘린 버블 텍스트 고정(다음 턴 이후 불변 비교용 — R1-T3 확정성 데이터)
        await waitThreadRevealSettled(page, 30_000)
        const bubble = page
          .locator(`${CHAT} .thread .msg.ai-msg`)
          .filter({ has: page.locator('[data-interrupted]') })
          .nth(i)
        bubbleTexts.push((await bubble.locator('.content').innerText().catch(() => '')) ?? '')
        if (i === 0) await page.screenshot({ path: join(SHOT_DIR, 'p15r2-06-interrupt-pill.png') })
      }

      // [V2-a] 인터럽트 2회 수행 후 메인 콘솔 unhandled rejection 0건(S1 봉합 라이브 확증)
      expect(
        tapped.rejections.length,
        `V2-a 위반 — 인터럽트 후 unhandled rejection ${tapped.rejections.length}건: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)

      // 다음 턴 정상 + 잘린 버블 확정성 비교(V3 — 관찰: 하드 단정 대신 annotation)
      await input.click()
      await input.fill('Reply exactly NEXT_OK and nothing else. Do not use any tools.')
      await input.press('Enter')
      await expect(page.locator(STOP)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator(STOP), '다음 턴 완주 실패').toBeHidden({ timeout: 120_000 })
      await waitThreadRevealSettled(page, 20_000)
      await expect(lastAi(page)).toContainText('NEXT_OK')
      for (const [i] of turns.entries()) {
        const bubble = page
          .locator(`${CHAT} .thread .msg.ai-msg`)
          .filter({ has: page.locator('[data-interrupted]') })
          .nth(i)
        const now = (await bubble.locator('.content').innerText().catch(() => '')) ?? ''
        const same = now === bubbleTexts[i]
        log(`#${i + 1} 잘린 버블 확정성: ${same ? '불변(확정됨)' : `변동 감지 — ${bubbleTexts[i].length}→${now.length}자`}`)
        test.info().annotations.push({
          type: 'V3-finality',
          description: `인터럽트 버블 #${i + 1} 다음 턴 후 ${same ? '불변(확정)' : `변동(${bubbleTexts[i].length}→${now.length}자) — R1-T3 증거`}`,
        })
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-07-next-turn-after-interrupts.png') })

      // teardown 경로의 rejection도 검증(V2-a — R1 실측엔 teardown 경로 유출이 있었다)
      await teardown()
      await new Promise((r) => setTimeout(r, 800))
      expect(
        tapped.rejections.length,
        `V2-a 위반 — teardown 경로 unhandled rejection: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, rejection 0건(teardown 포함)`)
    } finally {
      await teardown()
    }
  })
})

test.describe('GAP1 P15 R2-L4: goal 정지 어포던스(V2-d) — .loop-goal-stop 라이브 (opt-in: GAP1HUNT2=1)', () => {
  test.skip(!RUN, 'P15 라운드 2 라이브 헌팅 — GAP1HUNT2=1로 명시 실행')

  test('/goal 시작 → goal 배너 정지 버튼 렌더 → 클릭 → 배너·런 정지', async () => {
    test.setTimeout(300_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { page, teardown } = await isolatedBoot({ slug: 'p15r2-l4' })
    try {
      // '/goal <텍스트 공백 포함>'은 슬래시 팔레트가 안 열린다(parseSlashQuery 공백 시 null)
      // — fill 후 Enter가 그대로 전송 경로를 탄다.
      await send(page, '/goal hello.txt 파일을 만들어 "안녕하세요" 한 줄을 적고 완료를 보고해줘')

      const goalBanner = page.locator('.loop-indicator.loop-goal')
      await expect(goalBanner, 'goal 배너 미등장(begin 낙관 점등 경로)').toBeVisible({ timeout: 60_000 })

      // [V2-d] 정지 버튼(.loop-goal-stop) — S4 봉합 라이브 확증
      const stopBtn = goalBanner.locator('.loop-goal-stop')
      await expect(stopBtn, 'V2-d 위반 — goal 배너에 정지 버튼(.loop-goal-stop) 부재').toBeVisible({
        timeout: 10_000,
      })
      const topic = await goalBanner.locator('.loop-topic').innerText().catch(() => '(없음)')
      log(`goal 배너 주제행: "${topic.trim().slice(0, 80)}"`)
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-08-goal-stop-banner.png') })

      await stopBtn.click()
      await expect(goalBanner, 'goal 배너가 정지 클릭 후에도 잔존').toBeHidden({ timeout: 15_000 })
      await expect(page.locator(STOP), '정지 클릭 후 런 미정지(정지버튼 잔존)').toBeHidden({ timeout: 30_000 })
      const stoppedShown = await page.locator('.loop-indicator.loop-stopped').isVisible().catch(() => false)
      test.info().annotations.push({
        type: 'V2-d',
        description: `goal 정지 버튼 동작 OK — 클릭 후 배너 소멸·런 정지, stopped 확인 배너 ${stoppedShown ? '표시' : '미표시(관찰)'}`,
      })
    } finally {
      await teardown()
    }
  })
})

test.describe('GAP1 P15 R2-L5: 장시간 다턴 — 11턴 연속·컨텍스트 연속성·게이지/힙/스크롤 관찰 (opt-in: GAP1HUNT2=1)', () => {
  test.skip(!RUN, 'P15 라운드 2 라이브 헌팅 — GAP1HUNT2=1로 명시 실행')

  test('코드워드 → 짧은 턴 9 → 회상: 전 턴 완주 + 회상 + 오토스크롤 핀 + 게이지 추이', async () => {
    test.setTimeout(600_000)

    const { page, teardown } = await isolatedBoot({ slug: 'p15r2-l5' })
    try {
      await ensureRepl(page)
      const heap = (): Promise<number> =>
        page.evaluate(() => {
          const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          return m ? m.usedJSHeapSize : -1
        })
      const ctxChips = (): Promise<string> =>
        page
          .locator('.ctx-strip')
          .innerText()
          .then((s) => s.replace(/\s+/g, ' ').trim())
          .catch(() => '(없음)')

      const runShortTurn = async (prompt: string, expectToken: string | RegExp, label: string): Promise<number> => {
        const t0 = Date.now()
        await send(page, prompt)
        await expect(page.locator(STOP), `${label} 턴 시작`).toBeVisible({ timeout: 30_000 })
        await expect(page.locator(STOP), `${label} 120s 내 완주 실패`).toBeHidden({ timeout: 120_000 })
        await page.waitForTimeout(1_200)
        await expect(lastAi(page), `${label} 응답 토큰 불일치`).toContainText(expectToken)
        return Date.now() - t0
      }

      const heap0 = await heap()
      const series: string[] = []

      let ms = await runShortTurn(
        'Remember this codeword: ZEBRA-42. Reply exactly SAVED and nothing else. Do not use any tools.',
        'SAVED',
        '턴1(코드워드)'
      )
      series.push(`턴1 ${ms}ms ctx[${await ctxChips()}] heap=${await heap()}`)

      for (let i = 2; i <= 10; i++) {
        ms = await runShortTurn(
          `Reply exactly TURN_${i} and nothing else. Do not use any tools.`,
          `TURN_${i}`,
          `턴${i}`
        )
        // 오토스크롤 핀 관찰(하드 단정은 최종 턴에서만 — 중간은 로그)
        const pin = await page
          .locator('.chat-scroll')
          .evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))
          .catch(() => -1)
        series.push(`턴${i} ${ms}ms ctx[${await ctxChips()}] heap=${await heap()} pin=${pin}px`)
      }

      ms = await runShortTurn(
        'What was the codeword I gave you at the start of this conversation? Reply with the codeword only. Do not use any tools.',
        /ZEBRA-42/,
        '턴11(회상)'
      )
      series.push(`턴11 ${ms}ms ctx[${await ctxChips()}] heap=${await heap()}`)
      for (const s of series) log(s)

      // 최종 오토스크롤 핀 하드 단정 — 사용자 수동 스크롤 0이었으므로 bottom 추종이 정상
      const finalPin = await page
        .locator('.chat-scroll')
        .evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))
      expect(finalPin, `오토스크롤 핀 이탈 — bottom과 ${finalPin}px 괴리`).toBeLessThanOrEqual(200)

      const heapEnd = await heap()
      const growMb = heap0 > 0 && heapEnd > 0 ? Math.round((heapEnd - heap0) / 1048576) : -1
      test.info().annotations.push({
        type: 'L5-observed',
        description: `11턴 완주 · 회상 OK · 최종 핀 ${finalPin}px · JS 힙 ${growMb}MB 증가(${heap0}→${heapEnd})`,
      })
      test.info().annotations.push({ type: 'L5-series', description: series.join(' | ') })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r2-09-multiturn-final.png') })
    } finally {
      await teardown()
    }
  })
})
