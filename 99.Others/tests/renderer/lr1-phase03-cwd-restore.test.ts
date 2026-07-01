/**
 * lr1-phase03-cwd-restore.test.ts — LR1 Phase 03 갈래 B-1: loadConversation cwd 복원 TDD (RED)
 *
 * 계약(01.Phases/LR1-loop-resume/03-resume-robustness.md 갈래 B, conversation.ts:62-90):
 *   loadConversation()이 로드한 ConversationRecord에 cwd(ADR-020 앵커 필드)가 있으면
 *   state.workspaceRoot를 그 cwd로 복원한다. 현재 구현은 conversationId/messages/thread/
 *   sessionId만 복원하고 workspaceRoot는 손대지 않는다 — 폴더 없는(workspaceRoot=null) 상태로
 *   재시작하면 마운트 시 자동 로드된 대화가 cwd 없이 남아, 다음 SDK resume이 process.cwd()로
 *   떨어져 실패한다(사전 조건: sdkOptions.ts req.workspaceRoot ?? process.cwd()).
 *
 * 참고: selectConversation(sessions.ts)은 이미 ADR-020으로 cwd 복원을 구현했다
 *   (adr020-cwd-anchor.test.ts) — workspaceOpen({folderPath}) IPC로 main 재검증을 거친다.
 *   loadConversation(마운트 시 최근 대화 자동 로드 경로)은 그 대칭 짝이 아직 없다.
 *   RED 테스트는 workspaceOpen도 함께 목해서, 구현이 selectConversation과 같은 경로
 *   (workspaceOpen 재검증)를 택하든 직접 대입을 택하든 둘 다 통과 가능하게 한다 —
 *   계약은 "최종 state.workspaceRoot 값"이지 구현 경로가 아니다.
 *
 * 검증 범위:
 *   - conv.cwd 있음(실제 존재하는 임시 디렉토리) → loadConversation() 후 workspaceRoot === cwd.
 *   - conv.cwd 없음 → workspaceRoot는 이전 값 그대로(기존 호환, 회귀 0 — 이 케이스는 GREEN 유지).
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신 (단방향)
 *   - 신뢰경계: window.api.conversationLoad/workspaceOpen(화이트리스트)만 호출 관찰 — fs/Node 0
 *     (임시 디렉토리 생성은 테스트 픽스처 준비 목적으로만 node:fs 사용 — 앱 코드 대상 아님).
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConversationRecord, FileTreeNode } from '../../../02.Source/shared/ipc-contract'

// ── 실제 존재하는 임시 디렉토리(픽스처) ─────────────────────────────────────────
const REAL_CWD = mkdtempSync(join(tmpdir(), 'agentdeck-lr1-p03-'))

afterAll(() => {
  rmSync(REAL_CWD, { recursive: true, force: true })
})

const MOCK_TREE: FileTreeNode = { name: 'p', path: REAL_CWD, kind: 'directory', children: [] }

const RECORD_WITH_CWD: ConversationRecord = {
  id: 'conv-cwd-1',
  title: 'cwd 있는 대화',
  messages: [{ role: 'user', content: 'hi' }],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:01:00Z',
  sessionId: 's1',
  cwd: REAL_CWD,
}

const RECORD_NO_CWD: ConversationRecord = {
  id: 'conv-no-cwd',
  title: 'cwd 없는 대화',
  messages: [{ role: 'user', content: 'hi' }],
  backendId: 'claude-code',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:01:00Z',
  sessionId: 's2',
}

describe('LR1 Phase03 갈래B-1 — loadConversation cwd 복원', () => {
  const mockWorkspaceOpen = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // 구현이 selectConversation과 동일 경로(workspaceOpen 재검증)를 택하는 경우를 위한 목.
    mockWorkspaceOpen.mockResolvedValue({ rootPath: REAL_CWD, tree: MOCK_TREE })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
          workspaceOpen: mockWorkspaceOpen,
          conversationLoad: vi.fn(),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('conv.cwd 있음(실제 디렉토리) → loadConversation 후 workspaceRoot가 그 cwd로 복원된다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(window.api.conversationLoad as ReturnType<typeof vi.fn>).mockResolvedValue({
      conversations: [RECORD_WITH_CWD],
    })
    useAppStore.setState({ workspaceRoot: null } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().loadConversation()

    // RED: 현재 loadConversation은 workspaceRoot를 전혀 건드리지 않으므로 null로 남는다.
    expect(useAppStore.getState().workspaceRoot).toBe(REAL_CWD)
  })

  it('conv.cwd 없음 → loadConversation 후 workspaceRoot는 이전 값 그대로 유지된다(기존 호환)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(window.api.conversationLoad as ReturnType<typeof vi.fn>).mockResolvedValue({
      conversations: [RECORD_NO_CWD],
    })
    useAppStore.setState({ workspaceRoot: '/existing/root' } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().loadConversation()

    expect(useAppStore.getState().workspaceRoot).toBe('/existing/root')
    expect(mockWorkspaceOpen).not.toHaveBeenCalled()
  })
})
