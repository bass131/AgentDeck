/**
 * gitSampleData.ts — GitModal 단위 테스트용 mock 데이터.
 *
 * CRITICAL: 타입 정의는 이 파일에 없음. src/shared/ipc-contract 단일 공급원 사용.
 * 샘플 상수는 테스트 mock 전용 — GitModal 컴포넌트가 직접 import하지 않는다.
 * GitModal은 window.api.git IPC로 실 데이터를 받는다(M3 3c).
 *
 * plan-auditor 🟡-2 해소: 자체 GitStatus/GitChange/GitCommit 타입 정의 삭제.
 */
import type {
  GitStatus,
  GitChange,
  GitCommit,
} from '../../../shared/ipc-contract'

export type { GitStatus, GitChange, GitCommit }

// ── 테스트용 샘플 상태 ────────────────────────────────────────────────────────
// 아래 상수는 tests/renderer/gitmodal.test.tsx mock에서 참조 가능.
// GitModal 컴포넌트 본체는 이 상수를 import하지 않는다.

const now = Date.now()
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export const SAMPLE_GIT_STATUS: GitStatus = {
  root: 'C:/Dev/AgentDeck',
  branch: 'main',
  ahead: 2,
  behind: 0,
  branches: [
    { name: 'main', current: true },
    { name: 'feature/git-modal', current: false },
    { name: 'feature/agent-panel', current: false },
  ],
  remotes: ['origin'],
  tags: ['v1.0.0', 'v0.9.0'],
  changes: [
    { path: 'src/renderer/src/components/GitModal.tsx', status: 'A', add: 120, del: 0 },
    { path: 'src/renderer/src/components/GitModal.css', status: 'A', add: 80, del: 0 },
    { path: 'src/renderer/src/lib/gitSampleData.ts', status: 'M', add: 5, del: 30 },
    { path: 'src/renderer/src/layout/Shell.tsx', status: 'M', add: 10, del: 3 },
    { path: 'src/renderer/src/components/FileExplorer.tsx', status: 'M', add: 2, del: 1 },
  ],
}

export const SAMPLE_GIT_COMMITS: GitCommit[] = [
  {
    hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    shortHash: 'a1b2c3d',
    subject: 'feat: GitModal IPC 연결 (M3 3c)',
    body: '실 git IPC 연결. window.api.git.* 9메서드 사용.',
    author: '개발자',
    date: now - 30 * MIN,
    tags: [],
    pushed: false,
  },
  {
    hash: 'b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3',
    shortHash: 'b2c3d4e',
    subject: 'feat: FileExplorer git 버튼 추가',
    body: 'IconGitBranch 버튼 → onOpenGit prop. Shell gitOpen state 연결.',
    author: '개발자',
    date: now - 2 * HOUR,
    tags: [],
    pushed: true,
  },
  {
    hash: 'c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4',
    shortHash: 'c3d4e5f',
    subject: 'refactor: AgentPanel 서브에이전트 상세 표시',
    body: 'agentpanel-detail 컴포넌트 추가. 툴호출 카드 접이식.',
    author: '개발자',
    date: now - 5 * HOUR,
    tags: [],
    pushed: true,
  },
  {
    hash: 'd4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5',
    shortHash: 'd4e5f6a',
    subject: 'feat: RecentFiles 탭 바 (F10)',
    body: '최근 파일 탭 + 드래그 재정렬 + 닫기.',
    author: '개발자',
    date: now - 1 * DAY,
    tags: [],
    pushed: true,
  },
  {
    hash: 'e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6',
    shortHash: 'e5f6a7b',
    subject: 'fix: SettingsModal 테마 토큰 회귀 수정',
    body: 'OKLCH 다크 테마 accent-soft 토큰 누락 수정.',
    author: '개발자',
    date: now - 2 * DAY,
    tags: ['v1.0.0'],
    pushed: true,
  },
]

export const SAMPLE_GIT_COMMIT_DETAIL: Record<string, GitChange[]> = {
  a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2: [
    { path: 'src/renderer/src/components/GitModal.tsx', status: 'A', add: 120, del: 0 },
    { path: 'src/renderer/src/lib/gitSampleData.ts', status: 'M', add: 5, del: 30 },
  ],
  b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3: [
    { path: 'src/renderer/src/components/FileExplorer.tsx', status: 'M', add: 2, del: 1 },
    { path: 'src/renderer/src/layout/Shell.tsx', status: 'M', add: 10, del: 3 },
  ],
}
