import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  GitChange,
  GitCommit,
  GitFileAt,
  GitFileStatus,
  GitOpResult,
  GitStatus,
  DiffLine,
} from '../../shared/ipcContract'
import { computeDiff } from './diff'

const MAX_FILE = 1_500_000

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

async function gitTry(cwd: string, args: string[], timeout?: number): Promise<string | null> {
  try {
    return await git(cwd, args, timeout)
  } catch {
    return null
  }
}

export function maskCredentials(msg: string): string {
  return msg.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@')
}

const rootCache = new Map<string, string | null>()

export async function gitRoot(cwd: string, force = false): Promise<string | null> {
  if (!cwd) return null
  const key = cwd.replace(/[\\/]+/g, '/').toLowerCase()
  if (!force && rootCache.has(key)) return rootCache.get(key) ?? null
  const out = await gitTry(cwd, ['rev-parse', '--show-toplevel'], 10_000)
  const root = out ? path.normalize(out.trim()) : null
  rootCache.set(key, root)
  return root
}

function statusLetter(xy: string): GitFileStatus {
  const c = xy[1] !== '.' ? xy[1] : xy[0]
  if (c === 'A') return 'A'
  if (c === 'D') return 'D'
  if (c === 'R') return 'R'
  return 'M'
}

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
      const parts = line.split(' ')
      changes.push({
        path: parts.slice(8).join(' '),
        status: statusLetter(parts[1]),
        add: null,
        del: null,
      })
    } else if (line.startsWith('2 ')) {
      const tab = line.indexOf('\t')
      const head = (tab >= 0 ? line.slice(0, tab) : line).split(' ')
      changes.push({ path: head.slice(9).join(' '), status: 'R', add: null, del: null })
    } else if (line.startsWith('? ')) {
      changes.push({ path: line.slice(2), status: 'A', add: null, del: null })
    }
  }

  if (branch === '(detached)') {
    branch = (await gitTry(root, ['rev-parse', '--short', 'HEAD']))?.trim() ?? 'detached'
  }

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
        }
      })
  )

  const branchesRaw = (await gitTry(root, ['branch', '--format=%(HEAD)\t%(refname:short)'])) ?? ''
  const branches = branchesRaw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [head, ...name] = l.split('\t')
      return { name: name.join('\t'), current: head === '*' }
    })
    .filter((b) => b.name)

  const remotes = ((await gitTry(root, ['remote'])) ?? '').split('\n').filter(Boolean)

  const tags = ((await gitTry(root, ['tag', '--sort=-creatordate'])) ?? '')
    .split('\n')
    .filter(Boolean)
    .slice(0, 20)

  return { root, branch, ahead, behind, changes, branches, remotes, tags }
}

const SEP = '\x1f'
const REC = '\x1e'

export async function gitLog(root: string, limit = 80): Promise<GitCommit[]> {
  const fmt = ['%H', '%h', '%an', '%at', '%D', '%s', '%b'].join('%x1f') + '%x1e'
  const raw = await gitTry(root, ['log', `--format=${fmt}`, '-n', String(limit)])
  if (raw == null) return []

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
      date: Number(at) * 1000,
      tags,
      subject: (subject ?? '').trim(),
      body: (body ?? '').trim(),
      pushed: !unpushed.has(hash.trim()),
    })
  }

  return commits
}

export async function gitCommitDetail(root: string, hash: string): Promise<GitChange[]> {
  const [names, nums] = await Promise.all([
    gitTry(root, ['show', '--name-status', '--format=', hash]),
    gitTry(root, ['show', '--numstat', '--format=', hash]),
  ])

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
    const p = rest.length > 1 ? rest[rest.length - 1] : rest[0]
    if (!p) continue
    const letter: GitFileStatus =
      st[0] === 'A' ? 'A' : st[0] === 'D' ? 'D' : st[0] === 'R' ? 'R' : 'M'
    const s = stats.get(p) ?? stats.get(rest.join('\t')) ?? { add: null, del: null }
    out.push({ path: p, status: letter, add: s.add, del: s.del })
  }

  return out
}

function looksBinary(s: string): boolean {
  return s.includes('\0')
}

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
    diff = computeDiff('', cur)
  } else if (!looksBinary(prev) && prev.length <= MAX_FILE) {
    diff = computeDiff(prev, cur)
  }

  return { content: cur, diff }
}

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
    diff = computeDiff('', disk)
  } else if (!looksBinary(head) && head.length <= MAX_FILE) {
    diff = computeDiff(head, disk)
  }

  return { content: disk, diff }
}

export async function gitHeadContent(root: string, relPath: string): Promise<string | null> {
  const content = await gitTry(root, ['show', `HEAD:${relPath}`])
  if (content == null) return null
  if (looksBinary(content) || content.length > MAX_FILE) return null
  return content
}

export async function gitCommit(
  root: string,
  subject: string,
  body: string
): Promise<GitOpResult> {
  try {
    await git(root, ['add', '-A'])
    const args = ['commit', '-m', subject]
    if (body.trim()) args.push('-m', body)
    await git(root, args)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: maskCredentials(e instanceof Error ? e.message : String(e)) }
  }
}

export async function gitPush(root: string): Promise<GitOpResult> {
  try {
    await git(root, ['push'], 120_000)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/no upstream|set-upstream/i.test(msg)) {
      try {
        const br = ((await gitTry(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? '').trim()
        if (br && br !== 'HEAD') {
          await git(root, ['push', '-u', 'origin', br], 120_000)
          return { ok: true }
        }
      } catch (e2) {
        return { ok: false, error: maskCredentials(e2 instanceof Error ? e2.message : String(e2)) }
      }
    }
    return { ok: false, error: maskCredentials(msg) }
  }
}

export async function gitPull(root: string): Promise<GitOpResult> {
  try {
    await git(root, ['pull', '--ff-only'], 120_000)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: maskCredentials(e instanceof Error ? e.message : String(e)) }
  }
}
