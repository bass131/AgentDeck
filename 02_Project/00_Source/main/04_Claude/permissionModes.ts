// 권한 모드 매핑 표의 한 곳 (M05 G11) — picker id 한 행에 SDK 모드 두 칸을 둔다.
//   start: 실행을 시작할 때 SDK options.permissionMode로 보낼 값 (runArgs.buildQueryOptions)
//   live:  실행 중 전환 때 query.setPermissionMode로 보낼 값 (ClaudeAgentRun.setPermissionMode). 없으면 실행 중 전환을 거부한다.
// auto는 시작도 SDK 공식 auto다(M05 Backlog 3). 지원하지 않는 모델이면 SDK가 내린 모드를 permission_mode 이벤트로 받는다.
//
// 아래 넷은 이 표에서 유도한다(main/permissionModes.test.ts).
//   START_MODE_TO_SDK · LIVE_MODE_TO_SDK · SDK_MODE_TO_PICKER: 일반 객체다(프로토타입 키 조회까지 옮기기 전과 같게 둔다).
//   LIVE_MODE_WHITELIST: 배열이다 — AGENT_SET_MODE는 includes로 검사한다. 객체 조회로 바꾸면 'constructor'가 통과한다.
interface PermissionModeRow {
  readonly start: string
  readonly live?: string
}

export const PERMISSION_MODE_TABLE: Readonly<Record<string, PermissionModeRow>> = {
  normal: { start: 'default', live: 'default' },
  plan: { start: 'plan', live: 'plan' },
  acceptEdits: { start: 'acceptEdits', live: 'acceptEdits' },
  auto: { start: 'auto', live: 'auto' },
  bypass: { start: 'bypassPermissions' },
}

const rows = Object.entries(PERMISSION_MODE_TABLE)

export const START_MODE_TO_SDK: Record<string, string> = {}
export const LIVE_MODE_TO_SDK: Record<string, string> = {}
// SDK 모드 → picker id. 행마다 `live ?? start`를 뒤집는다.
export const SDK_MODE_TO_PICKER: Record<string, string> = {}

for (const [pickerId, row] of rows) {
  START_MODE_TO_SDK[pickerId] = row.start
  if (row.live !== undefined) LIVE_MODE_TO_SDK[pickerId] = row.live
  SDK_MODE_TO_PICKER[row.live ?? row.start] = pickerId
}

// 실행 중 전환을 받는 picker id — live 칸이 있는 행
export const LIVE_MODE_WHITELIST: readonly string[] = rows
  .filter(([, row]) => row.live !== undefined)
  .map(([pickerId]) => pickerId)
