/**
 * gitSampleData.ts — F11-01 GitModal 정적 샘플 데이터.
 *
 * window.api 호출 절대 금지. 순수 상수.
 * 실 git 백엔드(status/log/commit/push/pull) = M3 후속 IPC 연결 예정.
 */

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitChange {
  path: string
  kind: 'add' | 'modify' | 'delete'
}

export interface GitStatus {
  repoName: string
  root: string
  branch: string
  ahead: number
  behind: number
  branches: GitBranch[]
  remotes: string[]
  tags: string[]
  changes: GitChange[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: number
}

// ── 샘플 상태 ─────────────────────────────────────────────────────────────────

export const GIT_STATUS: GitStatus = {
  repoName: 'AgentDeck',
  root: 'C:/Dev/CustomGUI_Agent',
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
    { path: 'src/renderer/src/components/GitModal.tsx', kind: 'add' },
    { path: 'src/renderer/src/components/GitModal.css', kind: 'add' },
    { path: 'src/renderer/src/lib/gitSampleData.ts', kind: 'add' },
    { path: 'src/renderer/src/layout/Shell.tsx', kind: 'modify' },
    { path: 'src/renderer/src/components/FileExplorer.tsx', kind: 'modify' },
  ],
}

// ── 샘플 커밋 (5~8개) ────────────────────────────────────────────────────────

const now = Date.now()
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export const GIT_COMMITS: GitCommit[] = [
  {
    hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    shortHash: 'a1b2c3d',
    subject: 'feat: GitModal 시각 구현 (F11-01)',
    body: '정적 샘플 데이터 기반. history/changes 뷰. 최대화 토글. Esc/오버레이 닫기.\nnew IPC 0. git 백엔드 = M3 후속.',
    author: '개발자',
    date: now - 30 * MIN,
  },
  {
    hash: 'b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3',
    shortHash: 'b2c3d4e',
    subject: 'feat: FileExplorer git 버튼 추가',
    body: 'IconGitBranch 버튼 → onOpenGit prop. Shell gitOpen state 연결.',
    author: '개발자',
    date: now - 2 * HOUR,
  },
  {
    hash: 'c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4',
    shortHash: 'c3d4e5f',
    subject: 'refactor: AgentPanel 서브에이전트 상세 표시',
    body: 'agentpanel-detail 컴포넌트 추가. 툴호출 카드 접이식.',
    author: '개발자',
    date: now - 5 * HOUR,
  },
  {
    hash: 'd4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5',
    shortHash: 'd4e5f6a',
    subject: 'feat: RecentFiles 탭 바 (F10)',
    body: '최근 파일 탭 + 드래그 재정렬 + 닫기.',
    author: '개발자',
    date: now - 1 * DAY,
  },
  {
    hash: 'e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6',
    shortHash: 'e5f6a7b',
    subject: 'fix: SettingsModal 테마 토큰 회귀 수정',
    body: 'OKLCH 다크 테마 accent-soft 토큰 누락 수정.',
    author: '개발자',
    date: now - 2 * DAY,
  },
  {
    hash: 'f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7',
    shortHash: 'f6a7b8c',
    subject: 'feat: Sidebar 세션 목록 + 컨텍스트 메뉴 (F8)',
    body: '세션 행 rename/삭제. 모드 토글(단일/멀티). 샘플 세션 5개.',
    author: '개발자',
    date: now - 3 * DAY,
  },
  {
    hash: '07a8b9c0d1e2f07a8b9c0d1e2f07a8b9c0d1e2f0',
    shortHash: '07a8b9c',
    subject: 'feat: CodeViewer CodeMirror 6 통합 (M2)',
    body: 'CodeMirror 6 에디터 래퍼. 파일타입별 언어 자동 감지. 읽기전용.',
    author: '개발자',
    date: now - 5 * DAY,
  },
]

// ── 커밋별 변경 파일 (hash → GitChange[]) ────────────────────────────────────

export const GIT_COMMIT_FILES: Record<string, GitChange[]> = {
  a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2: [
    { path: 'src/renderer/src/components/GitModal.tsx', kind: 'add' },
    { path: 'src/renderer/src/components/GitModal.css', kind: 'add' },
    { path: 'src/renderer/src/lib/gitSampleData.ts', kind: 'add' },
    { path: 'src/renderer/src/layout/Shell.tsx', kind: 'modify' },
    { path: 'src/renderer/src/components/FileExplorer.tsx', kind: 'modify' },
    { path: 'tests/renderer/gitmodal.test.tsx', kind: 'add' },
  ],
  b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3: [
    { path: 'src/renderer/src/components/FileExplorer.tsx', kind: 'modify' },
    { path: 'src/renderer/src/layout/Shell.tsx', kind: 'modify' },
  ],
  c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4: [
    { path: 'src/renderer/src/components/AgentPanel.tsx', kind: 'modify' },
    { path: 'src/renderer/src/components/AgentPanelDetail.tsx', kind: 'add' },
  ],
  d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5: [
    { path: 'src/renderer/src/components/RecentFiles.tsx', kind: 'add' },
    { path: 'src/renderer/src/components/RecentFiles.css', kind: 'add' },
    { path: 'src/renderer/src/layout/Shell.tsx', kind: 'modify' },
  ],
  e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6: [
    { path: 'src/renderer/src/components/SettingsModal.tsx', kind: 'modify' },
    { path: 'src/renderer/src/theme/tokens.css', kind: 'modify' },
  ],
  f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7: [
    { path: 'src/renderer/src/components/Sidebar.tsx', kind: 'add' },
    { path: 'src/renderer/src/components/Sidebar.css', kind: 'add' },
    { path: 'src/renderer/src/lib/sidebarSampleData.ts', kind: 'add' },
  ],
  '07a8b9c0d1e2f07a8b9c0d1e2f07a8b9c0d1e2f0': [
    { path: 'src/renderer/src/components/CodeViewer.tsx', kind: 'add' },
    { path: 'src/renderer/src/layout/CodeViewerPane.tsx', kind: 'add' },
  ],
}
