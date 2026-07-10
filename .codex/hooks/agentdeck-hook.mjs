import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PATCH_PATH_RE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm
const PATCH_MOVE_RE = /^\*\*\* Move to: (.+)$/gm
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i
const DONE_LABELS = [
  '무엇을 만들었나',
  '왜 필요한가',
  '어떻게 만들었나',
  '테스트 결과',
  '다음 스텝',
]

function slash(value) {
  return value.replaceAll('\\', '/')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function parseFrontmatter(content = '') {
  const lines = content.replaceAll('\r', '').split('\n')
  if (lines[0]?.trim() !== '---') return { fields: {}, found: false }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { fields: {}, found: false }
  const fields = {}
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match) fields[match[1].toLowerCase()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return { fields, found: true }
}

function sectionBody(content, title) {
  const lines = content.replaceAll('\r', '').split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${title}`)
  if (start < 0) return null
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break
    body.push(line)
  }
  return body.join('\n').trim()
}

function hasAcEvidence(ac) {
  const lines = ac.replaceAll('\r', '').split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('```'))
  const commandIndex = lines.findIndex((line) => /^\$\s+\S+/.test(line)
    || /^(?:npm|npx|node|git|gh|codex|pnpm|yarn|bun|cargo|pytest|python|py|go|dotnet|mvn|gradle|bash|powershell|pwsh)\b/i.test(line))
  if (commandIndex < 0) return false
  const resultPattern = /(?:pass(?:ed)?|fail(?:ed)?|errors?|warnings?|tests?|files?|problems?|exit|success|\bok\b|completed|성공|통과|실패)/i
  return lines.some((line, index) => index !== commandIndex
    && (resultPattern.test(line) || /^\d+(?:\s|$)/.test(line)))
}

export function doneReportIssues(content = '', { htmlContent = null } = {}) {
  const issues = []
  const { fields, found } = parseFrontmatter(content)
  if (!found) issues.push('YAML frontmatter가 없거나 닫히지 않았습니다.')

  for (const field of ['summary', 'phase', 'status', 'grade', 'owner', 'gate_version', 'report_html']) {
    if (!fields[field]) issues.push(`frontmatter 필드 '${field}'가 없습니다.`)
    else if (/<[^>]+>|\{[^}]+\}/.test(fields[field])) issues.push(`frontmatter 필드 '${field}'에 placeholder가 남아 있습니다.`)
  }
  if (fields.status && fields.status.toLowerCase() !== 'done') issues.push("frontmatter 필드 'status'는 'done'이어야 합니다.")
  if (fields.gate_version && fields.gate_version !== '1') {
    issues.push("gate_version은 '1'이어야 합니다.")
  }
  if (fields.grade && !/^(?:복잡|대규모|complex|large)(?:\s|\(|$)/i.test(fields.grade)) {
    issues.push('새 -DONE.md의 grade는 복잡 또는 대규모여야 합니다.')
  }

  const reportPath = slash(fields.report_html || '')
  if (reportPath && !/^00\.Documents\/reports\/(?!.*\.\.)[^\r\n]+\.html$/i.test(reportPath)) {
    issues.push("report_html은 '00.Documents/reports/*.html' 상대 경로여야 합니다.")
  }

  for (const heading of ['TL;DR', '5단계 보고', 'AC 검증 결과', '학습 일지 후보 키워드']) {
    if (sectionBody(content, heading) === null) issues.push(`필수 H2 '## ${heading}'가 없습니다.`)
  }
  for (const label of DONE_LABELS) {
    if (!content.includes(label)) issues.push(`5단계 라벨 '${label}'가 없습니다.`)
  }

  const ac = sectionBody(content, 'AC 검증 결과')
  if (ac !== null && !hasAcEvidence(ac)) issues.push('AC 검증 결과에는 실제 실행 명령과 별도 결과 줄이 필요합니다.')

  if (htmlContent === null) issues.push('report_html이 가리키는 HTML 보고서가 없습니다.')
  else {
    const missingHtmlLabels = DONE_LABELS.filter((label) => !htmlContent.includes(label))
    if (missingHtmlLabels.length) {
      issues.push(`HTML 보고서의 5단계 라벨 누락: ${missingHtmlLabels.join(', ')}`)
    }
  }
  return unique(issues)
}

export function doneReportGateResult(content = '', { tracked = false, htmlContent = null } = {}) {
  const { fields } = parseFrontmatter(content)
  if (tracked && fields.gate_version !== '1') {
    return { blocking: false, legacy: true, issues: [] }
  }
  const issues = doneReportIssues(content, { htmlContent })
  return { blocking: issues.length > 0, legacy: false, issues }
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
  const directWrite = tokens.some((token) => writeCommands.has(commandName(token)))
  const harnessRedirection = tokens.some((token, index) => (token === '>' || token === '>>')
    && normalizedHarnessReference(tokens[index + 1] || ''))
  const embeddedWrite = /(?:\b(?:writeFileSync|writeFile|appendFileSync|appendFile|renameSync|rename|copyFileSync|copyFile|rmSync|unlinkSync|unlink)\s*\(|\bDeno\.(?:writeTextFile|writeFile|remove|rename|copyFile)\s*\(|\[(?:System\.)?IO\.File\]::(?:WriteAllText|AppendAllText|Move|Copy|Delete)\s*\()/i.test(command)
  const writes = directWrite || harnessRedirection || embeddedWrite
  if (!writes) return null

  const references = unique(tokens.map(normalizedHarnessReference))
  if (!references.length) return null
  const allowed = references.every((reference) => /^\.codex\/state(?:\/|$)/i.test(reference)
    || reference === '.claude/changelog.md')
  if (allowed) return null
  return '하네스에 대한 shell 우회 쓰기는 봉인되어 있습니다.'
}

export function harnessMaintenanceEnabled(env = process.env) {
  return env.AGENTDECK_HARNESS_MAINTENANCE === '1'
}

export function promptClarityContext(prompt = '') {
  if (!String(prompt).trim()) return ''
  return [
    '<input-clarity>',
    '요청이 충분하면 추가 확인 없이 진행합니다.',
    '저장소에서 확인 가능한 모호함은 읽기 전용 실측으로 해소하고 중요한 가정을 밝힙니다.',
    '결과·범위·권한을 바꾸는 사용자 결정이 빠졌다면 한 가지 차단 질문을 합니다.',
    '글자 수나 필드 수만으로 요청을 차단하지 않습니다.',
    '</input-clarity>',
  ].join('\n')
}

export function riskFlagsFor(repoPath = '') {
  const normalized = slash(repoPath)
  const flags = []
  if (/^02\.Source\/preload\//i.test(normalized)
    || /^02\.Source\/main\/.*ipc/i.test(normalized)
    || /(?:ClaudeCodeBackend|CodexBackend)/i.test(normalized)) flags.push('trust-boundary')
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
  const testChanges = changes.filter((change) => TEST_FILE_RE.test(change.path))
  if (implementations.length && testChanges.length) {
    return '테스트 변경과 구현 변경을 같은 patch에 넣지 말고 실패 테스트를 별도 patch로 먼저 추가하세요.'
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

function runPrompt(payload, root) {
  const runtime = codexRuntimePaths(root)
  const pin = readFirstExisting([runtime.pin])
  const sections = []
  const clarity = promptClarityContext(payload.prompt)
  if (clarity) sections.push(clarity)
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
  const maintenance = harnessMaintenanceEnabled()

  if (toolName === 'Bash') {
    const dangerous = dangerousCommandReason(command)
    if (dangerous) deny(dangerous)
    if (!maintenance) {
      const harnessWrite = harnessShellWriteReason(command)
      if (harnessWrite) deny(harnessWrite)
    }
    return
  }

  const sealed = paths.find(isHarnessPath)
  if (sealed && !maintenance) deny(`하네스 파일 '${sealed}'은 사용자 단독 통제 영역입니다.`)

  if (fs.existsSync(path.join(root, '.codex', 'tdd-enforce'))) {
    const patchViolation = tddPatchViolation(command)
    if (patchViolation) deny(patchViolation)
    const missingTest = paths.find((item) => isImplementationPath(item) && !hasMatchingTest(root, item))
    if (missingTest) {
      deny(`'${missingTest}' 구현 전에 대응 실패 테스트를 99.Others/tests/**에 먼저 추가하세요.`)
    }
  }

  const warnings = []
  if (sealed && maintenance) {
    warnings.push(`사용자 승인 Harness maintenance 활성: ${sealed}`)
  }
  for (const changedPath of paths) {
    const flags = riskFlagsFor(changedPath)
    if (flags.length) warnings.push(`위험 깃발 [${flags.join(', ')}]: ${changedPath}`)
  }
  hookContext('PreToolUse', unique(warnings))
}

function isTrackedRepoPath(root, repoPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', repoPath], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function validateDoneReport(root, repoPath) {
  if (!/(?:-DONE|_milestone-DONE)\.md$/i.test(repoPath)) return null
  const target = path.join(root, repoPath)
  if (!fs.existsSync(target)) return null
  const content = fs.readFileSync(target, 'utf8')
  const { fields } = parseFrontmatter(content)
  const tracked = isTrackedRepoPath(root, repoPath)
  const initialGate = doneReportGateResult(content, { tracked })
  if (initialGate.legacy) {
    return {
      blocking: false,
      message: `${repoPath}는 gate_version 없는 기존 문서라 strict 완료 게이트를 유예합니다.`,
    }
  }

  const reportPath = slash(fields.report_html || '')
  const htmlTarget = /^00\.Documents\/reports\/(?!.*\.\.)[^\r\n]+\.html$/i.test(reportPath)
    ? path.join(root, reportPath)
    : null
  const htmlContent = htmlTarget && fs.existsSync(htmlTarget)
    ? fs.readFileSync(htmlTarget, 'utf8')
    : null
  const gate = doneReportGateResult(content, { tracked, htmlContent })
  return gate.blocking
    ? { blocking: true, message: `${repoPath} strict 완료 게이트 실패: ${gate.issues.join(' / ')}` }
    : null
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
  const blockers = []
  for (const changedPath of paths) {
    const reason = reviewerReason(changedPath)
    if (reason) messages.push(`reviewer 권장(${reason}): ${changedPath}`)
    const report = validateDoneReport(root, changedPath)
    if (report?.blocking) blockers.push(report.message)
    else if (report?.message) messages.push(report.message)
    const size = sizeWarning(root, changedPath)
    if (size) messages.push(size)
  }
  if (blockers.length) deny(unique(blockers).join('\n'))
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

function verifyHookDigest(expectedDigest, sourcePath = fileURLToPath(import.meta.url)) {
  if (!/^[a-f0-9]{64}$/i.test(expectedDigest || '')) return false
  const actualDigest = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
  return actualDigest === expectedDigest.toLowerCase()
}

async function main() {
  const mode = process.argv[2]
  // Trust 전환 중 cached command가 오래됐어도 주 작업에 실패 소음을 만들지 않는다.
  // hooks.json의 digest와 doctor가 재신뢰 필요를 판정하고, stale Hook은 fail-open no-op이다.
  if (!verifyHookDigest(process.argv[3])) return
  const payload = await readPayload()
  const root = findGitRoot(payload.cwd || process.cwd())
  if (mode === 'prompt') runPrompt(payload, root)
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
