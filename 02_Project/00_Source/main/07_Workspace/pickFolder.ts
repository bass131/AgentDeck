import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'

type PickFolderE2eEnvKey =
  | 'AGENTDECK_E2E_WORKSPACE'
  | 'AGENTDECK_E2E_REFERENCE'
  | 'AGENTDECK_E2E_PICK_FOLDER'

// 취소하거나 고른 것이 없으면 null. E2E 환경변수는 호출마다 읽는다
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
