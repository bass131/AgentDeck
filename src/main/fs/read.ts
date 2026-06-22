/**
 * read.ts — 파일 읽기(텍스트/바이너리) 순수 모듈.
 *
 * CRITICAL: electron 미import → vitest node 테스트 가능.
 * 신뢰경계: resolveSafe(M1)로 경로 탈출 방어. 탈출/미존재는 모두 not-found로 은닉.
 * fs.read 단일 채널(텍스트+바이너리) 백엔드 로직.
 */
import { existsSync, statSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { resolveSafe } from './workspace'
import type { FsReadResponse } from '../../shared/ipc-contract'

// ── 언어 탐지 ─────────────────────────────────────────────────────────────────

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

/** 파일 경로 확장자 → CodeMirror 언어 힌트. 미지원은 'text'. */
export function detectLanguage(p: string): string {
  return LANG_BY_EXT[extname(p).toLowerCase()] ?? 'text'
}

// ── 이미지 MIME ───────────────────────────────────────────────────────────────

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

// ── readFileSafe ──────────────────────────────────────────────────────────────

export interface ReadOpts {
  /** true면 이미지를 data URL로 읽음 */
  asBinary?: boolean
  /** 텍스트 최대 바이트(기본 1MB) */
  maxBytes?: number
}

/**
 * 루트 기준 안전 파일 읽기.
 * @param root  신뢰 루트(절대 경로) — main이 설정(워크스페이스/레퍼런스)
 * @param p     untrusted 상대 경로
 */
export function readFileSafe(root: string, p: string, opts: ReadOpts = {}): FsReadResponse {
  const maxBytes = opts.maxBytes ?? 1024 * 1024

  const safe = resolveSafe(root, p)
  if (!safe) return { kind: 'not-found' } // 경로 탈출 → 은닉
  if (!existsSync(safe)) return { kind: 'not-found' }

  const st = statSync(safe)
  if (!st.isFile()) return { kind: 'not-found' }

  const ext = extname(safe).toLowerCase()

  // 바이너리(이미지) 요청
  if (opts.asBinary) {
    const mime = MIME_BY_EXT[ext]
    if (!mime) return { kind: 'binary-skipped' } // 이미지 화이트리스트 외
    if (st.size > maxBytes) return { kind: 'too-large' }
    const buf = readFileSync(safe)
    return { kind: 'binary', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime }
  }

  // 텍스트 요청
  if (st.size > maxBytes) return { kind: 'too-large' }
  const buf = readFileSync(safe)
  if (isBinaryBuffer(buf)) return { kind: 'binary-skipped' }
  return { kind: 'text', content: buf.toString('utf-8'), language: detectLanguage(p) }
}
