import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

function slash(value) {
  return value.replaceAll('\\', '/')
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
    if (!token.startsWith('-')) return index
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
    if ((shortFlags.includes('r') || lowerArgs.includes('--recursive'))
      && (shortFlags.includes('f') || lowerArgs.includes('--force'))) {
      return 'rm 재귀 강제 삭제 (rm -rf)'
    }
  }
  if (['remove-item', 'ri'].includes(name)
    && lowerArgs.includes('-recurse') && lowerArgs.includes('-force')) {
    return 'PowerShell 재귀 강제 삭제'
  }
  if (['del', 'erase', 'rd', 'rmdir'].includes(name)
    && lowerArgs.includes('/s') && lowerArgs.includes('/q')) {
    return '재귀 무확인 삭제'
  }
  if (name === 'cmd') {
    const nested = lowerArgs.findIndex((item) => item === '/c' || item === '/k')
    if (nested >= 0) return destructiveSegmentReason(args.slice(nested + 1))
  }
  if (['powershell', 'pwsh'].includes(name)) {
    const nested = lowerArgs.findIndex((item) => item === '-command' || item === '-c')
    if (nested >= 0) return dangerousCommandReason(args.slice(nested + 1).join(' '))
  }
  if (name === 'git') {
    const subcommandIndex = gitSubcommandIndex(tokens, start)
    if (subcommandIndex >= 0) {
      const subcommand = tokens[subcommandIndex].toLowerCase()
      const rest = tokens.slice(subcommandIndex + 1).map((item) => item.toLowerCase())
      if (subcommand === 'reset' && rest.includes('--hard')) return 'git reset --hard (작업 손실)'
      if (subcommand === 'clean') {
        const shortFlags = rest.filter((item) => /^-[^-]/.test(item)).join('').replaceAll('-', '')
        if ((shortFlags.includes('f') || rest.includes('--force'))
          && (shortFlags.includes('d') || rest.includes('--directories'))) {
          return 'git clean 강제 삭제 (미추적 파일 삭제)'
        }
      }
      if (subcommand === 'push') {
        const forced = rest.some((item) => item === '--force'
          || item.startsWith('--force-with-lease')
          || (/^-[^-]/.test(item) && item.slice(1).includes('f'))
          || item.startsWith('+'))
        if (forced) return 'git push 강제 갱신 (이력 덮어쓰기)'
      }
      if (['checkout', 'restore'].includes(subcommand)
        && rest.some((item) => item === '.' || item === '*')) {
        return `광범위한 git ${subcommand} 복원 (작업 손실)`
      }
    }
  }
  if (['mkfs', 'format-volume', 'clear-disk'].includes(name) || name.startsWith('mkfs.')) {
    return '디스크 포맷 또는 초기화 명령'
  }
  if (['format', 'format.com'].includes(name) && /^[a-z]:$/i.test(args[0] || '')) {
    return '드라이브 포맷 명령'
  }
  return null
}

export function dangerousCommandReason(command = '') {
  if (command.includes(':(){ :|:& };:')) return 'fork bomb'
  for (const segment of splitCommandSegments(shellTokens(command))) {
    const reason = destructiveSegmentReason(segment)
    if (reason) return reason
  }
  return null
}

// ── 경로 분류기 (GAP1 유지보수 창 2026-07-13, Codex 상담 C-core) ─────────────
// 옛 구현은 `.claude/` 마커를 indexOf 부분일치로 찾아 출처(어느 루트)를 잘라버려
// ① 홈 ~/.claude/plans(plan 모드 정상 저장)를 오탐 차단하고
// ② `.claude/hooks/../../../<repo>/.claude/settings.json` 재진입 우회를 통과시키고
// ③ memory 예외가 repo 경로에도 적용되는 구멍을 냈다.
// 새 구현 = 절대경로화 → `..` 해소 → repo/홈 앵커 세그먼트 비교의 3분류
// ('sealed' 봉인 / 'allowed' 예외 데이터 / 'unrelated' 무관).
// 홈 .claude는 등록 데이터 디렉토리(plans·projects/*/memory)만 allowed,
// 나머지(settings.json·전역 hooks 등 config)는 fail-closed 봉인 — 새 CLI 홈
// 디렉토리가 생기면 여기 등록 목록에 추가한다(조용히 열리지 않게).
// 알려진 한계(C-full 백로그): 심볼릭 링크 실경로·Windows 8.3 별칭은 문자열
// 비교로 해소 불가 — allowed 구역 안의 링크가 봉인 파일을 가리키는 벡터는
// ln/mklink 쓰기 명령 등재로 생성만 부분 완화된다.
// Windows 전제: 비교는 소문자 통일(대소문자 무시 파일시스템 기준).

function driveNormalize(value) {
  const gitBash = /^\/([a-z])(\/|$)/i.exec(value)
  if (gitBash) return `${gitBash[1]}:${value.slice(2) || '/'}`
  return value
}

function isAbsolutePath(value) {
  return /^[a-z]:\//i.test(value) || value.startsWith('/')
}

function normalizeAbsolute(value) {
  return path.posix.normalize(value).replace(/\/+$/, '').toLowerCase()
}

function anchorOf(rawDir) {
  return normalizeAbsolute(driveNormalize(slash(rawDir)))
}

function within(base, target) {
  return target === base || target.startsWith(`${base}/`)
}

const HOME_CLAUDE_ALLOWED_DATA = [
  /^plans(?:\/|$)/,
  /^projects\/[^/]+\/memory(?:\/|$)/,
]

export function classifyHarnessPath(rawPath = '', opts = {}) {
  const projectDir = opts.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const homeDir = opts.homeDir ?? os.homedir()
  let candidate = slash(String(rawPath)).trim()
  if (!candidate) return 'unrelated'
  if (candidate === '~') candidate = slash(homeDir)
  else if (candidate.startsWith('~/')) candidate = `${slash(homeDir)}/${candidate.slice(2)}`
  candidate = driveNormalize(candidate)
  if (!isAbsolutePath(candidate)) candidate = `${slash(projectDir)}/${candidate}`
  const normalized = normalizeAbsolute(candidate)
  const project = anchorOf(projectDir)
  const home = anchorOf(homeDir)

  if (within(project, normalized)) {
    const rel = normalized === project ? '' : normalized.slice(project.length + 1)
    if (/^\.claude\/state(?:\/|$)/.test(rel)) return 'allowed'
    if (rel === '.claude/changelog.md') return 'allowed'
    if (/^(?:claude\.md|agents\.md|\.gitattributes)$/.test(rel)) return 'sealed'
    if (/^\.claude(?:\/|$)/.test(rel)) return 'sealed'
    if (/^\.codex(?:\/|$)/.test(rel)) return 'sealed'
    if (/^\.agents\/skills(?:\/|$)/.test(rel)) return 'sealed'
    // ADR-037(유지보수 창 2026-07-17): 의미 정본 층 봉인 확장 — harness 코어·ADR 본문·ADR 인덱스.
    if (/^00\.documents\/(?:harness|adr)(?:\/|$)/.test(rel)) return 'sealed'
    if (rel === '00.documents/adr.md') return 'sealed'
    return 'unrelated'
  }

  const homeClaude = `${home}/.claude`
  if (within(homeClaude, normalized)) {
    const rel = normalized === homeClaude ? '' : normalized.slice(homeClaude.length + 1)
    if (HOME_CLAUDE_ALLOWED_DATA.some((pattern) => pattern.test(rel))) return 'allowed'
    return 'sealed'
  }

  return 'unrelated'
}

export function isClaudeHarnessPath(repoPath = '', opts = {}) {
  return classifyHarnessPath(repoPath, opts) === 'sealed'
}

// 토큰/임베디드 코드 문자열 안에서 하네스 후보 경로를 추출 — 과잉 추출은 무해
// (classifyHarnessPath가 앵커 기준으로 unrelated 판정). 종결 문자는 인용부호·
// 괄호·공백·연산자류.
const HARNESS_CANDIDATE_RE = /[^'"`,;()\s=&|<>]*(?:\.claude|\.codex|\.agents\/skills|claude\.md|agents\.md|\.gitattributes|00\.documents\/(?:harness|adr)|adr\.md)[^'"`,;()\s=&|<>]*/gi

function extractHarnessCandidates(text = '') {
  return slash(text).match(HARNESS_CANDIDATE_RE) ?? []
}

const harnessWriteCommands = new Set([
  'sed', 'tee', 'mv', 'cp', 'rm', 'touch', 'truncate', 'ln', 'mklink',
  'set-content', 'add-content', 'clear-content', 'out-file', 'remove-item',
  'move-item', 'copy-item', 'rename-item', 'new-item', 'ni',
])

const powershellWriteCommands = new Set([
  ...harnessWriteCommands,
  'ac', 'clc', 'cpi', 'del', 'erase', 'mi', 'rd', 'ren', 'ri', 'rmdir', 'rni', 'sc',
])

const embeddedFileWritePattern = /(?:\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|truncateSync|truncate|renameSync|rename|copyFileSync|copyFile|rmSync|rm|unlinkSync|unlink|symlinkSync|symlink|linkSync|link)\s*\(|\bDeno\.(?:writeTextFile|writeFile|remove|rename|copyFile|truncate|symlink|link)\s*\(|\[(?:System\.)?IO\.File\]::(?:WriteAllText|AppendAllText|Create|OpenWrite|Move|Copy|Delete)\s*\()/i

function executableIndex(tokens) {
  let start = 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[start] || '')) start += 1
  while (['sudo', 'env'].includes(commandName(tokens[start] || ''))) start += 1
  return start
}

function containsDirectWriteCommand(tokens, writeCommands = harnessWriteCommands) {
  return splitCommandSegments(tokens).some((segment) => {
    const start = executableIndex(segment)
    const name = commandName(segment[start] || '')
    if (writeCommands.has(name)) return true
    if (name === 'cmd') {
      const rest = segment.slice(start + 1)
      const nested = rest.findIndex((item) => /^\/[ck]$/i.test(item))
      if (nested >= 0) return containsDirectWriteCommand(rest.slice(nested + 1), writeCommands)
    }
    return false
  })
}

function runtimeCode(segment) {
  const start = executableIndex(segment)
  const runtime = commandName(segment[start] || '')
  const args = segment.slice(start + 1)
  if (runtime === 'node') {
    const inlineIndex = args.findIndex((arg) => /^(?:-[ep]{1,2}|--eval|--print)$/i.test(arg))
    if (inlineIndex >= 0) return { runtime, code: args.slice(inlineIndex + 1).join(' ') }
    const assigned = args.find((arg) => /^--(?:eval|print)=/i.test(arg))
    return assigned ? { runtime, code: assigned.slice(assigned.indexOf('=') + 1) } : null
  }
  if (runtime === 'deno') {
    const evalIndex = args.findIndex((arg) => ['-e', '--eval', 'eval'].includes(arg.toLowerCase()))
    return evalIndex >= 0 ? { runtime, code: args.slice(evalIndex + 1).join(' ') } : null
  }
  if (['powershell', 'pwsh'].includes(runtime)) {
    const commandIndex = args.findIndex((arg) => ['-command', '-c'].includes(arg.toLowerCase()))
    return commandIndex >= 0 ? { runtime, code: args.slice(commandIndex + 1).join(' ') } : null
  }
  // 유지보수 창 2026-07-17 (🟡-14): bash/sh -c 중첩 + perl(Git Bash 동봉) 등재.
  if (['bash', 'sh'].includes(runtime)) {
    const flagIndex = args.findIndex((arg) => /^-[a-z]*c$/i.test(arg))
    return flagIndex >= 0 ? { runtime, code: args.slice(flagIndex + 1).join(' ') } : null
  }
  if (runtime === 'perl') {
    const inPlace = args.some((arg) => /^-i/.test(arg))
    const evalIndex = args.findIndex((arg) => /^-[a-z]*[eE]$/.test(arg))
    if (evalIndex >= 0) return { runtime, code: args.slice(evalIndex + 1).join(' '), inPlace }
    return inPlace ? { runtime, code: '', inPlace } : null
  }
  return null
}

// perl open() 쓰기 모드('>', '>>', '+>') — 읽기 모드('<')는 통과.
const perlWritePattern = /\bopen\s*\([^)]*['"]\s*\+?>{1,2}/

function containsEmbeddedWrite(tokens, opts = {}) {
  return splitCommandSegments(tokens).some((segment) => {
    const embedded = runtimeCode(segment)
    if (!embedded) return false
    if (embedded.inPlace) return true // perl -i 인플레이스 편집 = 쓰기
    if (embeddedFileWritePattern.test(embedded.code)) return true
    if (embedded.runtime === 'perl') return perlWritePattern.test(embedded.code)
    if (['bash', 'sh'].includes(embedded.runtime)) {
      // 중첩 셸 문자열 재토큰화 — 직접 쓰기·sealed 리다이렉트·임베디드 재귀(bash -c 'node -e …').
      const nested = shellTokens(embedded.code)
      if (containsDirectWriteCommand(nested)) return true
      const sealedRedirect = nested.some((token, index) => (token === '>' || token === '>>')
        && extractHarnessCandidates(nested[index + 1] || '')
          .map((candidate) => classifyHarnessPath(candidate, opts))
          .includes('sealed'))
      if (sealedRedirect) return true
      return containsEmbeddedWrite(nested, opts)
    }
    return ['powershell', 'pwsh'].includes(embedded.runtime)
      && containsDirectWriteCommand(shellTokens(embedded.code), powershellWriteCommands)
  })
}

export function harnessShellWriteReason(command = '', opts = {}) {
  const tokens = shellTokens(command)
  const classifyToken = (text) => extractHarnessCandidates(text)
    .map((candidate) => classifyHarnessPath(candidate, opts))
  const verdicts = tokens.flatMap((token) => classifyToken(token))
  if (!verdicts.includes('sealed')) return null
  const directWrite = containsDirectWriteCommand(tokens)
  const harnessRedirection = tokens.some((token, index) => (token === '>' || token === '>>')
    && classifyToken(tokens[index + 1] || '').includes('sealed'))
  const embeddedWrite = containsEmbeddedWrite(tokens, opts)
  if (!(directWrite || harnessRedirection || embeddedWrite)) return null
  return '하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기'
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const mode = process.argv[2]
  const input = await readStdin()
  let result = null
  if (mode === 'dangerous') result = dangerousCommandReason(input)
  else if (mode === 'shell-write') result = harnessShellWriteReason(input)
  else if (mode === 'path') result = isClaudeHarnessPath(input.trim()) ? 'sealed' : null
  if (result) process.stdout.write(result)
}
