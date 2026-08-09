export interface LspServerEntry {
  id: 'ts' | 'py' | 'cs' | 'cpp'
  langs: string
  exts: string
  state: 'bundled' | 'installed' | 'download'
  requires?: string
  kind: 'bundled' | 'download'
}

export const LSP_SERVERS: LspServerEntry[] = [
  {
    id: 'ts',
    langs: 'TypeScript / JavaScript',
    exts: '.ts .tsx .js .jsx .mjs .cjs',
    state: 'bundled',
    kind: 'bundled',
  },
  {
    id: 'py',
    langs: 'Python',
    exts: '.py .pyi .ipynb',
    state: 'bundled',
    kind: 'bundled',
  },
  {
    id: 'cs',
    langs: 'C#',
    exts: '.cs .csproj .sln',
    state: 'download',
    requires: '.NET SDK 필요',
    kind: 'download',
  },
  {
    id: 'cpp',
    langs: 'C / C++',
    exts: '.c .cpp .cc .h .hpp',
    state: 'download',
    kind: 'download',
  },
]

export const LSP_BADGE: Record<LspServerEntry['id'], string> = {
  ts: 'a.ts',
  py: 'a.py',
  cs: 'a.cs',
  cpp: 'a.cpp',
}
