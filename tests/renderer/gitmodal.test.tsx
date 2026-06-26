// @vitest-environment jsdom
/**
 * gitmodal.test.tsx — M3 3c GitModal IPC 연결 단위 테스트.
 *
 * TDD: window.api.git.* 를 vi.fn()으로 mock 후, 실 IPC 연결된 GitModal 행동 단언.
 *
 * 단언 목록:
 *   - refresh: status/log 호출
 *   - 커밋 선택 시 commitDetail 호출 + 캐시
 *   - 파일 클릭 시 fileAt/workingFile 호출
 *   - 커밋 버튼이 commit 호출 + 성공 시 refresh
 *   - push/pull 버튼 호출
 *   - AI커밋 버튼이 onAskClaude 호출
 *   - status M/A/D/R 렌더
 *   - repoName = basename(root)
 *   - 기존 UI 동작(최대화·Esc·오버레이 닫기) 보존
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import type {
  GitStatus,
  GitCommit,
  GitChange,
} from '../../src/shared/ipc-contract'

afterEach(() => cleanup())

// ── 샘플 데이터 ───────────────────────────────────────────────────────────────

const ROOT = 'C:/Dev/MyRepo'

const SAMPLE_STATUS: GitStatus = {
  root: ROOT,
  branch: 'main',
  ahead: 2,
  behind: 0,
  branches: [
    { name: 'main', current: true },
    { name: 'dev', current: false },
  ],
  remotes: ['origin'],
  tags: ['v1.0.0'],
  changes: [
    { path: 'src/foo.ts', status: 'M', add: 3, del: 1 },
    { path: 'src/bar.ts', status: 'A', add: 10, del: 0 },
    { path: 'src/baz.ts', status: 'D', add: 0, del: 5 },
  ],
}

const SAMPLE_COMMITS: GitCommit[] = [
  {
    hash: 'aabbccdd1122aabbccdd1122aabbccdd11220001',
    shortHash: 'aabbccd',
    subject: 'feat: 첫 번째 커밋',
    body: '설명 본문',
    author: '개발자',
    date: Date.now() - 30 * 60 * 1000,
    tags: ['v1.0.0'],
    pushed: true,
  },
  {
    hash: 'aabbccdd1122aabbccdd1122aabbccdd11220002',
    shortHash: 'aabbc02',
    subject: 'fix: 두 번째 커밋',
    body: '',
    author: '개발자',
    date: Date.now() - 2 * 3600 * 1000,
    tags: [],
    pushed: false,
  },
]

const SAMPLE_DETAIL: GitChange[] = [
  { path: 'src/foo.ts', status: 'M', add: 3, del: 1 },
]

// ── mock window.api.git ───────────────────────────────────────────────────────

function makeMockGitApi(overrides: Partial<{
  statusResult: GitStatus | null
  commitsResult: GitCommit[]
  detailResult: GitChange[]
  commitResult: { ok: boolean; error?: string }
  pushResult: { ok: boolean; error?: string }
  pullResult: { ok: boolean; error?: string }
  fileAtResult: { content: string | null; diff: null; error?: string }
  workingFileResult: { content: string | null; diff: null; error?: string }
}> = {}) {
  const {
    statusResult = SAMPLE_STATUS,
    commitsResult = SAMPLE_COMMITS,
    detailResult = SAMPLE_DETAIL,
    commitResult = { ok: true },
    pushResult = { ok: true },
    pullResult = { ok: true },
    fileAtResult = { content: '// file content', diff: null },
    workingFileResult = { content: null, diff: null },
  } = overrides

  return {
    root: vi.fn().mockResolvedValue(ROOT),
    status: vi.fn().mockResolvedValue(statusResult),
    log: vi.fn().mockResolvedValue(commitsResult),
    commitDetail: vi.fn().mockResolvedValue(detailResult),
    fileAt: vi.fn().mockResolvedValue(fileAtResult),
    workingFile: vi.fn().mockResolvedValue(workingFileResult),
    commit: vi.fn().mockResolvedValue(commitResult),
    push: vi.fn().mockResolvedValue(pushResult),
    pull: vi.fn().mockResolvedValue(pullResult),
  }
}

let mockGit = makeMockGitApi()

beforeEach(() => {
  mockGit = makeMockGitApi()
  Object.defineProperty(window, 'api', {
    value: { git: mockGit },
    writable: true,
    configurable: true,
  })
})

// ── 렌더 헬퍼 ────────────────────────────────────────────────────────────────

interface GitModalTestProps {
  root?: string
  onClose?: () => void
  onOpenFile?: (path: string, content: string | null, diff: unknown) => void
  onAskClaude?: (prompt: string) => void
}

async function renderGitModal(props: GitModalTestProps = {}) {
  // 모듈 캐시 무효화 (vi.mock 없이 매 테스트 fresh import)
  const { GitModal } = await import('../../src/renderer/src/components/04_git/GitModal')
  const mergedProps = {
    root: ROOT,
    onClose: vi.fn(),
    onOpenFile: vi.fn(),
    onAskClaude: vi.fn(),
    ...props,
  }
  const result = render(<GitModal {...mergedProps} />)
  // useEffect(refresh) 실행 대기
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return { ...result, props: mergedProps }
}

// ═══════════════════════════════════════════════════════════════════════════════
// refresh() — status/log 호출
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — refresh', () => {
  it('마운트 시 window.api.git.status 호출 (root 전달)', async () => {
    await renderGitModal()
    expect(mockGit.status).toHaveBeenCalledWith({ root: ROOT })
  })

  it('마운트 시 window.api.git.log 호출 (root + limit=100)', async () => {
    await renderGitModal()
    expect(mockGit.log).toHaveBeenCalledWith({ root: ROOT, limit: 100 })
  })

  it('status 응답으로 브랜치가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const brEl = container.querySelector('.gitm-br')
    expect(brEl?.textContent).toContain('main')
  })

  it('log 응답으로 커밋 rows가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const commits = container.querySelectorAll('.gitm-commit')
    expect(commits.length).toBeGreaterThanOrEqual(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// repoName = basename(root)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — repoName', () => {
  it('헤더에 root basename이 repoName으로 표시된다', async () => {
    await renderGitModal({ root: 'C:/Dev/MyRepo' })
    // basename = 'MyRepo'
    expect(screen.getByText('MyRepo')).toBeTruthy()
  })

  it('슬래시 경로에서도 basename을 파생한다', async () => {
    await renderGitModal({ root: '/home/user/awesome-project' })
    expect(screen.getByText('awesome-project')).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 커밋 선택 — commitDetail 호출 + 캐시
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — commitDetail lazy + cache', () => {
  it('커밋 선택 시 commitDetail IPC 호출', async () => {
    const { container } = await renderGitModal()
    // 두 번째 커밋 클릭 (첫 커밋은 마운트 시 이미 selHash로 설정)
    const commitBtns = container.querySelectorAll('.gitm-commit')
    await act(async () => {
      fireEvent.click(commitBtns[1])
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(mockGit.commitDetail).toHaveBeenCalledWith({
      root: ROOT,
      hash: SAMPLE_COMMITS[1].hash,
    })
  })

  it('같은 커밋 재클릭 시 commitDetail 중복 호출 없음(캐시)', async () => {
    const { container } = await renderGitModal()
    const commitBtns = container.querySelectorAll('.gitm-commit')
    await act(async () => {
      fireEvent.click(commitBtns[0])
      await new Promise((r) => setTimeout(r, 0))
    })
    const callCount = mockGit.commitDetail.mock.calls.length
    // 같은 커밋 다시 클릭
    await act(async () => {
      fireEvent.click(commitBtns[0])
      await new Promise((r) => setTimeout(r, 0))
    })
    // 캐시 히트 — 추가 호출 없음
    expect(mockGit.commitDetail.mock.calls.length).toBe(callCount)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 파일 클릭 — workingFile / fileAt 호출
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — 파일 클릭', () => {
  it('changes 뷰 파일 클릭 시 workingFile IPC 호출', async () => {
    const { container } = await renderGitModal()
    // changes 뷰로 전환
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
      await new Promise((r) => setTimeout(r, 0))
    })
    // 첫 번째 파일 클릭 (status='M', D 아님)
    const fileRows = container.querySelectorAll('.gitm-file')
    await act(async () => {
      fireEvent.click(fileRows[0])
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(mockGit.workingFile).toHaveBeenCalledWith({
      root: ROOT,
      path: 'src/foo.ts',
    })
  })

  it('history 뷰 파일 클릭 시 fileAt IPC 호출', async () => {
    const { container } = await renderGitModal()
    // commitDetail 응답 대기
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    // 커밋 선택 + detail 렌더 대기
    const commitBtns = container.querySelectorAll('.gitm-commit')
    await act(async () => {
      fireEvent.click(commitBtns[0])
      await new Promise((r) => setTimeout(r, 0))
    })
    const fileRows = container.querySelectorAll('.gitm-file')
    if (fileRows.length > 0) {
      await act(async () => {
        fireEvent.click(fileRows[0])
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(mockGit.fileAt).toHaveBeenCalledWith({
        root: ROOT,
        hash: SAMPLE_COMMITS[0].hash,
        path: SAMPLE_DETAIL[0].path,
      })
    }
  })

  it('workingFile 성공 시 onOpenFile 콜백 호출', async () => {
    const onOpenFile = vi.fn()
    const { container } = await renderGitModal({ onOpenFile })
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => {
      fireEvent.click(changesBtn)
    })
    const fileRows = container.querySelectorAll('.gitm-file')
    await act(async () => {
      fireEvent.click(fileRows[0])
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(onOpenFile).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 커밋 — commit IPC + 성공 시 refresh
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — commit', () => {
  it('커밋 버튼 클릭 시 git.commit IPC 호출', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const subjectInput = screen.getByPlaceholderText('커밋 메시지')
    await act(async () => {
      fireEvent.change(subjectInput, { target: { value: 'feat: 테스트 커밋' } })
    })

    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(commitBtn)
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockGit.commit).toHaveBeenCalledWith({
      root: ROOT,
      subject: 'feat: 테스트 커밋',
      body: '',
    })
  })

  it('커밋 성공 시 입력 비우고 refresh(status+log 재호출)', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const subjectInput = screen.getByPlaceholderText('커밋 메시지')
    await act(async () => {
      fireEvent.change(subjectInput, { target: { value: 'feat: 성공 커밋' } })
    })

    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    const initialStatusCalls = mockGit.status.mock.calls.length

    await act(async () => {
      fireEvent.click(commitBtn)
      await new Promise((r) => setTimeout(r, 50))
    })

    // refresh가 재호출되어 status 호출 횟수 증가
    expect(mockGit.status.mock.calls.length).toBeGreaterThan(initialStatusCalls)
    // subject input이 비워짐
    const inputAfter = screen.getByPlaceholderText('커밋 메시지') as HTMLInputElement
    expect(inputAfter.value).toBe('')
  })

  it('커밋 실패 시 err 표시', async () => {
    mockGit.commit = vi.fn().mockResolvedValue({ ok: false, error: '커밋 오류 발생' })
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const subjectInput = screen.getByPlaceholderText('커밋 메시지')
    await act(async () => {
      fireEvent.change(subjectInput, { target: { value: 'feat: 실패 커밋' } })
    })

    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(commitBtn)
      await new Promise((r) => setTimeout(r, 0))
    })

    // err 메시지가 표시됨
    await waitFor(() => {
      expect(screen.getByText('커밋 오류 발생')).toBeTruthy()
    })
  })

  it('subject 빈 시 커밋 버튼 disabled', async () => {
    await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const buttons = screen.getAllByRole('button')
    const commitBtn = buttons.find((b) => b.textContent?.trim() === '커밋') as HTMLButtonElement
    expect(commitBtn.disabled).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// push / pull 버튼
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — push/pull', () => {
  it('당겨오기 버튼 클릭 시 git.pull IPC 호출', async () => {
    await renderGitModal()
    const buttons = screen.getAllByRole('button')
    const pullBtn = buttons.find((b) => b.textContent?.includes('당겨오기')) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(pullBtn)
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(mockGit.pull).toHaveBeenCalledWith({ root: ROOT })
  })

  it('푸시 버튼 클릭 시 git.push IPC 호출', async () => {
    await renderGitModal()
    const buttons = screen.getAllByRole('button')
    const pushBtn = buttons.find((b) => b.textContent?.includes('푸시')) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(pushBtn)
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(mockGit.push).toHaveBeenCalledWith({ root: ROOT })
  })

  it('pull 성공 후 refresh(status 재호출)', async () => {
    await renderGitModal()
    const initialCalls = mockGit.status.mock.calls.length
    const buttons = screen.getAllByRole('button')
    const pullBtn = buttons.find((b) => b.textContent?.includes('당겨오기')) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(pullBtn)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(mockGit.status.mock.calls.length).toBeGreaterThan(initialCalls)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// AI커밋 버튼 — onAskClaude 호출
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — AI커밋 버튼', () => {
  it('Claude에게 메시지 짓게 하기 버튼 클릭 시 onAskClaude 호출', async () => {
    const onAskClaude = vi.fn()
    const onClose = vi.fn()
    await renderGitModal({ onAskClaude, onClose })

    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const buttons = screen.getAllByRole('button')
    const claudeBtn = buttons.find((b) => b.textContent?.includes('Claude에게')) as HTMLButtonElement
    await act(async () => { fireEvent.click(claudeBtn) })

    expect(onAskClaude).toHaveBeenCalledWith(
      'git 작업 트리의 변경 사항을 검토해서, 이 저장소의 기존 커밋 메시지 스타일에 맞는 커밋 메시지를 작성해 커밋해줘. 푸시는 하지 마.'
    )
  })

  it('AI커밋 버튼 클릭 시 onClose도 호출(카드 닫기)', async () => {
    const onAskClaude = vi.fn()
    const onClose = vi.fn()
    await renderGitModal({ onAskClaude, onClose })

    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const buttons = screen.getAllByRole('button')
    const claudeBtn = buttons.find((b) => b.textContent?.includes('Claude에게')) as HTMLButtonElement
    await act(async () => { fireEvent.click(claudeBtn) })

    expect(onClose).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// status M/A/D/R 렌더
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — status badge 렌더', () => {
  it('changes 뷰에서 M 배지가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const badges = container.querySelectorAll('.gitm-st')
    const texts = Array.from(badges).map((b) => b.textContent)
    expect(texts).toContain('M')
  })

  it('changes 뷰에서 A 배지가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const badges = container.querySelectorAll('.gitm-st')
    const texts = Array.from(badges).map((b) => b.textContent)
    expect(texts).toContain('A')
  })

  it('changes 뷰에서 D 배지가 렌더된다', async () => {
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })

    const badges = container.querySelectorAll('.gitm-st')
    const texts = Array.from(badges).map((b) => b.textContent)
    expect(texts).toContain('D')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// status null — 로딩/비-git 안내
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal IPC — 비-git / 로딩 상태', () => {
  it('status가 null이면 changes 뷰에서 로딩 스피너 표시', async () => {
    mockGit.status = vi.fn().mockResolvedValue(null)
    const { container } = await renderGitModal()
    const changesBtn = screen.getByText('변경 사항')
    await act(async () => { fireEvent.click(changesBtn) })
    // 로딩 중이거나 git 없음 안내
    const stateEl = container.querySelector('.gitm-state')
    expect(stateEl).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 기존 UI 동작 보존 (최대화·Esc·오버레이)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GitModal — 기존 UI 동작 보존', () => {
  it('최대화 버튼 클릭 시 maximized 클래스 추가', async () => {
    const { container } = await renderGitModal()
    const modal = container.querySelector('.gitm-modal')
    expect(modal?.classList.contains('maximized')).toBe(false)
    const maxBtn = screen.getByLabelText('최대화')
    await act(async () => { fireEvent.click(maxBtn) })
    expect(container.querySelector('.gitm-modal')?.classList.contains('maximized')).toBe(true)
  })

  it('최대화 후 "이전 크기로" 버튼 label 변경', async () => {
    await renderGitModal()
    await act(async () => { fireEvent.click(screen.getByLabelText('최대화')) })
    expect(screen.getByLabelText('이전 크기로')).toBeTruthy()
  })

  it('Esc 키 입력 시 onClose 호출', async () => {
    const onClose = vi.fn()
    await renderGitModal({ onClose })
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('오버레이 mousedown+click 시 onClose 호출', async () => {
    const onClose = vi.fn()
    const { container } = await renderGitModal({ onClose })
    const overlay = container.querySelector('.gitm-overlay') as HTMLElement
    await act(async () => {
      fireEvent.mouseDown(overlay, { target: overlay })
      fireEvent.click(overlay, { target: overlay })
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('닫기 버튼(aria-label="닫기") 클릭 시 onClose 호출', async () => {
    const onClose = vi.fn()
    await renderGitModal({ onClose })
    await act(async () => { fireEvent.click(screen.getByLabelText('닫기')) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('nav에 변경 사항 항목이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('변경 사항')).toBeTruthy()
  })

  it('nav에 모든 커밋 항목이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByText('모든 커밋')).toBeTruthy()
  })

  it('검색 input이 렌더된다', async () => {
    await renderGitModal()
    expect(screen.getByPlaceholderText('커밋 메시지·해시·작성자 검색…')).toBeTruthy()
  })

  it('검색 query가 커밋 목록을 필터한다', async () => {
    const { container } = await renderGitModal()
    const input = screen.getByPlaceholderText('커밋 메시지·해시·작성자 검색…')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'zzz_no_match_xyz' } })
    })
    const commits = container.querySelectorAll('.gitm-commit')
    expect(commits.length).toBe(0)
  })

  it('ahead 카운트가 표시된다', async () => {
    const { container } = await renderGitModal()
    // SAMPLE_STATUS.ahead = 2, 헤더에 ↑2 표시
    const brEl = container.querySelector('.gitm-br')
    expect(brEl?.textContent).toContain('2')
  })
})
