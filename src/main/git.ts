/**
 * git.ts — Git read 백엔드 (순수 모듈, electron import 0)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 * 원본 AgentCodeGUI/src/main/git.ts 의 read 6함수를 미러하되,
 * diff 타입은 우리 프로젝트 DiffLine(ipc-contract.ts 단일 진실 공급원)으로 교체.
 *
 * 설계:
 *   - git() : execFile 래퍼. -c core.quotepath=false(한글 경로 이스케이프 방지),
 *             maxBuffer 16MB, windowsHide, timeout 30s.
 *   - gitTry(): null-반환 안전 래퍼.
 *   - 레포 루트 캐시: cwd별 Map (same-dir 반복 탐색 방지).
 *
 * write 함수(commit/push/pull)는 3b에서 구현 — 이 파일에 포함 금지.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  GitChange,
  GitCommit,
  GitFileAt,
  GitFileStatus,
  GitStatus,
  DiffLine,
} from '../shared/ipc-contract'
import { computeDiff } from './fs/diff'

// 뷰어에서 1.5MB 이상 파일은 하이라이팅을 끄므로 이 임계치를 공유.
const MAX_FILE = 1_500_000

// ── exec 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * git 명령을 실행하고 stdout을 반환한다.
 *
 * -c core.quotepath=false: 한글/유니코드 경로가 "\354…" 형식으로 이스케이프되지 않게 한다.
 * maxBuffer 16MB: 큰 레포의 로그/diff에서 버퍼 초과를 방지.
 * windowsHide: Windows에서 명령창이 깜빡이지 않게.
 * timeout: 기본 30초 (대형 push는 호출부가 명시적으로 늘린다).
 */
function git(cwd: string, args: string[], timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.quotepath=false', ...args],
      { cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || '').trim() || 'git 실행 실패'))
        } else {
          resolve(stdout)
        }
      }
    )
  })
}

/**
 * git() 의 null-반환 안전 버전.
 * 명령 실패(비-git 디렉토리 포함) 시 null을 반환한다.
 */
async function gitTry(cwd: string, args: string[], timeout?: number): Promise<string | null> {
  try {
    return await git(cwd, args, timeout)
  } catch {
    return null
  }
}

// ── gitRoot — cwd별 캐시 + rev-parse 탐색 ────────────────────────────────────

/**
 * cwd → 레포 최상위 경로 캐시.
 * 키는 슬래시 정규화 + 소문자(Windows 경로 대소문자 무감각 대응).
 * force=true 시 캐시를 무시하고 재탐색 (에이전트가 git init 직후 갱신 등).
 */
const rootCache = new Map<string, string | null>()

/**
 * cwd 기준으로 .git 레포 최상위 절대 경로를 탐색한다.
 *
 * `rev-parse --show-toplevel` 이 상위 폴더 탐색·워크트리·서브모듈까지 처리한다.
 * 결과를 cwd별로 캐시하여 카드를 열 때마다 재탐색하지 않는다.
 *
 * @param cwd   탐색 시작 경로 (절대 경로 권장; 빈 문자열이면 null 반환)
 * @param force true면 캐시를 무시하고 재탐색
 */
export async function gitRoot(cwd: string, force = false): Promise<string | null> {
  if (!cwd) return null
  const key = cwd.replace(/[\\/]+/g, '/').toLowerCase()
  if (!force && rootCache.has(key)) return rootCache.get(key) ?? null
  const out = await gitTry(cwd, ['rev-parse', '--show-toplevel'], 10_000)
  const root = out ? path.normalize(out.trim()) : null
  rootCache.set(key, root)
  return root
}

// ── gitStatus — 브랜치 + ahead/behind + 변경 + 브랜치/원격/태그 목록 ──────────

/**
 * porcelain=v2 XY 코드에서 GitFileStatus를 결정한다.
 *
 * 워크트리 쪽 문자가 우선, 없으면(스테이지만 변경) 인덱스 쪽을 사용.
 * R=이름변경 / A=추가 / D=삭제 / 나머지=M(수정).
 */
function statusLetter(xy: string): GitFileStatus {
  const c = xy[1] !== '.' ? xy[1] : xy[0]
  if (c === 'A') return 'A'
  if (c === 'D') return 'D'
  if (c === 'R') return 'R'
  return 'M'
}

/**
 * 레포 상태 스냅샷을 반환한다.
 *
 * 처리 단계:
 *   1) `status -b --porcelain=v2` — 브랜치·ahead/behind·변경 파일 목록.
 *   2) detached HEAD 보정.
 *   3) `diff HEAD --numstat` — 추적 파일의 add/del 수치.
 *   4) 미추적(untracked) 파일의 줄 수 직접 계산.
 *   5) `branch --format` / `remote` / `tag --sort=-creatordate` — 브랜치/원격/태그 목록.
 *
 * @param root 레포 최상위 절대 경로 (gitRoot() 반환값)
 */
export async function gitStatus(root: string): Promise<GitStatus | null> {
  const raw = await gitTry(root, ['status', '-b', '--porcelain=v2', '--untracked-files=normal'])
  if (raw == null) return null

  let branch = ''
  let ahead = 0
  let behind = 0
  const changes: GitChange[] = []

  for (const line of raw.split('\n')) {
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      branch = line.slice(14).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line.startsWith('1 ')) {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parts = line.split(' ')
      changes.push({
        path: parts.slice(8).join(' '),
        status: statusLetter(parts[1]),
        add: null,
        del: null,
      })
    } else if (line.startsWith('2 ')) {
      // 2 <XY> … <path>\t<origPath> — 이름 변경
      const tab = line.indexOf('\t')
      const head = (tab >= 0 ? line.slice(0, tab) : line).split(' ')
      changes.push({ path: head.slice(9).join(' '), status: 'R', add: null, del: null })
    } else if (line.startsWith('? ')) {
      changes.push({ path: line.slice(2), status: 'A', add: null, del: null })
    }
  }

  // detached HEAD 보정: "(detached)" 대신 짧은 해시 표시
  if (branch === '(detached)') {
    branch = (await gitTry(root, ['rev-parse', '--short', 'HEAD']))?.trim() ?? 'detached'
  }

  // 추적 파일의 add/del 수치 (git diff HEAD --numstat)
  const numstat = await gitTry(root, ['diff', 'HEAD', '--numstat'])
  if (numstat) {
    const m = new Map<string, { add: number | null; del: number | null }>()
    for (const ln of numstat.split('\n')) {
      const [a, d, ...rest] = ln.split('\t')
      if (rest.length === 0) continue
      m.set(rest.join('\t'), {
        add: a === '-' ? null : Number(a),
        del: d === '-' ? null : Number(d),
      })
    }
    for (const c of changes) {
      const s = m.get(c.path)
      if (s) {
        c.add = s.add
        c.del = s.del
      }
    }
  }

  // 미추적(untracked) 파일의 줄 수 직접 계산
  await Promise.all(
    changes
      .filter((c) => c.status === 'A' && c.add == null)
      .map(async (c) => {
        try {
          const st = await fs.stat(path.join(root, c.path))
          if (st.size > MAX_FILE) return
          const text = await fs.readFile(path.join(root, c.path), 'utf8')
          if (!text.includes('\0')) {
            c.add = text.length ? text.replace(/\n$/, '').split('\n').length : 0
            c.del = 0
          }
        } catch {
          // 새 폴더 등 — 수치 없이 둔다
        }
      })
  )

  // 브랜치 목록 (현재 브랜치 포함)
  const branchesRaw = (await gitTry(root, ['branch', '--format=%(HEAD)\t%(refname:short)'])) ?? ''
  const branches = branchesRaw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [head, ...name] = l.split('\t')
      return { name: name.join('\t'), current: head === '*' }
    })
    .filter((b) => b.name)

  // 원격 목록
  const remotes = ((await gitTry(root, ['remote'])) ?? '').split('\n').filter(Boolean)

  // 태그 목록 (최신순, 최대 20개)
  const tags = ((await gitTry(root, ['tag', '--sort=-creatordate'])) ?? '')
    .split('\n')
    .filter(Boolean)
    .slice(0, 20)

  return { root, branch, ahead, behind, changes, branches, remotes, tags }
}

// ── gitLog — 커밋 목록 + pushed 판정 ──────────────────────────────────────────

/** 커밋 레코드 구분자 (ASCII 31 = Unit Separator) */
const SEP = '\x1f'
/** 레코드 구분자 (ASCII 30 = Record Separator) */
const REC = '\x1e'

/**
 * 커밋 목록을 최신순으로 반환한다.
 *
 * pushed 판정:
 *   - `rev-list @{upstream}..HEAD` 로 업스트림에 없는 커밋 해시 집합을 구한다.
 *   - 업스트림이 없으면(오류) 빈 집합 → 모두 pushed=true.
 *
 * @param root  레포 최상위 절대 경로
 * @param limit 최대 커밋 수 (기본 80)
 */
export async function gitLog(root: string, limit = 80): Promise<GitCommit[]> {
  const fmt = ['%H', '%h', '%an', '%at', '%D', '%s', '%b'].join('%x1f') + '%x1e'
  const raw = await gitTry(root, ['log', `--format=${fmt}`, '-n', String(limit)])
  if (raw == null) return []

  // 업스트림에 없는 커밋 집합 (없으면 빈 집합)
  const unpushed = new Set(
    ((await gitTry(root, ['rev-list', '@{upstream}..HEAD'])) ?? '').split('\n').filter(Boolean)
  )

  const commits: GitCommit[] = []
  for (const rec of raw.split(REC)) {
    const t = rec.replace(/^\n/, '')
    if (!t.trim()) continue
    const [hash, shortHash, author, at, refs, subject, body] = t.split(SEP)
    if (!hash) continue

    const tags = (refs ?? '')
      .split(', ')
      .filter((r) => r.startsWith('tag: '))
      .map((r) => r.slice(5))

    commits.push({
      hash: hash.trim(),
      shortHash: shortHash?.trim() ?? '',
      author: author ?? '',
      date: Number(at) * 1000, // unix seconds → milliseconds
      tags,
      subject: (subject ?? '').trim(),
      body: (body ?? '').trim(),
      pushed: !unpushed.has(hash.trim()),
    })
  }

  return commits
}

// ── gitCommitDetail — 한 커밋의 변경 파일 + 증감 ──────────────────────────────

/**
 * 한 커밋의 변경 파일 목록과 add/del 수치를 반환한다.
 *
 * `show --name-status` + `show --numstat` 를 병렬 실행하여 합산.
 * 이름 변경(R100 old new)은 새 경로를 기준으로 기록한다.
 *
 * @param root 레포 최상위 절대 경로
 * @param hash 조회할 커밋 해시 (full 또는 short)
 */
export async function gitCommitDetail(root: string, hash: string): Promise<GitChange[]> {
  const [names, nums] = await Promise.all([
    gitTry(root, ['show', '--name-status', '--format=', hash]),
    gitTry(root, ['show', '--numstat', '--format=', hash]),
  ])

  // numstat → path: { add, del } 맵
  const stats = new Map<string, { add: number | null; del: number | null }>()
  for (const ln of (nums ?? '').split('\n')) {
    const [a, d, ...rest] = ln.split('\t')
    if (rest.length === 0) continue
    stats.set(rest.join('\t'), {
      add: a === '-' ? null : Number(a),
      del: d === '-' ? null : Number(d),
    })
  }

  const out: GitChange[] = []
  for (const ln of (names ?? '').split('\n')) {
    if (!ln.trim()) continue
    const [st, ...rest] = ln.split('\t')
    // R100 old new → 새 경로(마지막 탭 토큰) 기준
    const p = rest.length > 1 ? rest[rest.length - 1] : rest[0]
    if (!p) continue
    const letter: GitFileStatus =
      st[0] === 'A' ? 'A' : st[0] === 'D' ? 'D' : st[0] === 'R' ? 'R' : 'M'
    const s = stats.get(p) ?? stats.get(rest.join('\t')) ?? { add: null, del: null }
    out.push({ path: p, status: letter, add: s.add, del: s.del })
  }

  return out
}

// ── gitFileAt — 커밋 시점 파일 내용 + 부모→커밋 diff ─────────────────────────

/** null byte 포함 여부로 바이너리 파일 판별 (휴리스틱) */
function looksBinary(s: string): boolean {
  return s.includes('\0')
}

/**
 * 커밋 시점의 파일 내용과 부모→커밋 diff를 반환한다.
 *
 * 바이너리/대용량(>1.5MB): content=null, diff=null.
 * 파일이 첫 커밋(부모 없음): prev=null → diff는 전체 add.
 *
 * 원본과 차이:
 *   - diff 타입: 원본 FileDiff 대신 우리 DiffLine[] (ipc-contract 단일 공급원 재사용).
 *     DiffLine은 kind/content/lineOld/lineNew 구조로 fs.diff 채널과 동일.
 *
 * @param root    레포 최상위 절대 경로
 * @param hash    조회할 커밋 해시
 * @param relPath 레포 루트 기준 상대 경로
 */
export async function gitFileAt(root: string, hash: string, relPath: string): Promise<GitFileAt> {
  const cur = await gitTry(root, ['show', `${hash}:${relPath}`])
  if (cur == null) {
    return {
      content: null,
      diff: null,
      error: '이 커밋에서 삭제되었거나 읽을 수 없는 파일이에요',
    }
  }
  if (looksBinary(cur) || cur.length > MAX_FILE) {
    return { content: null, diff: null, error: '미리볼 수 없는 파일이에요 (바이너리/대용량)' }
  }

  const prev = await gitTry(root, ['show', `${hash}^:${relPath}`])
  let diff: DiffLine[] | null = null

  if (prev == null || prev === '') {
    // 첫 커밋 혹은 부모에 파일 없음 → 전체 add
    diff = computeDiff('', cur)
  } else if (!looksBinary(prev) && prev.length <= MAX_FILE) {
    diff = computeDiff(prev, cur)
  }
  // prev가 바이너리/대용량이면 diff=null 유지

  return { content: cur, diff }
}

// ── gitWorkingFile — 작업 트리 파일의 HEAD→디스크 diff ───────────────────────

/**
 * 작업 트리 파일의 HEAD 버전과 현재 디스크 내용을 비교한 diff를 반환한다.
 *
 * 원본과 차이:
 *   - content: 우리 구현은 disk 내용을 content에 담는다 (원본은 content=null, 뷰어가 직접 읽음).
 *     이유: gitWorkingFile 응답의 content를 뷰어가 직접 사용할 수 있게 하되,
 *     LSP 좌표 정합이 필요한 경우 렌더러가 disk에서 다시 읽을 수 있다.
 *   - diff 타입: DiffLine[] (fs.diff 채널과 동일 타입, ipc-contract 단일 공급원).
 *
 * HEAD에 파일 없는(신규 파일) 경우: head=null → computeDiff('', disk) → 전체 add.
 *
 * @param root    레포 최상위 절대 경로
 * @param relPath 레포 루트 기준 상대 경로
 */
export async function gitWorkingFile(root: string, relPath: string): Promise<GitFileAt> {
  let disk: string
  try {
    disk = await fs.readFile(path.join(root, relPath), 'utf8')
  } catch {
    return { content: null, diff: null, error: '파일을 읽을 수 없어요' }
  }

  if (looksBinary(disk) || disk.length > MAX_FILE) {
    return { content: null, diff: null }
  }

  const head = await gitTry(root, ['show', `HEAD:${relPath}`])
  let diff: DiffLine[] | null = null

  if (head == null) {
    // HEAD에 없는 신규 파일 → 전체 add
    diff = computeDiff('', disk)
  } else if (!looksBinary(head) && head.length <= MAX_FILE) {
    diff = computeDiff(head, disk)
  }
  // head가 바이너리/대용량이면 diff=null 유지

  return { content: disk, diff }
}
