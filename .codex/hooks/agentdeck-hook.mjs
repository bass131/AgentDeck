import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PATCH_PATH_RE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm
const PATCH_MOVE_RE = /^\*\*\* Move to: (.+)$/gm
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i

function slash(value) {
  return value.replaceAll('\\', '/')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

export function parsePatchPaths(command = '') {
  const paths = []
  for (const regex of [PATCH_PATH_RE, PATCH_MOVE_RE]) {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(command)) !== null) paths.push(match[1].trim())
  }
  return unique(paths)
}

export function dangerousCommandReason(command = '') {
  const source = command.trim()
  const lower = source.toLowerCase()

  if (/\brm\b[^\r\n;&|]*(?:\s-(?:rf|fr|[a-z]*r[a-z]*f[a-z]*))\b/i.test(source)) {
    return 'rm 재귀 강제 삭제는 허용하지 않습니다.'
  }
  if (/\bremove-item\b[^\r\n]*(?:-recurse[^\r\n]*-force|-force[^\r\n]*-recurse)/i.test(source)) {
    return 'PowerShell 재귀 강제 삭제는 허용하지 않습니다.'
  }
  if (/\b(?:del|erase)\b[^\r\n]*(?:\/s[^\r\n]*\/q|\/q[^\r\n]*\/s)/i.test(source)) {
    return '재귀 무확인 삭제는 허용하지 않습니다.'
  }
  if (/\bgit\s+reset\b[^\r\n]*--hard\b/i.test(source)) {
    return 'git reset --hard는 작업 내용을 잃을 수 있습니다.'
  }
  if (/\bgit\s+clean\b[^\r\n]*\s-[a-z]*f[a-z]*d[a-z]*\b/i.test(source)) {
    return 'git clean 강제 삭제는 미추적 파일을 잃을 수 있습니다.'
  }
  if (/\bgit\s+push\b[^\r\n]*(?:--force(?:-with-lease)?\b|\s-f(?:\s|$))/i.test(source)) {
    return '강제 push는 원격 이력을 덮어쓸 수 있습니다.'
  }
  if (/\bgit\s+checkout\s+--\s+(?:\.|\*)\s*$/i.test(source)) {
    return '광범위한 checkout 복원은 작업 내용을 잃을 수 있습니다.'
  }
  if (/\b(?:mkfs(?:\.[a-z0-9]+)?|format-volume|clear-disk)\b/i.test(source)) {
    return '디스크 포맷 또는 초기화 명령은 허용하지 않습니다.'
  }
  if (/(?:^|[;&|]\s*)format(?:\.com)?\s+[a-z]:/i.test(lower)) {
    return '드라이브 포맷 명령은 허용하지 않습니다.'
  }
  if (source.includes(':(){ :|:& };:')) return 'fork bomb은 허용하지 않습니다.'
  return null
}

export function isHarnessPath(repoPath = '') {
  const normalized = slash(repoPath).replace(/^\.\//, '')
  if (/^(?:AGENTS\.md|CLAUDE\.md)$/i.test(normalized)) return true
  if (/^\.agents\/skills\//i.test(normalized)) return true
  if (/^\.codex\/state\//i.test(normalized)) return false
  if (/^\.codex\//i.test(normalized)) return true
  if (/^\.claude\/state\//i.test(normalized)) return false
  if (/^\.claude\/CHANGELOG\.md$/i.test(normalized)) return false
  return /^\.claude\//i.test(normalized)
}

export function harnessShellWriteReason(command = '') {
  const lower = slash(command).toLowerCase()
  const mentionsHarness = [
    '.claude/',
    '.codex/',
    '.agents/skills/',
    'agents.md',
    'claude.md',
  ].some((needle) => lower.includes(needle))
  if (!mentionsHarness) return null

  const writes = /(?:^|[\s;&|])(?:sed|tee|mv|cp|rm|touch|truncate|set-content|add-content|out-file|remove-item|move-item|copy-item)(?:\s|$)|(?:^|[^>])>>?\s*[^&]/i.test(command)
  if (!writes) return null

  const runtimeOnly = /(?:\.claude|\.codex)\/state\//i.test(lower)
    && !/(?:\.claude|\.codex)\/(?!state\/)/i.test(lower)
  if (runtimeOnly) return null
  return '하네스에 대한 shell 우회 쓰기는 봉인되어 있습니다.'
}

export function riskFlagsFor(repoPath = '') {
  const normalized = slash(repoPath)
  const flags = []
  if (/^02\.Source\/preload\//i.test(normalized)
    || /^02\.Source\/main\/.*ipc/i.test(normalized)
    || /(?:Claude|Codex)CodeBackend/i.test(normalized)) flags.push('trust-boundary')
  if (/^02\.Source\/shared\/agent-events/i.test(normalized)
    || /\/AgentBackend/i.test(normalized)) flags.push('backend-contract')
  if (/^02\.Source\/shared\/ipc-contract/i.test(normalized)) flags.push('shared-contract')
  return unique(flags)
}

export function isImplementationPath(repoPath = '') {
  const normalized = slash(repoPath)
  if (!/^02\.Source\/.*\.(?:ts|tsx)$/i.test(normalized)) return false
  if (/\/(?:tests?|__tests__)\//i.test(normalized) || TEST_FILE_RE.test(normalized)) return false
  if (/^02\.Source\/shared\//i.test(normalized)) return false
  if (/\.(?:d|config)\.ts$/i.test(normalized)) return false
  if (/\/index\.ts$/i.test(normalized) || /\/preload\/index\.ts$/i.test(normalized)) return false
  if (/(?:SampleData|sampleData)\.tsx?$/i.test(normalized)) return false
  return true
}

function findGitRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    let cursor = path.resolve(cwd)
    while (path.dirname(cursor) !== cursor) {
      if (fs.existsSync(path.join(cursor, '.git'))) return cursor
      cursor = path.dirname(cursor)
    }
    return path.resolve(cwd)
  }
}

function toRepoPath(candidate, root, cwd) {
  if (!candidate) return ''
  const clean = candidate.trim().replace(/^['"]|['"]$/g, '')
  const absolute = path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(cwd, clean)
  return slash(path.relative(root, absolute))
}

function payloadPaths(payload, root) {
  const input = payload.tool_input ?? {}
  const cwd = payload.cwd || root
  const raw = input.file_path
    ? [input.file_path]
    : parsePatchPaths(typeof input.command === 'string' ? input.command : '')
  return unique(raw.map((item) => toRepoPath(item, root, cwd)))
}

function walkFiles(directory, result = []) {
  if (!fs.existsSync(directory)) return result
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(target, result)
    else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) result.push(target)
  }
  return result
}

function patchIncludesTest(stem, paths) {
  return paths.some((item) => TEST_FILE_RE.test(item) && path.basename(item).toLowerCase().includes(stem.toLowerCase()))
}

function hasMatchingTest(root, implementationPath, changedPaths) {
  const stem = path.basename(implementationPath, path.extname(implementationPath))
  if (patchIncludesTest(stem, changedPaths)) return true
  const testRoot = path.join(root, '99.Others', 'tests')
  for (const testFile of walkFiles(testRoot)) {
    if (path.basename(testFile).toLowerCase().includes(stem.toLowerCase())) return true
    try {
      if (fs.readFileSync(testFile, 'utf8').includes(stem)) return true
    } catch {
      // A transient read failure should not turn the hook itself into a blocker.
    }
  }
  return false
}

function reviewerReason(repoPath) {
  const normalized = slash(repoPath)
  if (/^02\.Source\/shared\//i.test(normalized)) return 'shared 공유계약'
  if (/^02\.Source\/preload\//i.test(normalized)) return 'preload 신뢰경계'
  if (/\/AgentBackend/i.test(normalized)) return 'AgentBackend 계약'
  if (/(?:Claude|Codex)CodeBackend/i.test(normalized)) return '엔진 어댑터 권한경계'
  return null
}

function readFirstExisting(paths) {
  for (const file of paths) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim()
      if (value) return { file, value }
    } catch {
      // Optional runtime state may not exist yet.
    }
  }
  return null
}

function hookContext(event, messages) {
  if (!messages.length) return
  const text = messages.join('\n')
  process.stdout.write(JSON.stringify({
    systemMessage: text,
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: text,
    },
  }))
}

function deny(message) {
  process.stderr.write(`AgentDeck guard 차단: ${message}\n`)
  process.exit(2)
}

function runPrompt(root) {
  const pin = readFirstExisting([
    path.join(root, '.codex', 'state', 'current-pin.txt'),
    path.join(root, '.claude', 'state', 'current-pin.txt'),
  ])
  const sections = []
  if (pin) {
    const relative = slash(path.relative(root, pin.file))
    sections.push(`<work-pin source="${relative}">\n${pin.value}\n</work-pin>`)
  }

  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pending = status.split(/\r?\n/).filter((line) => /-DONE\.md$/i.test(line))
    if (pending.length) {
      sections.push(`<phase-completion-pending>\n미커밋 -DONE.md가 있습니다:\n${pending.join('\n')}\n</phase-completion-pending>`)
    }
  } catch {
    // A missing git executable should not block prompt submission.
  }
  if (sections.length) process.stdout.write(sections.join('\n\n'))
}

function runSubagentStart(payload, root) {
  const type = String(payload.agent_type || '').trim()
  if (!/^[a-z0-9_-]+$/i.test(type)) return
  const roleFile = path.join(root, '.claude', 'agents', `${type}.md`)
  if (!fs.existsSync(roleFile)) return
  process.stdout.write([
    `AgentDeck custom agent role: ${type}.`,
    `작업 전 AGENTS.md, CLAUDE.md, .claude/agents/${type}.md, .claude/agents/_routing.md를 읽으세요.`,
    'Claude 도구 이름은 현재 Codex 도구에 맞게 해석하되 책임 범위와 금지 영역은 그대로 지키세요.',
  ].join('\n'))
}

function runPreTool(payload, root) {
  const toolName = String(payload.tool_name || '')
  const command = typeof payload.tool_input?.command === 'string' ? payload.tool_input.command : ''
  const paths = payloadPaths(payload, root)

  if (toolName === 'Bash') {
    const dangerous = dangerousCommandReason(command)
    if (dangerous) deny(dangerous)
    const harnessWrite = harnessShellWriteReason(command)
    if (harnessWrite) deny(harnessWrite)
    return
  }

  const sealed = paths.find(isHarnessPath)
  if (sealed) deny(`하네스 파일 '${sealed}'은 사용자 단독 통제 영역입니다.`)

  if (fs.existsSync(path.join(root, '.codex', 'tdd-enforce'))) {
    const missingTest = paths.find((item) => isImplementationPath(item) && !hasMatchingTest(root, item, paths))
    if (missingTest) {
      deny(`'${missingTest}' 구현 전에 대응 실패 테스트를 99.Others/tests/**에 먼저 추가하세요.`)
    }
  }

  const warnings = []
  for (const changedPath of paths) {
    const flags = riskFlagsFor(changedPath)
    if (flags.length) warnings.push(`위험 깃발 [${flags.join(', ')}]: ${changedPath}`)
  }
  hookContext('PreToolUse', unique(warnings))
}

function validateDoneReport(root, repoPath) {
  if (!/(?:-DONE|_milestone-DONE)\.md$/i.test(repoPath)) return null
  const target = path.join(root, repoPath)
  if (!fs.existsSync(target)) return null
  const content = fs.readFileSync(target, 'utf8')
  const checks = [
    ['이슈', /이슈|issue|🎯/i],
    ['분석', /분석|analysis|🤔/i],
    ['구현', /구현|implement|🛠/i],
    ['검증', /검증|회귀|test|🧪/i],
    ['총평/다음', /총평|다음|next|➡/i],
  ]
  const missing = checks.filter(([, regex]) => !regex.test(content)).map(([label]) => label)
  return missing.length ? `${repoPath} 완료 보고의 5단계 섹션 누락 의심: ${missing.join(', ')}` : null
}

function sizeWarning(root, repoPath) {
  if (!/^02\.Source\/.*\.(?:ts|tsx)$/i.test(repoPath) || TEST_FILE_RE.test(repoPath)) return null
  const target = path.join(root, repoPath)
  if (!fs.existsSync(target)) return null
  const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/).length
  return lines > 800 ? `${repoPath} = ${lines}줄(임계 800). 책임 분리 여부를 점검하세요.` : null
}

function circuitWarning(root) {
  const stateDir = path.join(root, '.codex', 'state')
  const logFile = path.join(stateDir, 'circuit-breaker.json')
  const now = Date.now()
  let timestamps = []
  try {
    timestamps = JSON.parse(fs.readFileSync(logFile, 'utf8'))
  } catch {
    // First edit in a worktree starts a fresh local circuit window.
  }
  timestamps = timestamps.filter((value) => Number.isFinite(value) && now - value <= 300_000)
  timestamps.push(now)
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(logFile, JSON.stringify(timestamps), 'utf8')

  const pin = readFirstExisting([
    path.join(stateDir, 'current-pin.txt'),
    path.join(root, '.claude', 'state', 'current-pin.txt'),
  ])?.value ?? ''
  const grade = pin.match(/^(?:등급|grade):\s*(\S+)/im)?.[1]
  const threshold = ({ 단순: 5, 보통: 10, 복잡: 15, 대규모: 20 })[grade] ?? 10
  return timestamps.length >= threshold
    ? `최근 5분 편집 ${timestamps.length}회(임계 ${threshold}). 같은 접근을 반복 중인지 전략을 재검토하세요.`
    : null
}

function runPostTool(payload, root) {
  const toolName = String(payload.tool_name || '')
  if (toolName === 'Bash') return
  const paths = payloadPaths(payload, root)
  if (!paths.length) return

  const messages = []
  for (const changedPath of paths) {
    const reason = reviewerReason(changedPath)
    if (reason) messages.push(`reviewer 권장(${reason}): ${changedPath}`)
    const report = validateDoneReport(root, changedPath)
    if (report) messages.push(report)
    const size = sizeWarning(root, changedPath)
    if (size) messages.push(size)
  }
  const circuit = circuitWarning(root)
  if (circuit) messages.push(circuit)
  hookContext('PostToolUse', unique(messages))
}

async function readPayload() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

async function main() {
  const mode = process.argv[2]
  const payload = await readPayload()
  const root = findGitRoot(payload.cwd || process.cwd())
  if (mode === 'prompt') runPrompt(root)
  else if (mode === 'subagent-start') runSubagentStart(payload, root)
  else if (mode === 'pre-tool') runPreTool(payload, root)
  else if (mode === 'post-tool') runPostTool(payload, root)
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`AgentDeck hook error: ${error.message}\n`)
    process.exit(1)
  })
}
