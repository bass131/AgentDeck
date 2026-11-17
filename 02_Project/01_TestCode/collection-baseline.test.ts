import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_ROOT = fileURLToPath(new URL('./', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITEST_CONFIG = path.join(REPO_ROOT, 'vitest.config.ts')

const EXPECTED_INCLUDE = [
  '02_Project/01_TestCode/**/*.test.ts',
  '02_Project/01_TestCode/**/*.test.tsx',
] as const

const COLLECTED_SUFFIXES = ['.test.ts', '.test.tsx'] as const

const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

// M02 Phase 5: 하한(≥) 판정을 집행 후 정확값 등호로 전환했다 ([USER] 2026-08-10 산출물·수집 차분 고정).
// 하한이면 수집 파일이 조용히 늘거나 줄어도 통과해서 차분이 판정 표면에 잡히지 않는다.
// 값을 바꿀 때는 추측하지 말고 실측해서(find 02_Project/01_TestCode -name '*.test.ts' -o -name '*.test.tsx') 고친다.
// M05 G9a: 414 → 415. 공용 실행 코어의 구조 단위 테스트 renderer/g9a-run-core.test.ts를 더했다.
// M05 G9a: 415 → 416. 단일·멀티 실행 동작 정렬(E 항목) 테스트 renderer/g9a-run-core-alignment.test.tsx를 더했다.
// M05 G9b: 416 → 417. 공용 스레드 렌더(ThreadView) 구조 테스트 renderer/g9b-thread-view.test.tsx를 더했다.
// M05 G9b: 417 → 418. 패널이 공용 스레드 렌더를 쓰는지(R1~R7) 고정하는 renderer/g9b-panel-thread.test.tsx를 더했다.
// M05 G9b: 418 → 419. 선택기 하나(PickerGroup, P1·P2·P5) 테스트 renderer/g9b-picker-group.test.tsx를 더했다.
// M05 G9b: 419 → 420. 입력창 본체 하나(ComposerView)·대기열·패널 입력창 테스트 renderer/g9b-composer-view.test.tsx를 더했다.
// M05 G9b: 420 → 421. 대기열을 공용 실행 상태로 옮긴 구조 테스트 renderer/g9b-queue-core.test.tsx를 더했다.
// M05 G9b: 421 → 420. 패널 팔레트 사본 useInputPalettes.ts를 지우며 그 테스트 renderer/useInputPalettes.test.tsx도
// 지웠다. root 전달 테스트는 useSlashPalette.test.tsx로 옮겼고, 나머지는 공용 훅 테스트가 이미 덮는다.
// M05 G9c: 420 → 421. 세션 레지스트리 키 형식(sessionKeys) 테스트 renderer/g9c-session-keys.test.ts를 더했다.
// M05 G9c: 421 → 422. 세션 레지스트리 한 벌(상태·라우팅·루프 표시·타이머·구독) 테스트 renderer/g9c-session-registry.test.ts를 더했다.
// M05 G9c: 422 → 423. 'multi'/'single' 분기 정리와 P4 기본 모드 값 고정 테스트 renderer/g9c-branch-cleanup.test.tsx를 더했다.
// M05 G9c: 423 → 424. B1 Sidebar 실행 표시(레지스트리 기준) 테스트 renderer/g9c-b1-sidebar-running.test.tsx를 더했다.
// M05 G9c: 424 → 425. Backlog 46(폐기 뒤 SET_RUN_ID) 테스트 renderer/g9c-backlog46-dispose.test.tsx를 더했다.
// M05 G9c: 425 → 426. 차이 목록에서 테스트가 없던 항목(E6·E10·P3·L3·B2)을 고정하는 renderer/g9c-difference-pins.test.tsx를 더했다.
// M05 G10: 426 → 427. IPC 채널 타입 맵 고정(@ts-expect-error 사례) 테스트 shared/g10-ipc-typemap.test.ts를 더했다.
// M05 G10: 427 → 428. renderer IPC 클라이언트(01_Ipc)와 window.api 직접 호출 0 고정 테스트 renderer/g10-ipc-client.test.ts를 더했다.
// M05 G10: 428 → 427. window.setBounds 채널을 지우며 그 신뢰경계 sanitizer와 테스트 main/window-bounds-sanitize.test.ts(15건)를 함께 지웠다 — 받는 채널이 없어 공격 면도 없다(goal 결정 대장 [AI]).
// M05 G11: 427 → 428. credentials 파일 읽기 한 곳(10_Engine/credentials)과 두 소비처 기본 경로를 고정하는 main/credentials.test.ts를 더했다.
// M05 G11: 428 → 429. frontmatter 파서 한 곳(11_Settings/frontmatter)과 skills·commands 공통 동작을 고정하는 main/frontmatter.test.ts를 더했다.
// M05 G11: 429 → 430. 비활성 오버레이 한 곳(11_Settings/disabledOverlay)과 skills·mcp 공통 동작을 고정하는 main/disabledOverlay.test.ts를 더했다.
// M05 G11: 430 → 431. 폴더 선택 대화상자 한 곳(07_Workspace/pickFolder)과 실물 핸들러 셋의 동작을 고정하는 main/handlers/folder-pick.test.ts를 더했다.
// M05 G11: 431 → 432. userData 경로 해석 한 곳(02_Common/userData)과 각 자리의 해석 시점을 고정하는 main/userData.test.ts를 더했다.
// M05 G11: 432 → 433. 권한 모드 표 한 곳(04_Claude/permissionModes)과 실물 진입점 넷(시작·실행 중·역매핑·화이트리스트)의 값을 고정하는 main/permissionModes.test.ts를 더했다.
// M05 G11: 433 → 434. 워크스페이스 루트 원천 하나(roots, 접근자 getWorkspaceRootPath)와 루트를 읽는 네 채널을 고정하는 main/handlers/workspace-root-source.test.ts를 더했다.
// M05 G11: 434 → 435. 조립 지점 00_App 하나(ConversationStore 소유자, skills·MCP store 같은 인스턴스, 기동·종료 배선)를 실물 모듈로 고정하는 main/appAssembly.test.ts를 더했다.
// M05 G12: 435 → 436. 테스트 배치 가드(작업 ID 이름 0, 제자리 밖 테스트는 <프로세스>/NN_Domain/ 아래, agents/ 비움) testLayout.guard.test.ts를 더했다.
// M05 G12: 436 그대로. 테스트 430파일을 <프로세스>/NN_Domain/으로 옮기고 이름을 바꿨지만 수는 바뀌지 않는다.
// 위 줄들의 옛 경로는 그때의 이름이다. 지금 자리는 G12 이동 표(99e·99f·99g)에서 찾는다.
// M05 G12: 436 → 435. 같은 대상(toolMetaFor) 테스트 renderer/03_Agent/toolKind.sdk-tools.test.ts를 renderer/03_Agent/toolKind.test.ts로 합쳤다(제목 그대로).
// M05 G12: 435 → 434. 같은 대상(useGlobalShortcuts) 테스트 renderer/12_Window/useGlobalShortcuts.basics.test.tsx를 renderer/12_Window/useGlobalShortcuts.test.tsx로 합쳤다(제목 그대로, afterEach는 오버레이 DOM까지 지우는 쪽 하나).
// M06 G3: 434 → 435. 가드가 물은 호출의 카드 경로·명령 전문·「항상 허용」 없음을 고정하는 main/04_Claude/permissionCoordinator.guard-ask.test.ts를 더했다.
// M06 G3: 435 → 437. 사유가 reducer를 지나는지 보는 renderer/05_Conversation/reducer.guard-ask.test.ts와
// 카드 표시(명령 전문·사유·「항상 허용」 없음)를 보는 renderer/03_Agent/PermissionCard.guard-ask.test.tsx를 더했다.
// M06 G4: 437 → 440. 모델 목록 자동화 — main 공급자(SDK 목록·캐시·최소 목록, 턴 없는 목록 요청, IPC)를 고정하는
// main/04_Claude/modelListProvider.test.ts, 계기가 주 모델 항목의 창을 고르는지 보는 main/04_Claude/claudeStream.context-window.test.ts,
// 선택기·effort 메뉴가 SDK 목록으로 그려지고 정식 ID를 넘기는지 보는 renderer/05_Conversation/PickerGroup.model-list.test.tsx를 더했다.
// M06 G4: 440 → 441. 실앱 확인에서 conversation.save 핸들러가 model을 버리는 것이 드러나, 그 저장을 고정하는
// main/01_Ipc/conversation.model-persist.test.ts를 더했다.
// M07 G2: 441 → 443. 권한 콜백을 노드 등록부로 옮기며, 옮기기 전 판정 표를 고정하는
// main/04_Claude/permissionCoordinator.characterization.test.ts와 등록부를 고정하는 main/04_Claude/controlNodes.test.ts를 더했다.
// M07 G3: 443 → 444. 앱 엔진·설정 경로 잠금(거부 규칙, Bash 잠금 훅, SDK 옵션 배선)을 고정하는 main/04_Claude/enginePathLock.test.ts를 더했다.
// M07 G4: 444 → 445. 앱 밖에서 바뀐 엔진을 불러오지 않는 엔진 봉인을 고정하는 main/10_Engine/engineSeal.test.ts를 더했다.
const BASELINE_TEST_FILES = 445

function collectTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectTestFiles(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    if (COLLECTED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      acc.push(path.relative(TESTS_ROOT, full).split(path.sep).join('/'))
    }
  }
  return acc.sort()
}

describe('테스트 수집 기준선 (fitness)', () => {
  it('vitest include 글롭이 세는 기준과 일치한다', () => {
    const source = fs.readFileSync(VITEST_CONFIG, 'utf-8')
    const match = /include:\s*\[([^\]]*)\]/.exec(source)
    expect(match, 'vitest.config.ts 에서 test.include 를 찾지 못했다').not.toBeNull()

    const declared = Array.from(match![1].matchAll(/'([^']+)'/g)).map((m) => m[1])
    expect(declared).toEqual([...EXPECTED_INCLUDE])
  })

  it(`수집되는 테스트 파일이 정확히 ${BASELINE_TEST_FILES}개다`, () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files.length).toBe(BASELINE_TEST_FILES)
  })

  it('e2e 스펙(playwright 소관)은 수집 수에 섞이지 않는다', () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files.filter((f) => f.endsWith('.e2e.ts'))).toEqual([])
    expect(files.every((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(true)
  })

  it('이 fitness 테스트 자신도 수집 대상에 들어 있다', () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files).toContain('collection-baseline.test.ts')
  })
})
