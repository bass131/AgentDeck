import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'

// 폴더 선택 대화상자의 한 곳 (M05 G11) — workspace.open·reference.add·dialog.pickFolder 핸들러가 함께 쓴다.
// 맡는 것은 E2E 환경변수 읽기와 대화상자뿐이다. 요청 folderPath 우선 처리, 사후 검증, 실패 응답 모양은 핸들러에 남는다.
export type PickFolderE2eEnvKey =
  | 'AGENTDECK_E2E_WORKSPACE'
  | 'AGENTDECK_E2E_REFERENCE'
  | 'AGENTDECK_E2E_PICK_FOLDER'

// 고른 폴더 경로(`\`→`/`)를 돌려준다. 취소하거나 고른 것이 없으면 null.
// 환경변수는 호출마다 truthy로 읽는다 — 빈 문자열이면 대화상자를 연다. 부모 창이 없으면 옵션 하나로 부른다.
export async function pickDirectory(
  win: BrowserWindow | null,
  e2eEnvKey: PickFolderE2eEnvKey
): Promise<string | null> {
  const e2ePath = process.env[e2eEnvKey]
  if (e2ePath) return e2ePath.replace(/\\/g, '/')

  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0].replace(/\\/g, '/')
}
