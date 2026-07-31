export type MentionKind = 'dir' | 'file'

export interface MentionEntry {
  kind: MentionKind
  name: string
  full: string
  dir?: string
}

export const SAMPLE_MENTION_ROOT: MentionEntry[] = [
  { kind: 'dir', name: 'src', full: 'src/', dir: undefined },
  { kind: 'dir', name: 'tests', full: 'tests/', dir: undefined },
  { kind: 'dir', name: 'docs', full: 'docs/', dir: undefined },
  { kind: 'file', name: 'package.json', full: 'package.json', dir: '' },
  { kind: 'file', name: 'CLAUDE.md', full: 'CLAUDE.md', dir: '' },
  { kind: 'file', name: 'tsconfig.json', full: 'tsconfig.json', dir: '' },
]

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

export const SAMPLE_MENTION_TREE: MentionEntry[] = [
  ...SAMPLE_MENTION_ROOT,
  ...Object.values(SAMPLE_MENTION_CHILDREN).flat(),
]

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
