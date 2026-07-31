import { existsSync, statSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { resolveSafe } from './workspace'
import type { FsReadResponse } from '../../shared/ipcContract'

const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.json': 'json', '.md': 'markdown', '.markdown': 'markdown',
  '.css': 'css', '.scss': 'css', '.less': 'css', '.html': 'html', '.htm': 'html',
  '.xml': 'xml', '.svg': 'xml', '.yml': 'yaml', '.yaml': 'yaml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.sql': 'sql',
  '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.toml': 'toml',
  '.txt': 'text', '.log': 'text'
}

export function detectLanguage(p: string): string {
  return LANG_BY_EXT[extname(p).toLowerCase()] ?? 'text'
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon'
}

function isBinaryBuffer(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export interface ReadOpts {
  asBinary?: boolean
  maxBytes?: number
}

export function readFileSafe(root: string, p: string, opts: ReadOpts = {}): FsReadResponse {
  const maxBytes = opts.maxBytes ?? 1024 * 1024

  const safe = resolveSafe(root, p)
  if (!safe) return { kind: 'not-found' }
  if (!existsSync(safe)) return { kind: 'not-found' }

  const st = statSync(safe)
  if (!st.isFile()) return { kind: 'not-found' }

  const ext = extname(safe).toLowerCase()

  if (opts.asBinary) {
    const mime = MIME_BY_EXT[ext]
    if (!mime) return { kind: 'binary-skipped' }
    if (st.size > maxBytes) return { kind: 'too-large' }
    const buf = readFileSync(safe)
    return { kind: 'binary', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime }
  }

  if (st.size > maxBytes) return { kind: 'too-large' }
  const buf = readFileSync(safe)
  if (isBinaryBuffer(buf)) return { kind: 'binary-skipped' }
  return { kind: 'text', content: buf.toString('utf-8'), language: detectLanguage(p) }
}
