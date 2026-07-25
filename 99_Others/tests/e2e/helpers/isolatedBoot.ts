/**
 * isolatedBoot.ts — 라이브/Echo e2e 공용 격리 부트 헬퍼 (BF2-mini P2).
 *
 * 문제(표준화 이전): 기존 라이브 e2e(lr3-p06/loop-live/p01b/p04)와 Echo 스크린샷 하네스
 *   (lr2-03)는 개발자의 실 userData(prefs·conversations.json·multi-agent.json)를 공유했다.
 *   그 결과 (1) 사이드바에 실 대화 히스토리가 노출돼 스크린샷이 오염되고, (2) 이전 런의
 *   stale sessionId가 lastActiveId로 복원돼 다른 cwd에서 "No conversation found"로 죽거나
 *   옛 세션 크론·pendingCommand 잔재가 진단을 오염시켰다.
 *
 * 해결(probe2 fb9f509 실증): Chromium 스위치 `--user-data-dir=<tmp>`를 out/main/index.js 앞에
 *   두면 app.getPath('userData')가 tmp로 바뀐다(라이브 SDK 인증은 홈 ~/.claude/.credentials.json
 *   이라 격리와 무관하게 유지). 신규 userData면 프로필이 없어 AppGate가 '온보딩' 단계로
 *   들어가고 이때 Shell(=titlebar)은 아직 미마운트다 — 그래서 titlebar만 기다리면 타임아웃.
 *   온보딩(#nickname) → engine-gate → WhatsNew 모달 → 워크스페이스 오픈(Ctrl+O)을 순서대로
 *   선처리해야 부트가 완성된다.
 *
 * 반환: { app, page, workspace, userDataDir, teardown } — teardown()이 app.close + tmp 2개
 *   (userDataDir·workspace) 정리를 멱등 수행한다.
 *
 * ⚠️ AGENTDECK_E2E는 라이브 SDK 테스트에서 절대 설정 금지(설정 시 EchoBackend 모크가 됨).
 *   Echo 하네스만 { echo: true }로 명시한다.
 */
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface IsolatedBootOptions {
  /** true면 EchoBackend 모크(AGENTDECK_E2E=1). 라이브 SDK 테스트는 생략(기본 false). */
  echo?: boolean
  /** 온보딩 닉네임(신규 userData). 기본 'tester'. */
  nickname?: string
  /** tmp 디렉토리 접두(디버깅 식별용). 기본 'agentdeck-e2e'. */
  slug?: string
  /** 추가 env override(위 표준 env 위에 병합). */
  env?: Record<string, string>
}

export interface IsolatedBootResult {
  app: ElectronApplication
  page: Page
  /** AGENTDECK_E2E_WORKSPACE로 넘긴 tmp 워크스페이스 경로. */
  workspace: string
  /** --user-data-dir로 넘긴 tmp userData 경로. */
  userDataDir: string
  /** app.close + tmp 2개 정리(멱등). 각 테스트 finally에서 호출. */
  teardown: () => Promise<void>
}

/**
 * 청정 userData로 Electron을 띄우고 채팅 화면까지 부트한다.
 *
 * 순서: launch(--user-data-dir 격리) → 온보딩(#nickname) → engine-gate('계속 진행') →
 *   titlebar → WhatsNew('건너뛰기') → 단일 모드 탭 → 워크스페이스 오픈(Ctrl+O + '폴더 선택'
 *   폴백) → composer enabled 확인.
 */
export async function isolatedBoot(options: IsolatedBootOptions = {}): Promise<IsolatedBootResult> {
  const slug = options.slug ?? 'agentdeck-e2e'
  const userDataDir = mkdtempSync(join(tmpdir(), `${slug}-udd-`))
  const workspace = mkdtempSync(join(tmpdir(), `${slug}-ws-`))

  // reviewer 🟡-1(BF2-mini): 라이브 모드에서 부모 셸의 AGENTDECK_E2E 상속을 코드로 차단 —
  // 개발자 셸에 export돼 있으면 라이브 probe가 조용히 EchoBackend 모크가 되어 진단이
  // 무의미해진다. echo 옵션일 때만 명시 재설정(부모 env 위생에 의존하지 않는 격리 계약).
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_WORKSPACE: workspace,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    ...(options.env ?? {})
  }
  if (options.echo) childEnv.AGENTDECK_E2E = '1'
  else delete childEnv.AGENTDECK_E2E

  const app = await electron.launch({
    // --user-data-dir는 out/main/index.js '앞'에 둔다(Chromium 전역 파싱 — 순서 무관하나 관례).
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: childEnv as Record<string, string>
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 신규 userData면 온보딩(#nickname)이 먼저 뜨고 titlebar는 아직 미마운트 — 둘 중 먼저 뜨는
  // 것을 기다린다(titlebar만 기다리면 온보딩 단계에서 타임아웃 — probe2가 규명한 실측 함정).
  await Promise.race([
    page.waitForSelector('#nickname', { timeout: 25_000 }).catch(() => null),
    page.waitForSelector('.titlebar', { timeout: 25_000 }).catch(() => null)
  ])

  // 1) 온보딩 닉네임
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill(options.nickname ?? 'tester')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
  }

  // 2) engine-gate(미인증 안내) — 라이브는 홈 creds라 보통 안 뜬다. 뜨면 계속 진행.
  const gate = page.getByRole('button', { name: '계속 진행' })
  if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})

  await page.waitForSelector('.titlebar', { timeout: 20_000 }).catch(() => {})

  // 3) WhatsNew 온보딩 모달 — 신규 userData 첫 실행 시 등장, 클릭을 가로챔 → 건너뛰기.
  const whatsNew = page.locator('.wn-overlay')
  if (await whatsNew.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {})
    await whatsNew.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
  }
  // 남은 오버레이 방어(기존 라이브 부트 관례 — 닉네임 처리 후 Escape).
  await page.keyboard.press('Escape').catch(() => {})

  // 4) 단일 모드 강제(멀티 잔재 리셋 — 격리라 보통 이미 single).
  const singleTab = page.getByRole('tab', { name: /단일 에이전트/ })
  if (await singleTab.isVisible().catch(() => false)) await singleTab.click().catch(() => {})
  await page.locator('.pane.chat').waitFor({ state: 'visible', timeout: 15_000 })

  // 5) 워크스페이스 오픈: 신규 userData는 복원된 워크스페이스가 없어 composer가 disabled
  //    ('프로젝트 폴더를 먼저 열어주세요'). Ctrl+O(전역 단축키 → openWorkspace →
  //    AGENTDECK_E2E_WORKSPACE 게이트로 tmp 워크스페이스 자동 반환) + '폴더 선택' 폴백.
  const input = page.locator('.pane.chat').getByLabel('메시지 입력')
  if (!(await input.isEnabled().catch(() => false))) {
    await page.keyboard.press('Control+o').catch(() => {})
    await page.waitForTimeout(600)
    const pick = page.getByRole('button', { name: '폴더 선택' })
    if (await pick.isVisible().catch(() => false)) await pick.click().catch(() => {})
    await page.waitForTimeout(600)
  }

  let torn = false
  const teardown = async (): Promise<void> => {
    if (torn) return
    torn = true
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  }

  return { app, page, workspace, userDataDir, teardown }
}
