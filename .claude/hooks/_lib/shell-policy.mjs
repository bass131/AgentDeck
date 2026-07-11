import path from 'node:path'
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

function normalizedHarnessReference(token) {
  const normalizedToken = slash(token)
  const markers = ['.claude/', '.codex/', '.agents/skills/', 'agents.md', 'claude.md', '.gitattributes']
  for (const marker of markers) {
    const index = normalizedToken.toLowerCase().indexOf(marker)
    if (index < 0) continue
    const candidate = normalizedToken.slice(index).split(/['",();]/, 1)[0].replace(/[)\]]+$/, '')
    return path.posix.normalize(candidate).toLowerCase()
  }
  return null
}

export function isClaudeHarnessPath(repoPath = '') {
  const normalized = normalizedHarnessReference(repoPath)
    ?? path.posix.normalize(slash(repoPath).replace(/^\.\//, '')).toLowerCase()
  if (/^\.claude\/state(?:\/|$)/.test(normalized)) return false
  if (normalized === '.claude/changelog.md') return false
  if (/^\.claude\/projects\/[^/]+\/memory(?:\/|$)/.test(normalized)) return false
  if (/^(?:agents\.md|claude\.md|\.gitattributes)$/.test(normalized)) return true
  return /^\.claude(?:\/|$)/.test(normalized)
    || /^\.codex(?:\/|$)/.test(normalized)
    || /^\.agents\/skills(?:\/|$)/.test(normalized)
}

const harnessWriteCommands = new Set([
  'sed', 'tee', 'mv', 'cp', 'rm', 'touch', 'truncate',
  'set-content', 'add-content', 'clear-content', 'out-file', 'remove-item',
  'move-item', 'copy-item', 'rename-item', 'new-item', 'ni',
])

const powershellWriteCommands = new Set([
  ...harnessWriteCommands,
  'ac', 'clc', 'cpi', 'del', 'erase', 'mi', 'rd', 'ren', 'ri', 'rmdir', 'rni', 'sc',
])

const embeddedFileWritePattern = /(?:\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|truncateSync|truncate|renameSync|rename|copyFileSync|copyFile|rmSync|rm|unlinkSync|unlink)\s*\(|\bDeno\.(?:writeTextFile|writeFile|remove|rename|copyFile|truncate)\s*\(|\[(?:System\.)?IO\.File\]::(?:WriteAllText|AppendAllText|Create|OpenWrite|Move|Copy|Delete)\s*\()/i

function executableIndex(tokens) {
  let start = 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[start] || '')) start += 1
  while (['sudo', 'env'].includes(commandName(tokens[start] || ''))) start += 1
  return start
}

function containsDirectWriteCommand(tokens, writeCommands = harnessWriteCommands) {
  return splitCommandSegments(tokens).some((segment) => {
    const start = executableIndex(segment)
    return writeCommands.has(commandName(segment[start] || ''))
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
  return null
}

function containsEmbeddedWrite(tokens) {
  return splitCommandSegments(tokens).some((segment) => {
    const embedded = runtimeCode(segment)
    if (!embedded) return false
    if (embeddedFileWritePattern.test(embedded.code)) return true
    return ['powershell', 'pwsh'].includes(embedded.runtime)
      && containsDirectWriteCommand(shellTokens(embedded.code), powershellWriteCommands)
  })
}

export function harnessShellWriteReason(command = '') {
  const tokens = shellTokens(command)
  const directWrite = containsDirectWriteCommand(tokens)
  const harnessRedirection = tokens.some((token, index) => (token === '>' || token === '>>')
    && normalizedHarnessReference(tokens[index + 1] || ''))
  const embeddedWrite = containsEmbeddedWrite(tokens)
  if (!(directWrite || harnessRedirection || embeddedWrite)) return null
  const references = [...new Set(tokens.map(normalizedHarnessReference).filter(Boolean))]
  if (!references.length) return null
  const allowed = references.every((reference) => /^\.claude\/state(?:\/|$)/.test(reference)
    || reference === '.claude/changelog.md')
  return allowed ? null : '하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기'
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
