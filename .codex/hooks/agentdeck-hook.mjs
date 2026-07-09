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

function shellTokens(command = '') {
  const tokens = []
  let current = ''
  let quote = null
  let escaped = false

  const flush = () => {
    if (current) tokens.push(current)
    current = ''
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && /["\\]/.test(command[index + 1] || '')) escaped = true
      else current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      flush()
      continue
    }
    if (/[;&|>]/.test(char)) {
      flush()
      const doubled = command[index + 1] === char
      tokens.push(doubled ? char + char : char)
      if (doubled) index += 1
      continue
    }
    current += char
  }
  flush()
  return quote ? [] : tokens
}

function commandName(token = '') {
  return slash(token).split('/').at(-1).replace(/\.(?:exe|cmd|bat)$/i, '').toLowerCase()
}

function splitCommandSegments(tokens) {
  const segments = []
  let current = []
  for (const token of tokens) {
    if (/^(?:;|&&?|\|\|?)$/.test(token)) {
      if (current.length) segments.push(current)
      current = []
    } else current.push(token)
  }
  if (current.length) segments.push(current)
  return segments
}

function gitSubcommandIndex(tokens, start) {
  let index = start + 1
  while (index < tokens.length) {
    const token = tokens[index]
    const lower = token.toLowerCase()
    if (!lower.startsWith('-')) return index
    if (/^(?:-c|-C|--git-dir|--work-tree|--namespace|--config-env|--exec-path)$/i.test(token)) index += 2
    else index += 1
  }
  return -1
}

function destructiveSegmentReason(tokens) {
  let start = 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[start] || '')) start += 1
  while (['sudo', 'env'].includes(commandName(tokens[start] || ''))) start += 1
  const name = commandName(tokens[start] || '')
  const args = tokens.slice(start + 1)
  const lowerArgs = args.map((item) => item.toLowerCase())

  if (name === 'rm') {
    const shortFlags = lowerArgs.filter((item) => /^-[^-]/.test(item)).join('').replaceAll('-', '')
    const recursive = shortFlags.includes('r') || lowerArgs.includes('--recursive')
    const force = shortFlags.includes('f') || lowerArgs.includes('--force')
    if (recursive && force) return 'rm 재귀 강제 삭제는 허용하지 않습니다.'
  }
  if (['remove-item', 'ri'].includes(name)
    && lowerArgs.includes('-recurse') && lowerArgs.includes('-force')) {
    return 'PowerShell 재귀 강제 삭제는 허용하지 않습니다.'
  }
  if (['del', 'erase', 'rd', 'rmdir'].includes(name)
    && lowerArgs.includes('/s') && lowerArgs.includes('/q')) {
    return '재귀 무확인 삭제는 허용하지 않습니다.'
  }
  if (name === 'cmd') {
    const commandIndex = lowerArgs.findIndex((item) => item === '/c' || item === '/k')
    if (commandIndex >= 0) return destructiveSegmentReason(args.slice(commandIndex + 1))
  }
  if (['powershell', 'pwsh'].includes(name)) {
    const commandIndex = lowerArgs.findIndex((item) => item === '-command' || item === '-c')
    if (commandIndex >= 0) return dangerousCommandReason(args.slice(commandIndex + 1).join(' '))
  }
  if (name === 'git') {
    const subcommandIndex = gitSubcommandIndex(tokens, start)
    if (subcommandIndex >= 0) {
      const subcommand = tokens[subcommandIndex].toLowerCase()
      const rest = tokens.slice(subcommandIndex + 1)
      const lowerRest = rest.map((item) => item.toLowerCase())
      if (subcommand === 'reset' && lowerRest.includes('--hard')) {
        return 'git reset --hard는 작업 내용을 잃을 수 있습니다.'
      }
      if (subcommand === 'clean') {
        const shortFlags = lowerRest.filter((item) => /^-[^-]/.test(item)).join('').replaceAll('-', '')
        const force = shortFlags.includes('f') || lowerRest.includes('--force')
        const directories = shortFlags.includes('d') || lowerRest.includes('--directories')
        if (force && directories) return 'git clean 강제 삭제는 미추적 파일을 잃을 수 있습니다.'
      }
      if (subcommand === 'push') {
        const forced = lowerRest.some((item) => item === '--force'
          || item.startsWith('--force-with-lease')
          || (/^-[^-]/.test(item) && item.slice(1).includes('f'))
          || item.startsWith('+'))
        if (forced) return '강제 push는 원격 이력을 덮어쓸 수 있습니다.'
      }
      if (['checkout', 'restore'].includes(subcommand)
        && lowerRest.some((item) => item === '.' || item === '*')) {
        return `광범위한 ${subcommand} 복원은 작업 내용을 잃을 수 있습니다.`
      }
    }
  }
  if (['mkfs', 'format-volume', 'clear-disk'].includes(name) || name.startsWith('mkfs.')) {
    return '디스크 포맷 또는 초기화 명령은 허용하지 않습니다.'
  }
  if (['format', 'format.com'].includes(name) && /^[a-z]:$/i.test(args[0] || '')) {
    return '드라이브 포맷 명령은 허용하지 않습니다.'
  }
  return null
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
  if (source.includes(':(){ :|:& };:')) return 'fork bomb은 허용하지 않습니다.'
  const tokens = shellTokens(source)
  for (const segment of splitCommandSegments(tokens)) {
    const reason = destructiveSegmentReason(segment)
    if (reason) return reason
  }
  return null
}

export function isHarnessPath(repoPath = '') {
  const normalized = slash(repoPath).replace(/^\.\//, '')
  if (/^(?:AGENTS\.md|CLAUDE\.md|\.gitattributes)$/i.test(normalized)) return true
  if (/^\.agents\/skills\//i.test(normalized)) return true
  if (/^\.codex\/state\//i.test(normalized)) return false
  if (/^\.codex\//i.test(normalized)) return true
  if (/^\.claude\/CHANGELOG\.md$/i.test(normalized)) return false
  return /^\.claude\//i.test(normalized)
}

function normalizedHarnessReference(token) {
  const normalizedToken = slash(token)
  const markers = ['.claude/', '.codex/', '.agents/skills/', 'agents.md', 'claude.md', '.gitattributes']
  for (const marker of markers) {
    const index = normalizedToken.toLowerCase().indexOf(marker)
    if (index < 0) continue
    const candidate = normalizedToken.slice(index).replace(/[),]+$/, '')
    return path.posix.normalize(candidate).toLowerCase()
  }
  return null
}

export function harnessShellWriteReason(command = '') {
  const tokens = shellTokens(command)
  const writeCommands = new Set([
    'sed', 'tee', 'mv', 'cp', 'rm', 'touch', 'truncate',
    'set-content', 'add-content', 'out-file', 'remove-item',
    'move-item', 'copy-item', 'new-item', 'ni',
  ])
  const writes = tokens.some((token) => writeCommands.has(commandName(token)) || token === '>' || token === '>>')
  if (!writes) return null

  const references = unique(tokens.map(normalizedHarnessReference))
  if (!references.length) return null
  const allowed = references.every((reference) => /^\.codex\/state(?:\/|$)/i.test(reference)
    || reference === '.claude/changelog.md')
  if (allowed) return null
  return '하네스에 대한 shell 우회 쓰기는 봉인되어 있습니다.'
}

export function riskFlagsFor(repoPath = '') {
  const normalized = slash(repoPath)
  const flags = []
  if (/^02\.Source\/preload\//i.test(normalized)
    || /^02\.Source\/main\/.*ipc/i.test(normalized)
    || /(?:Claude|Codex)CodeBackend/i.test(normalized)) flags.push('trust-boundary')
  if (/^02\.Source\/main\/01_agents\//i.test(normalized)
    || /^02\.Source\/shared\/agent-events/i.test(normalized)) flags.push('backend-contract')
  if (/^02\.Source\/shared\/(?:ipc-contract|ipc\/)/i.test(normalized)) flags.push('shared-contract')
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

function hasMatchingTest(root, implementationPath) {
  const stem = path.basename(implementationPath, path.extname(implementationPath))
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

export function tddPatchViolation(command = '') {
  const changes = []
  const regex = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm
  let match
  while ((match = regex.exec(command)) !== null) {
    changes.push({ operation: match[1], path: match[2].trim() })
  }
  const implementations = changes.filter((change) => change.operation !== 'Delete'
    && isImplementationPath(change.path))
  for (const implementation of implementations) {
    const stem = path.basename(implementation.path, path.extname(implementation.path)).toLowerCase()
    const relatedTestChange = changes.find((change) => TEST_FILE_RE.test(change.path)
      && path.basename(change.path).toLowerCase().includes(stem)
      && (change.operation === 'Add' || change.operation === 'Delete'))
    if (relatedTestChange?.operation === 'Add') {
      return `'${implementation.path}' 구현과 새 테스트를 같은 patch에 넣지 말고 실패 테스트를 별도 patch로 먼저 추가하세요.`
    }
    if (relatedTestChange?.operation === 'Delete') {
      return `'${implementation.path}' 구현과 대응 테스트 삭제를 같은 patch에 넣을 수 없습니다.`
    }
  }
  return null
}

function reviewerReason(repoPath) {
  const normalized = slash(repoPath)
  if (/^02\.Source\/shared\//i.test(normalized)) return 'shared 공유계약'
  if (/^02\.Source\/preload\//i.test(normalized)) return 'preload 신뢰경계'
  if (/^02\.Source\/main\/01_agents\//i.test(normalized)) return 'backend-contract'
  return null
}

export function codexRuntimePaths(root) {
  const state = path.join(root, '.codex', 'state')
  return {
    pin: path.join(state, 'current-pin.txt'),
    circuit: path.join(state, 'circuit-breaker.json'),
  }
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
  const runtime = codexRuntimePaths(root)
  const pin = readFirstExisting([runtime.pin])
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
    const patchViolation = tddPatchViolation(command)
    if (patchViolation) deny(patchViolation)
    const missingTest = paths.find((item) => isImplementationPath(item) && !hasMatchingTest(root, item))
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
  const runtime = codexRuntimePaths(root)
  const stateDir = path.dirname(runtime.circuit)
  const logFile = runtime.circuit
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

  const pin = readFirstExisting([runtime.pin])?.value ?? ''
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
