/**
 * globalSetup.ts — vitest 전역 테스트 격리 게이트 (BZ P02 · 백로그 21①)
 *
 * 무엇을 막는가: 테스트가 **저장소 밖(사용자 홈)에 쓰고도 green** 이 되는 상태.
 * 백로그 21 사고 — `engineVersions.test.ts` 가 실사용 `~/.agentdeck-dev/engine-config.json`
 * 을 `activeVersion: null` 로 덮어쓰고도 전량 green 이었다. 그 파일 안의 카나리아는
 * 사고 후에 붙였지만, **다른 어떤 테스트가 같은 짓을 해도 알 수 없다** — 그래서 전역으로 올린다.
 *
 * 동작: `setup()` 에서 감시 대상 디렉토리를 스냅샷 → `teardown()` 에서 다시 스냅샷 →
 * 차이가 있으면 **차이 목록을 담은 에러를 throw** 한다(어느 파일이 어떻게 달라졌는지 명시 —
 * 침묵 금지). vitest 는 globalSetup teardown 의 예외를 실행 실패로 취급한다.
 *
 * 감시 대상: `AGENTDECK_HOMEGUARD_DIR` 환경변수로 주입 가능, 기본값 `~/.agentdeck-dev`.
 *   - 주입구가 있는 이유 ①: 게이트 자신의 뮤테이션 검증(설치된 게이트가 실제로 red 를
 *     내는가)을 **실사용 홈을 건드리지 않고** 할 수 있어야 한다.
 *   - 주입구가 있는 이유 ②: CI 등 홈 경로가 다른 환경에서 대상을 바꿔 끼울 수 있다.
 *
 * ⚠️ 한계는 `_lib/homeGuard.ts` 상단 주석이 정본이다 — 요지: **순 변화(net change)만 검출**
 * 한다(생성→삭제·수정→원상복구는 미탐). 사전 차단이 아니라 침묵 깨기다. 또 e2e(playwright)는
 * vitest globalSetup 밖이라 이 게이트의 사정권이 아니다.
 *
 * 왜 setupFiles 가 아니라 globalSetup 인가: globalSetup 은 전체 실행에 1회(워커 밖) 돌고,
 * setupFiles 는 테스트 파일마다 돈다. 후자로 하면 **병렬 워커끼리 서로의 쓰기를 오검출**한다.
 */

import os from 'node:os'
import path from 'node:path'

import { snapshotDir, diffSnapshot, formatDiff, nodeGuardFs, type DirSnapshot } from './_lib/homeGuard'

/** 감시 대상 디렉토리 — env 주입 우선, 기본값은 앱의 개발용 userData 폴백 경로 */
export function homeGuardDir(): string {
  const injected = process.env.AGENTDECK_HOMEGUARD_DIR
  if (injected && injected.trim() !== '') return injected
  return path.join(os.homedir(), '.agentdeck-dev')
}

// setup 과 teardown 은 같은 vitest 메인 프로세스에서 같은 모듈 인스턴스를 공유한다.
let watched = ''
let before: DirSnapshot | null = null

export function setup(): void {
  watched = homeGuardDir()
  before = snapshotDir(watched, nodeGuardFs)
}

export function teardown(): void {
  if (before === null) return // setup 이 돌지 않았다면 대조할 기준이 없다
  const after = snapshotDir(watched, nodeGuardFs)
  const diff = diffSnapshot(before, after)
  before = null
  if (diff.length === 0) return

  throw new Error(
    [
      '[homeGuard] 테스트 격리 위반 — 저장소 밖 디렉토리가 테스트 실행으로 변경되었습니다.',
      formatDiff(watched, diff),
      '',
      '테스트는 실사용 데이터에 쓰면 안 됩니다. 임시 디렉토리(fs.mkdtempSync)로 경로를 주입하거나,',
      'userData 경로 주입 매개변수를 명시하세요 (예: 99_Others/tests/main/engineVersions.test.ts).',
      '이 게이트의 감시 대상은 AGENTDECK_HOMEGUARD_DIR 환경변수로 바꿀 수 있습니다.',
    ].join('\n')
  )
}
