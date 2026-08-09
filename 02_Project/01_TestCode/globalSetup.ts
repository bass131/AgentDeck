import os from 'node:os'
import path from 'node:path'

import { snapshotDir, diffSnapshot, formatDiff, nodeGuardFs, type DirSnapshot } from './_lib/homeGuard'

export function homeGuardDir(): string {
  const injected = process.env.AGENTDECK_HOMEGUARD_DIR
  if (injected && injected.trim() !== '') return injected
  return path.join(os.homedir(), '.agentdeck-dev')
}

let watched = ''
let before: DirSnapshot | null = null

export function setup(): void {
  watched = homeGuardDir()
  before = snapshotDir(watched, nodeGuardFs)
}

export function teardown(): void {
  if (before === null) return
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
      'userData 경로 주입 매개변수를 명시하세요 (예: 02_Project/01_TestCode/main/engineVersions.test.ts).',
      '이 게이트의 감시 대상은 AGENTDECK_HOMEGUARD_DIR 환경변수로 바꿀 수 있습니다.',
    ].join('\n')
  )
}
