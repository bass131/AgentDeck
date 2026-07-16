/**
 * toolKind.ts — 도구명 → {kind, verb, 색} + 입력에서 대상 추출 (순수, F3-03).
 *
 * store ToolCard는 name/input만 가지므로 표시용 kind·verb·색·target을 여기서 파생.
 * 색은 종류별 식별 토큰(인라인 hex 0).
 */

/**
 * GAP1 P02(a): 'git' kind 신설 — worktree 이동 도구(enterworktree/exitworktree)는 기존
 * 7종(read/write/edit/bash/web/search/mcp) 어디에도 의미상 맞지 않아 억지 매핑을 피하려고
 * 최소 1개만 추가한다(anti-slop — 무분별한 kind 증식 금지, 소비처 grep 전수 후 정합 완료).
 */
export type ToolKind = 'read' | 'write' | 'edit' | 'bash' | 'web' | 'search' | 'mcp' | 'git' | 'other'

export interface ToolMeta {
  kind: ToolKind
  verb: string
  color: string
}

const MAP: Record<string, ToolMeta> = {
  read: { kind: 'read', verb: 'Read', color: 'var(--blue)' },
  write: { kind: 'write', verb: 'Write', color: 'var(--green)' },
  edit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  multiedit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  notebookedit: { kind: 'edit', verb: 'Edit', color: 'var(--accent-2)' },
  bash: { kind: 'bash', verb: 'Bash', color: 'var(--violet)' },
  bashoutput: { kind: 'bash', verb: 'Bash', color: 'var(--violet)' },
  glob: { kind: 'search', verb: 'Glob', color: 'var(--yellow)' },
  grep: { kind: 'search', verb: 'Grep', color: 'var(--yellow)' },
  webfetch: { kind: 'web', verb: 'Fetch', color: 'var(--cyan)' },
  websearch: { kind: 'web', verb: 'Search', color: 'var(--cyan)' },
  task: { kind: 'mcp', verb: 'Task', color: 'var(--rose)' },
  // GAP1 P02(a): 신형 SDK 도구 10종 — 'other' 폴백 해소(T-09). 정규화 키(소문자·영문자만)
  // 로 매칭되므로 아래 리터럴은 모두 구분자 제거형이다(toolMetaFor의 key 생성 규칙과 동일).
  killshell: { kind: 'bash', verb: 'Kill', color: 'var(--violet)' },
  notebookread: { kind: 'read', verb: 'Notebook', color: 'var(--blue)' },
  taskstop: { kind: 'mcp', verb: 'Stop', color: 'var(--rose)' },
  taskget: { kind: 'mcp', verb: 'Task', color: 'var(--rose)' },
  taskoutput: { kind: 'mcp', verb: 'Output', color: 'var(--rose)' },
  monitor: { kind: 'mcp', verb: 'Monitor', color: 'var(--rose)' },
  enterworktree: { kind: 'git', verb: 'Worktree', color: 'var(--teal)' },
  exitworktree: { kind: 'git', verb: 'Worktree', color: 'var(--teal)' },
  toolsearch: { kind: 'search', verb: 'Tools', color: 'var(--yellow)' },
  waitformcpservers: { kind: 'mcp', verb: 'MCP', color: 'var(--rose)' },
}

/**
 * mcpToolLabel — `mcp__server__tool` 원시 이름 → '서버 · 도구' 사람읽기 라벨(순수, GAP1 P01c).
 *
 * 접두사 파싱(split 기반 — 정규식보다 견고): 첫 세그먼트가 'mcp'이고 세그먼트가 3개 이상일
 * 때만 변환한다. server = 2번째 세그먼트, tool = 나머지 전부(재조합, 도구명 자체에 '__'가
 * 섞여도 안전). 패턴이 아니면(mcp 접두사 없음·세그먼트 부족) 판별 실패로 보고 원본 그대로
 * 반환한다 — 안전 폴백(렌더 깨짐 0).
 *
 * 전체 서버 그룹핑 UI(여러 mcp 도구를 서버별로 묶는 것)는 GAP1 범위 밖(M-B T-05) — 이 함수는
 * 개별 verb 표시 문자열 정규화만 담당한다.
 */
export function mcpToolLabel(name: string): string {
  if (!name) return name
  const parts = name.split('__')
  if (parts.length < 3 || parts[0].toLowerCase() !== 'mcp') return name
  const server = parts[1]
  const tool = parts.slice(2).join('__')
  if (!server || !tool) return name
  return `${server} · ${tool}`
}

/** 도구명 → 표시 메타. 대소문자/구분자(_,-,공백) 무시. */
export function toolMetaFor(name: string): ToolMeta {
  const key = (name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (MAP[key]) return MAP[key]
  // mcp__* 류는 mcp — verb는 원시 전체 이름 대신 '서버 · 도구' 사람읽기 라벨(GAP1 P01c).
  if (key.startsWith('mcp')) return { kind: 'mcp', verb: mcpToolLabel(name), color: 'var(--rose)' }
  return { kind: 'other', verb: name || '도구', color: 'var(--text-3)' }
}

/** 입력에서 대상 문자열 추출(파일/명령/패턴/URL/쿼리). 없으면 ''. */
export function toolTarget(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    for (const k of ['file_path', 'path', 'pattern', 'command', 'url', 'query', 'prompt']) {
      const v = o[k]
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return ''
}
