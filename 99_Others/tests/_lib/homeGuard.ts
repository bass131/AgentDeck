/**
 * homeGuard.ts — 테스트 격리 전역 게이트의 순수 함수 (BZ P02 · 백로그 21①)
 *
 * 무엇을 하는가: 한 디렉토리의 상태를 스냅샷(`snapshotDir`)하고, 두 스냅샷을 대조
 * (`diffSnapshot`)해 **추가·수정·삭제**를 목록으로 돌려준다. `globalSetup.ts` 가 이걸
 * 써서 vitest 실행 전후의 `~/.agentdeck-dev` 를 비교하고, 차이가 있으면 실행 전체를
 * red 로 만든다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ 한계 — 이 도구가 *하지 못하는 것* (Codex 교차 리뷰 축 4 반영, 2026-07-27)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   **시작·종료 스냅샷 대조 = 순 변화(net change)만 검출한다.**
 *   생성→삭제 · 수정→원상복구처럼 **종료 상태가 시작과 같아지는 일시 쓰기는 미탐**이다.
 *   즉 이 게이트는 *사전 차단*이 아니라 **침묵 깨기**다 — 피해를 막는 게 아니라, 피해가
 *   남았을 때 조용히 green 이 되는 상태를 끝낸다(백로그 21 사고의 본질은 "홈을 덮고도
 *   green" 이었다).
 *
 *   모든 순간의 쓰기를 잡으려면 파일 감시(watcher)나 제한 권한 실행 같은 **다른 설계**가
 *   필요하다 — 비용·오탐이 다른 층의 문제라 별도 백로그 항목으로 분리했다(BZ P07 신규 등재,
 *   CI 제한 권한 항목).
 *
 *   또 하나: e2e(playwright)는 vitest globalSetup 밖이라 이 게이트가 커버하지 않는다.
 *
 * ── 설계 선택 (trade-off) ─────────────────────────────────────────────────────
 *   - 비교 축 = **size + mtimeMs**. 내용 해시(hash)가 더 강하지만, 같은 초 안의 덮어쓰기를
 *     size·mtime 병용으로 대부분 잡을 수 있고 감시 대상 파일 수가 작아(config 1 + engines
 *     폴더) 비용 차이는 무시 가능하다. 해시는 필요해지면 이 모듈 안에서만 바꾸면 된다.
 *   - fs 는 **주입 가능**(`GuardFs`)하되 기본값은 실제 `node:fs`(`nodeGuardFs`). 이 모듈의
 *     존재 이유가 "fs 모킹이 빗나가도 green" 부류를 잡는 것이라, 자기 자신의 테스트는
 *     모킹이 아니라 임시 디렉토리로 한다(`homeGuard.test.ts` 상단 주석).
 *   - 디렉토리는 **존재만** 추적한다. 디렉토리 mtime 은 자식이 바뀔 때마다 흔들려서
 *     자식 파일 diff 와 중복 잡음이 된다.
 */

import nodeFsDefault from 'node:fs'
import nodePath from 'node:path'

// ── 주입 가능한 최소 fs 인터페이스 ────────────────────────────────────────────

/** `readdirSync(..., { withFileTypes: true })` 결과를 평평한 데이터로 환원한 형태 */
export interface GuardDirent {
  name: string
  isDirectory: boolean
  isFile: boolean
}

/** homeGuard 가 필요로 하는 fs 능력의 전부 (가짜 구현 주입 가능) */
export interface GuardFs {
  existsSync(p: string): boolean
  readdirSync(p: string): GuardDirent[]
  statSync(p: string): { size: number; mtimeMs: number }
}

/** 실제 `node:fs` 어댑터 — 오버로드 없는 좁은 형태로 감싼다(구조적 타입 마찰 회피) */
export const nodeGuardFs: GuardFs = {
  existsSync: (p) => nodeFsDefault.existsSync(p),
  readdirSync: (p) =>
    nodeFsDefault.readdirSync(p, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
    })),
  statSync: (p) => {
    const st = nodeFsDefault.statSync(p)
    return { size: st.size, mtimeMs: st.mtimeMs }
  },
}

// ── 스냅샷 ────────────────────────────────────────────────────────────────────

export type SnapshotEntry = { kind: 'file'; size: number; mtimeMs: number } | { kind: 'dir' }

export interface DirSnapshot {
  /** 감시 대상 절대경로 */
  dir: string
  /** 대상 디렉토리 자체의 존재 여부 (부재도 정당한 상태다 — 종료 시 생성되면 added) */
  exists: boolean
  /** 상대경로(POSIX 슬래시) → 항목. 디렉토리도 항목으로 들어간다(빈 폴더 생성 검출) */
  entries: Record<string, SnapshotEntry>
}

/**
 * 디렉토리를 재귀 순회해 스냅샷을 만든다.
 *
 * 순회 중 사라진 항목(경합)은 **건너뛴다** — 그 자체가 일시 쓰기라 어차피 이 도구의
 * 한계 범위(위 주석) 안이고, 스냅샷 생성이 예외로 죽으면 게이트가 통째로 무력해진다.
 */
export function snapshotDir(dir: string, fs: GuardFs = nodeGuardFs): DirSnapshot {
  const snap: DirSnapshot = { dir, exists: false, entries: {} }
  if (!fs.existsSync(dir)) return snap
  snap.exists = true
  walk(dir, '', fs, snap.entries)
  return snap
}

function walk(
  absDir: string,
  relPrefix: string,
  fs: GuardFs,
  out: Record<string, SnapshotEntry>
): void {
  let dirents: GuardDirent[]
  try {
    dirents = fs.readdirSync(absDir)
  } catch {
    return // 읽을 수 없는 디렉토리는 건너뛴다(권한·경합)
  }
  for (const d of dirents) {
    const abs = nodePath.join(absDir, d.name)
    const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name
    if (d.isDirectory) {
      out[rel] = { kind: 'dir' }
      walk(abs, rel, fs, out)
      continue
    }
    // 파일 및 그 외(심볼릭 링크 등)는 stat 으로 환원해 파일 항목으로 다룬다
    try {
      const st = fs.statSync(abs)
      out[rel] = { kind: 'file', size: st.size, mtimeMs: st.mtimeMs }
    } catch {
      /* 순회 중 사라진 항목 — 건너뛴다 */
    }
  }
}

// ── 대조 ──────────────────────────────────────────────────────────────────────

export interface DiffEntry {
  kind: 'added' | 'modified' | 'removed'
  /** 상대경로(POSIX). 감시 대상 디렉토리 자신은 `'.'` */
  path: string
  /** 사람이 읽는 상세 — 무엇이 어떻게 달라졌는지(침묵 금지) */
  detail: string
}

/**
 * 두 스냅샷의 차이를 경로 사전순으로 돌려준다. 차이가 없으면 빈 배열.
 * 디렉토리 자체의 생성·삭제는 `'.'` 항목으로 먼저 보고한다.
 */
export function diffSnapshot(before: DirSnapshot, after: DirSnapshot): DiffEntry[] {
  const out: DiffEntry[] = []

  if (!before.exists && after.exists) {
    out.push({ kind: 'added', path: '.', detail: '감시 대상 디렉토리가 새로 생성됨' })
  } else if (before.exists && !after.exists) {
    out.push({ kind: 'removed', path: '.', detail: '감시 대상 디렉토리가 삭제됨' })
    return out // 통째로 사라졌으면 자식 목록은 잡음일 뿐이다
  }

  const paths = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])
  const children: DiffEntry[] = []

  for (const p of paths) {
    const b = before.entries[p]
    const a = after.entries[p]

    if (!b && a) {
      children.push({ kind: 'added', path: p, detail: describe(a) + ' 생성됨' })
      continue
    }
    if (b && !a) {
      children.push({ kind: 'removed', path: p, detail: describe(b) + ' 삭제됨' })
      continue
    }
    if (!b || !a) continue

    if (b.kind !== a.kind) {
      children.push({ kind: 'modified', path: p, detail: `종류 변경: ${b.kind} → ${a.kind}` })
      continue
    }
    if (b.kind === 'file' && a.kind === 'file') {
      const notes: string[] = []
      if (b.size !== a.size) notes.push(`size ${b.size} → ${a.size}`)
      if (b.mtimeMs !== a.mtimeMs) notes.push(`mtime ${b.mtimeMs} → ${a.mtimeMs}`)
      if (notes.length > 0) {
        children.push({ kind: 'modified', path: p, detail: notes.join(', ') })
      }
    }
  }

  children.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
  return [...out, ...children]
}

function describe(e: SnapshotEntry): string {
  return e.kind === 'dir' ? '디렉토리가' : `파일(size ${e.size})이`
}

/** 에러 메시지용 서식 — 어느 디렉토리의 어느 항목이 어떻게 달라졌는지 전부 싣는다 */
export function formatDiff(dir: string, diff: DiffEntry[]): string {
  const lines = diff.map((d) => `  - [${d.kind}] ${d.path} — ${d.detail}`)
  return [`감시 대상: ${dir}`, `변화 ${diff.length}건:`, ...lines].join('\n')
}
