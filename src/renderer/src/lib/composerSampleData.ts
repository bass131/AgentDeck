/**
 * composerSampleData.ts — F9 컴포저 리치 트레이 정적 샘플 데이터.
 *
 * P10 이후: SLASH_COMMANDS / SAMPLE_SKILLS 제거 — 실 IPC(listSlashCommands/listSkills)로 대체.
 * SAMPLE_MENTION_TREE: 폴더/파일 트리 샘플(@멘션 팔레트용) — 테스트/개발에서 사용.
 * SAMPLE_THUMB_DATA_URL: 첨부 썸네일 SVG 플레이스홀더.
 *
 * CRITICAL: window.api 호출 0. 로컬 상수만.
 */

// ── 샘플 멘션 트리 ──────────────────────────────────────────────────────────

export type MentionKind = 'dir' | 'file'

export interface MentionEntry {
  kind: MentionKind
  name: string
  /** 전체 경로 (멘션 삽입 시 사용) */
  full: string
  /** 파일의 경우 부모 디렉토리 경로 (검색 모드에서 표시) */
  dir?: string
}

/**
 * 루트 엔트리 — 루트 폴더 진입점 + 루트 파일 몇 개.
 * dir 선택 → 해당 dir의 children 표시(드릴다운).
 */
export const SAMPLE_MENTION_ROOT: MentionEntry[] = [
  { kind: 'dir', name: 'src', full: 'src/', dir: undefined },
  { kind: 'dir', name: 'tests', full: 'tests/', dir: undefined },
  { kind: 'dir', name: 'docs', full: 'docs/', dir: undefined },
  { kind: 'file', name: 'package.json', full: 'package.json', dir: '' },
  { kind: 'file', name: 'CLAUDE.md', full: 'CLAUDE.md', dir: '' },
  { kind: 'file', name: 'tsconfig.json', full: 'tsconfig.json', dir: '' },
]

/** 각 dir의 자식 엔트리 맵 (dir full → children). */
export const SAMPLE_MENTION_CHILDREN: Record<string, MentionEntry[]> = {
  'src/': [
    { kind: 'dir', name: 'renderer', full: 'src/renderer/', dir: 'src/' },
    { kind: 'dir', name: 'main', full: 'src/main/', dir: 'src/' },
    { kind: 'dir', name: 'shared', full: 'src/shared/', dir: 'src/' },
    { kind: 'file', name: 'index.ts', full: 'src/index.ts', dir: 'src/' },
  ],
  'src/renderer/': [
    { kind: 'dir', name: 'src', full: 'src/renderer/src/', dir: 'src/renderer/' },
    { kind: 'file', name: 'index.html', full: 'src/renderer/index.html', dir: 'src/renderer/' },
  ],
  'src/renderer/src/': [
    { kind: 'dir', name: 'components', full: 'src/renderer/src/components/', dir: 'src/renderer/src/' },
    { kind: 'dir', name: 'store', full: 'src/renderer/src/store/', dir: 'src/renderer/src/' },
    { kind: 'dir', name: 'lib', full: 'src/renderer/src/lib/', dir: 'src/renderer/src/' },
    { kind: 'file', name: 'App.tsx', full: 'src/renderer/src/App.tsx', dir: 'src/renderer/src/' },
  ],
  'src/renderer/src/components/': [
    { kind: 'file', name: 'Composer.tsx', full: 'src/renderer/src/components/Composer.tsx', dir: 'src/renderer/src/components/' },
    { kind: 'file', name: 'Conversation.tsx', full: 'src/renderer/src/components/Conversation.tsx', dir: 'src/renderer/src/components/' },
    { kind: 'file', name: 'icons.tsx', full: 'src/renderer/src/components/icons.tsx', dir: 'src/renderer/src/components/' },
  ],
  'src/main/': [
    { kind: 'file', name: 'index.ts', full: 'src/main/index.ts', dir: 'src/main/' },
    { kind: 'file', name: 'ipc.ts', full: 'src/main/00_ipc.ts', dir: 'src/main/' },
  ],
  'src/shared/': [
    { kind: 'file', name: 'ipc.ts', full: 'src/shared/ipc.ts', dir: 'src/shared/' },
    { kind: 'file', name: 'AgentEvent.ts', full: 'src/shared/AgentEvent.ts', dir: 'src/shared/' },
  ],
  'tests/': [
    { kind: 'dir', name: 'renderer', full: 'tests/renderer/', dir: 'tests/' },
    { kind: 'file', name: 'setup.ts', full: 'tests/setup.ts', dir: 'tests/' },
  ],
  'tests/renderer/': [
    { kind: 'file', name: 'composer.test.tsx', full: 'tests/renderer/composer.test.tsx', dir: 'tests/renderer/' },
    { kind: 'file', name: 'conversation.test.tsx', full: 'tests/renderer/conversation.test.tsx', dir: 'tests/renderer/' },
  ],
  'docs/': [
    { kind: 'file', name: 'PRD.md', full: 'docs/PRD.md', dir: 'docs/' },
    { kind: 'file', name: 'ARCHITECTURE.md', full: 'docs/ARCHITECTURE.md', dir: 'docs/' },
    { kind: 'file', name: 'UI_GUIDE.md', full: 'docs/UI_GUIDE.md', dir: 'docs/' },
  ],
}

/**
 * SAMPLE_MENTION_TREE — 전체 플랫 목록(검색 모드에서 사용).
 * 루트 엔트리 + 모든 children을 합산.
 */
export const SAMPLE_MENTION_TREE: MentionEntry[] = [
  ...SAMPLE_MENTION_ROOT,
  ...Object.values(SAMPLE_MENTION_CHILDREN).flat(),
]

/** 샘플 첨부 썸네일 data URL (작은 SVG 플레이스홀더). */
export const SAMPLE_THUMB_DATA_URL =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="62" height="62" viewBox="0 0 62 62">' +
    '<rect width="62" height="62" rx="10" fill="#e8e0d8"/>' +
    '<rect x="14" y="14" width="34" height="34" rx="6" fill="#c8bfb6"/>' +
    '<circle cx="23" cy="24" r="4" fill="#a09588"/>' +
    '<path d="M14 44 l14-14 8 8 6-6 6 6" stroke="#a09588" stroke-width="2" fill="none"/>' +
    '</svg>'
  )
