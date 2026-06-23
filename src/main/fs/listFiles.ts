/**
 * listFiles.ts — @멘션 팔레트용 프로젝트 파일 플랫 목록
 *
 * 원본: C:/Dev/AgentCodeGUI/src/main/files.ts · listProjectFiles 1:1 이식
 * (listDir 제외 — 불필요)
 *
 * CRITICAL(신뢰경계): 이 모듈은 인자로 받은 root만 순회한다.
 *   호출자(ipc/index.ts)가 반드시 main의 _currentWorkspaceRoot를 전달해야 하며
 *   renderer에서 온 임의 경로를 직접 넘기면 안 된다.
 *   root 범위 밖 탈출 가능성 없음 — 순회가 root 하위만 descend.
 */

import fs from 'node:fs'
import path from 'node:path'

// Directories we never descend into when building the "@" mention file list —
// heavy, generated, or VCS internals that would swamp the picker and slow the walk.
// 원본 AgentCodeGUI/src/main/files.ts SKIP_DIRS 전체 집합 1:1 이식.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'out', 'build', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.vite',
  '.idea', '.vs', '.gradle', 'bin', 'obj', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.expo', 'Pods', '.dart_tool'
])

// Hidden dot-directories worth keeping — they hold real, mention-worthy files
// (workflows, skills, MCP config) unlike the noise SKIP_DIRS already drops.
// 원본 AgentCodeGUI/src/main/files.ts KEEP_DOT_DIRS 전체 집합 1:1 이식.
const KEEP_DOT_DIRS = new Set(['.github', '.claude', '.vscode'])

const MAX_FILES = 6000 // cap so a giant repo can't stall the walk or the renderer

/**
 * Walk `root` breadth-first and return project-relative POSIX file paths, skipping
 * heavy/generated directories and most hidden dot-dirs. Breadth-first ordering keeps
 * shallow files (the ones a user most often mentions) near the front, and MAX_FILES
 * bounds the work so the "@" mention palette stays responsive even in large repos.
 *
 * 원본 AgentCodeGUI/src/main/files.ts · listProjectFiles(cwd) 1:1 이식
 * (파라미터 이름만 cwd→root로 변경, 동작 동일).
 *
 * @param root  워크스페이스 절대 경로 (main이 보유한 _currentWorkspaceRoot).
 *              빈 문자열이면 즉시 [] 반환.
 * @returns     root 기준 상대 POSIX 경로(슬래시 구분자) 배열. 최대 MAX_FILES 개.
 */
export async function listProjectFiles(root: string): Promise<string[]> {
  if (!root) return []
  const out: string[] = []
  const queue: string[] = ['']
  while (queue.length && out.length < MAX_FILES) {
    const rel = queue.shift() as string
    const abs = rel ? path.join(root, rel) : root
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true })
    } catch {
      continue // unreadable dir (perms, race) — just skip it
    }
    const dirs: string[] = []
    for (const e of entries) {
      const name = e.name
      // 항상 POSIX 슬래시 구분자 사용 (Windows 백슬래시 배제)
      const childRel = rel ? rel + '/' + name : name
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        if (name.startsWith('.') && !KEEP_DOT_DIRS.has(name)) continue
        dirs.push(childRel)
      } else if (e.isFile()) {
        out.push(childRel)
        if (out.length >= MAX_FILES) break
      }
    }
    // queue this dir's children after the ones already waiting → breadth-first
    for (const d of dirs) queue.push(d)
  }
  return out
}
