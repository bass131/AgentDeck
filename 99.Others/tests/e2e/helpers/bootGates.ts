/**
 * bootGates.ts — 실 Electron 부팅 관문 공용 헬퍼(live e2e 전용).
 *
 * 배경: `live-test-project.e2e.ts`(라이브 재실행 통과 검증됨)가 실측한 부팅 순서를
 *   여기 하나로 단일화한다. `orchestration-live.e2e.ts`는 일부 관문(시작 모달·엔진
 *   업데이트 알림 dismiss)을 생략해 "폴더 선택" 클릭이 가려진 모달에 막혀 불발되고,
 *   composer가 workspace 미설정 상태로 disabled로 남는 회귀를 냈다(2026-07 라이브
 *   e2e 일괄 실측). 재발 방지를 위해 관문 시퀀스를 이 파일로 단일화한다
 *   (permSelectors.ts 선례와 동일한 목적 — 산재된 관문 로직의 SoT 통합).
 *
 * 관문 순서(반드시 이 순서 — 하나라도 생략하면 이후 관문이 가려져 불발될 수 있음):
 *   ① 로그인(닉네임 온보딩) — `.login-body input#nickname` + `.login-body button.submit`
 *   ② eg-auth-dialog skip — `.eg-auth-dialog .sd-go`(authed 환경이면 미표시 — 정상)
 *   ③ `.titlebar` 대기 — Shell 렌더 확인
 *   ④ 시작 모달(WhatsNew/UpdateNotes) dismiss — `.wn-overlay`/`.un-overlay`, Esc(+CTA 버튼)
 *   ⑤ 엔진 업데이트 알림 dismiss — 반드시 "나중에"(`.sd-cancel`). `sd-go`는 실 npm 설치를
 *      트리거하므로 절대 클릭 금지.
 *   ⑥(별도 `openWorkspace`) 워크스페이스 오픈 — "폴더 선택" 클릭
 *      (`AGENTDECK_E2E_WORKSPACE` env가 네이티브 다이얼로그를 우회) + 트리 로드 확인.
 *      주의: 이 전역 "폴더 선택" 버튼은 `single` 워크스페이스 모드(FileExplorer)에만
 *      존재한다 — `multi` 모드에서는 FileExplorer 자체가 언마운트되어 없다(패널별
 *      cwd는 `dialog.pickFolder`/`AGENTDECK_E2E_PICK_FOLDER`라는 별개 메커니즘).
 */
import type { Page } from '@playwright/test'
import { PERM_CARD, permChoiceSelector, type PermChoice } from './permSelectors'

export interface BootGateOptions {
  /** 온보딩에 입력할 닉네임(기본: 'e2e테스트'). */
  nickname?: string
  /** eg-auth-dialog skip 버튼 대기 타임아웃(ms). */
  egAuthTimeoutMs?: number
  /** `.titlebar` 렌더 대기 타임아웃(ms). */
  titlebarTimeoutMs?: number
  /** 시작 모달(WhatsNew/UpdateNotes) 대기 타임아웃(ms). */
  startupModalTimeoutMs?: number
  /** 엔진 업데이트 알림 대기 타임아웃(ms). */
  engineNoticeTimeoutMs?: number
}

/** WhatsNew/UpdateNotes 시작 모달이 떠 있으면 Esc(+CTA)로 닫는다. */
export async function dismissStartupModal(page: Page, timeoutMs = 8000): Promise<void> {
  const modal = page.locator('.wn-overlay, .un-overlay')
  try {
    await modal.first().waitFor({ state: 'visible', timeout: timeoutMs })
  } catch { return /* 안 뜸 */ }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
    if (!(await modal.first().isVisible().catch(() => false))) return
    // Esc 미동작 시 스킵/CTA 버튼
    const btn = page.locator('.wn-nav-cta, .un-cta').first()
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
    await page.waitForTimeout(400)
  }
}

/** EngineUpdateNotice가 떠 있으면 "나중에"로 닫는다(업데이트 시작 금지). */
export async function dismissEngineNotice(page: Page, timeoutMs = 4000): Promise<void> {
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: timeoutMs })
    await later.click()
    await page.waitForTimeout(400)
  } catch { /* 미표시 */ }
}

/**
 * 관문 ①~⑤를 순서대로 통과한다(로그인 → eg-auth skip → titlebar → 시작모달 →
 * 엔진알림). 워크스페이스 오픈(⑥)은 테스트마다 트리 로드 확인 방식이 갈릴 수 있어
 * `openWorkspace`로 분리했다.
 */
export async function passBootGates(page: Page, opts: BootGateOptions = {}): Promise<void> {
  const {
    nickname = 'e2e테스트',
    egAuthTimeoutMs = 4000,
    titlebarTimeoutMs = 15_000,
    startupModalTimeoutMs = 10_000,
    engineNoticeTimeoutMs = 12_000,
  } = opts

  // ① 진입 대문(닉네임 온보딩) 통과
  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill(nickname)
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  // ② eg-auth-dialog skip
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: egAuthTimeoutMs })
    await egSkip.click()
  } catch { /* authed */ }
  // ③ Shell 렌더 확인
  await page.waitForSelector('.titlebar', { timeout: titlebarTimeoutMs })
  // ④ 시작 모달(WhatsNew 첫실행 / UpdateNotes 버전업) — 비동기 등장, Esc로 닫는다(둘 다 지원).
  await dismissStartupModal(page, startupModalTimeoutMs)
  // ⑤ 엔진 업데이트 알림(비동기 등장) — 반드시 "나중에"(sd-cancel)로 닫는다.
  // sd-go("업데이트")를 누르면 실 npm 설치가 시작되므로 금지.
  await dismissEngineNotice(page, engineNoticeTimeoutMs)
}

export interface OpenWorkspaceOptions {
  /**
   * 트리 로드 확인(`.fe-node-name` 대기) 여부 — 기본 true.
   * 워크스페이스가 빈 스크래치 디렉터리(파일 0개)인 테스트에서는 `.fe-node-name`이
   * 영영 나타나지 않으므로 false로 꺼야 한다(트리가 "비어 있음" 상태로 정상 렌더돼도
   * 매칭할 노드가 없음 — 이 경우 composer enabled 여부로 오픈 완료를 판정할 것).
   */
  waitForTree?: boolean
  treeTimeoutMs?: number
}

/**
 * 워크스페이스 오픈(⑥) — `single` 모드 전역 "폴더 선택" 버튼 클릭
 * (`AGENTDECK_E2E_WORKSPACE`가 네이티브 다이얼로그를 우회) + (옵션) 트리 로드 확인.
 * `multi` 워크스페이스 모드에서는 이 버튼이 존재하지 않는다(FileExplorer 언마운트).
 */
export async function openWorkspace(page: Page, opts: OpenWorkspaceOptions = {}): Promise<void> {
  const { waitForTree = true, treeTimeoutMs = 10_000 } = opts
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) {
    await pickFolder.click()
  }
  if (waitForTree) {
    // 워크스페이스 트리 로드 확인(파일이 있는 워크스페이스 전용)
    await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: treeTimeoutMs })
  }
}

export interface SettleTurnOptions {
  /** 전체 폴링 타임아웃(ms) — 기본 180_000. */
  timeoutMs?: number
  /**
   * 폴링 중 권한 카드(PERM_CARD)가 뜨면 자동 선택할 항목 — 기본 'allow_always'.
   * false면 권한 카드를 건드리지 않고 그대로 둔다(카드 자체를 검증해야 하는 테스트용).
   */
  autoApprove?: PermChoice | false
}

/**
 * 진행 중인 턴이 완전히 끝날 때까지 대기한다(live-test-project.e2e.ts의 로컬 `settleTurn`을
 * 일반화 — orchestration-live.e2e.ts에서도 동일 패턴이 필요해 여기로 승격).
 *
 * 배경: `.msg.ai-msg .content`의 `toContainText`류 얕은 부분일치 단정은 어시스턴트의
 * *중간* 계획 메시지에도 조기 매칭될 수 있다(예: "one to reply ALPHA, one to reply BRAVO"
 * 라는 계획 서술에 이미 정답 단어가 포함됨) — 백그라운드 서브에이전트/워크플로가 아직
 * 안 끝났는데 테스트가 통과 판정을 내리고 다음 테스트로 넘어가, REPL 세션이 아직 바쁜
 * 상태에서 다음 메시지가 같은 턴에 끼어드는 교차-테스트 경합을 낳았다(2026-07 라이브 e2e
 * 재실측 실증). 반드시 "실행 중단" 버튼이 사라질 때까지 기다린 *후*에 최종 응답을 단정할 것.
 */
export async function settleTurn(page: Page, opts: SettleTurnOptions = {}): Promise<void> {
  const { timeoutMs = 180_000, autoApprove = 'allow_always' } = opts
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // 권한 카드(부수효과 도구 발화 시) — 지정된 선택지로 자동 처리
    if (autoApprove) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        const opt = perm.locator(permChoiceSelector(autoApprove))
        await opt.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
    }
    // 실행 중단 버튼(전송 중)이 사라지면 turn 종료로 간주
    const running = page.getByLabel('실행 중단')
    const isRunning = await running.isVisible().catch(() => false)
    if (!isRunning) {
      await page.waitForTimeout(1500) // 후처리(refreshFileTree 등) 여유
      return
    }
    await page.waitForTimeout(1200)
  }
}
