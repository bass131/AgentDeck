// @vitest-environment node
// 캡슐 경계 스모크 테스트 — file 기능 캡슐(02_Project/00_Source/renderer/src/features/file)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편(Step 3) 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import {
  FileBadge,
  FileExplorer,
  FileModal,
  FolderSwitchDialog,
  RecentFiles,
} from '../../../02_Project/00_Source/renderer/src/features/file'

// FileBadge·RecentFiles는 memo() 래핑이라 typeof가 'object'다 — 'function' 단정 대신 진리값만 본다.
describe('file 캡슐 — 공개 표면 스모크', () => {
  it('FileBadge가 캡슐 경로에서 export된다', () => {
    expect(FileBadge).toBeTruthy()
  })

  it('FileExplorer가 캡슐 경로에서 export된다', () => {
    expect(FileExplorer).toBeTruthy()
  })

  it('FileModal이 캡슐 경로에서 export된다', () => {
    expect(FileModal).toBeTruthy()
  })

  it('FolderSwitchDialog가 캡슐 경로에서 export된다', () => {
    expect(FolderSwitchDialog).toBeTruthy()
  })

  it('RecentFiles가 캡슐 경로에서 export된다', () => {
    expect(RecentFiles).toBeTruthy()
  })
})
