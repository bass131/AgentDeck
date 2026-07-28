import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

function slash(value) {
  return value.replaceAll('\\', '/')
}

// 셸 주석(#) 선처리 — POSIX상 주석은 *단어 시작 위치*의 #부터 줄 끝까지다.
// (HR2 P05, 2026-07-25) 옛 구현은 주석을 몰라서 `tee .claude/settings.json # it's fine`의
// 짝 없는 아포스트로피에 걸려 토큰 0을 냈고, 그 결과 sealed 후보가 통째로 사라져 봉인이
// 열렸다(fail-open). bash는 # 이후를 버리고 명령을 정상 실행하므로 실제 우회였다.
// ⚠️ 단어 중간의 #(`a#b`)은 주석이 아니다 — 잘라내면 경로·인자가 깨진다.
function stripShellComments(command = '') {
  let out = ''
  let quote = null
  let escaped = false
  let atWordStart = true
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      out += char
      escaped = false
      atWordStart = false
      continue
    }
    if (quote) {
      out += char
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"') escaped = true
      atWordStart = false
      continue
    }
    if (char === '\\') {
      out += char
      escaped = true
      atWordStart = false
      continue
    }
    if (char === "'" || char === '"') {
      out += char
      quote = char
      atWordStart = false
      continue
    }
    if (char === '#' && atWordStart) {
      while (index < command.length && command[index] !== '\n') index += 1
      out += '\n'
      atWordStart = true
      continue
    }
    out += char
    atWordStart = /[\s;&|(]/.test(char)
  }
  return out
}

// heredoc 본문 제거 — 개행을 명령 구분자로 승격한 것(🔴-1)의 **짝**.
// 본문은 데이터지 명령이 아니다. 제거하지 않으면 `cat > note.md <<EOF … rm -rf … EOF`
// 같은 정상 문서 작성이 통째로 오탐된다(승격 전에는 개행이 세그먼트를 안 나눠서
// 역설적으로 오탐이 없었다 — 한쪽만 고치면 반대편이 깨지는 관계다).
// ⚠️ 종료 델리미터를 못 찾으면 **제거하지 않는다**: 파일 끝까지 삼키면 뒤따르는 실제
// 명령이 사라져 fail-open이 된다. 못 찾을 때 원본을 남기면 과차단 쪽으로 기운다.
// ⚠️ 호출 순서는 주석 제거 **다음**이다. 반대로 하면 `# <<EOF`(주석 속 heredoc)가
// 진짜 heredoc으로 인식돼 뒤 명령을 통째로 삼키는 우회가 열린다.
// heredoc 본문을 **표준입력으로 받아 실행**하는 명령들. 이 목록에 있으면 본문은 데이터가 아니다.
const HEREDOC_INTERPRETERS = new Set([
  'bash', 'sh', 'zsh', 'ksh', 'dash', 'node', 'python', 'python3', 'py',
  'perl', 'ruby', 'pwsh', 'powershell',
])

function lineRunsInterpreter(line = '') {
  for (const segment of splitCommandSegments(tokenizeShell(line).tokens)) {
    if (HEREDOC_INTERPRETERS.has(commandName(segment[executableIndex(segment)] || ''))) return true
  }
  return false
}

function stripHeredocs(command = '') {
  const lines = command.split('\n')
  const out = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    out.push(line)
    // `<<EOF` · `<<-EOF` · `<<'EOF'` · `<<"EOF"` — `<<<`(here-string)는 델리미터가 없어 제외된다.
    const opener = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line)
    if (!opener) continue
    const delimiter = opener[2]
    let end = -1
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (lines[scan].trim() === delimiter) {
        end = scan
        break
      }
    }
    if (end < 0) continue // 미종료 heredoc — 원본 유지(fail-closed)
    // ⚠️ 본문이 **데이터가 아니라 명령인** 경우가 있다(reviewer 2026-07-26 🔴-2 실측):
    // `bash -s <<'SH' … SH`·`sh <<EOF … EOF`는 본문을 표준입력으로 받아 그대로 실행한다.
    // 옛 구현은 본문을 무조건 지웠으므로 이 한 형태로 축①·축②·봉인이 동시에 눈멀었다.
    // 그래서 opener 줄의 실행부가 인터프리터면 본문을 **남긴다** — 개행이 세그먼트
    // 구분자이므로 남기기만 하면 각 줄이 정상 판정된다. `cat > note.md <<EOF`처럼
    // 데이터를 소비하는 형태는 종전대로 제거해 오탐(이 함수의 존재 이유)을 지킨다.
    if (lineRunsInterpreter(line)) continue
    index = end // 본문 + 델리미터 줄을 통째로 건너뛴다
  }
  return out.join('\n')
}

function tokenizeShell(command, ignoreQuotes = false) {
  const tokens = []
  let current = ''
  let quote = null
  let escaped = false
  // 명령 치환(`$(…)`·`` `…` ``) 진입 시 **바깥 따옴표 상태**를 보관한다. 셸에서 큰따옴표 안의
  // 치환은 실제로 실행되므로(작은따옴표 안은 리터럴), 치환 안으로 들어가면 따옴표를 일시
  // 해제해 본문을 명령으로 토큰화하고 닫을 때 원상복구한다. (reviewer 2026-07-26 🔴-1)
  const substitutions = []
  const flush = () => {
    if (current) tokens.push(current)
    current = ''
  }
  const pushDelimiter = (text) => {
    flush()
    tokens.push(text)
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    // 치환 진입은 따옴표 검사보다 **먼저** 판정한다 — 큰따옴표 안에서도 열리기 때문이다.
    if (quote !== "'" && char === '$' && command[index + 1] === '(') {
      substitutions.push({ quote, closer: ')' })
      quote = null
      pushDelimiter('(')
      index += 1
      continue
    }
    if (quote !== "'" && char === '`') {
      const top = substitutions[substitutions.length - 1]
      if (top && top.closer === '`') {
        pushDelimiter('`')
        quote = substitutions.pop().quote
      } else {
        substitutions.push({ quote, closer: '`' })
        quote = null
        pushDelimiter('`')
      }
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && /["\\]/.test(command[index + 1] || '')) escaped = true
      else current += char
      continue
    }
    if (char === '\\') {
      // 따옴표 밖 백슬래시 = 다음 문자를 리터럴로 만들고 자신은 사라진다(POSIX).
      // (HR2 P05 reviewer 🔴-4) 옛 구현엔 이 분기가 없어 `\`가 토큰에 그대로 남았고,
      // `tee \<개행>.claude/settings.json`(bash에선 줄 이음 = 평범한 tee)이 한 토큰으로
      // 뭉쳐 sealed 판정을 통째로 잃었다. 긴 명령을 정렬할 때 자연히 나오는 형태라
      // 적대적 의도 없이도 봉인이 뚫렸다.
      if (command[index + 1] === '\n') {
        index += 1 // 줄 이음 — 백슬래시와 개행을 둘 다 소거
        continue
      }
      escaped = true
      continue
    }
    if (char === "'" || char === '"') {
      if (!ignoreQuotes) quote = char
      continue
    }
    if (char === '\n') {
      // 개행은 공백이 아니라 **명령 구분자**다. (HR2 P05 reviewer 🔴-1)
      // 옛 구현은 개행을 공백으로 취급해, 둘째 줄 명령이 첫 세그먼트에 흡수되고
      // 실행 이름이 앞줄 명령(`echo` 등)으로 읽혔다 — `echo hi`↵`rm -rf …` 한 방에
      // 봉인(CORE-01/11)과 파괴 금지(CORE-07)가 동시에 무력화됐다.
      flush()
      tokens.push(';')
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
    // 서브셸 그룹핑 `( … )` — 단어 경계가 필요 없어 `(git`처럼 실행 이름에 들러붙는다.
    // 그 상태로는 `commandName('(git')`이 `git`과 일치하지 않아 판정기가 통째로 눈이 먼다:
    // `(cd .claude/hooks && echo x > supervisor-guard.sh)`가 봉인을 그대로 통과했다
    // (괄호 없는 같은 명령은 차단 — 2026-07-26 reviewer 실측). `{ … }`는 셸이 단어 경계를
    // 요구해 이미 별도 토큰이므로 splitCommandSegments에서만 다룬다.
    if (char === '(' || char === ')') {
      pushDelimiter(char)
      if (char === ')') {
        const top = substitutions[substitutions.length - 1]
        if (top && top.closer === ')') quote = substitutions.pop().quote
      }
      continue
    }
    current += char
  }
  flush()
  return { tokens, unbalanced: Boolean(quote) }
}

function shellTokens(command = '') {
  const cleaned = stripHeredocs(stripShellComments(command))
  const parsed = tokenizeShell(cleaned)
  if (!parsed.unbalanced) return parsed.tokens
  // 주석을 걷어낸 뒤에도 불균형 = 판정 불가. 옛 semantics는 토큰 0을 반환해 **통과**시켰다
  // (fail-open). 이제 따옴표를 일반 문자로 보고 best-effort 재토큰화한다 — 과차단은
  // 사람 승인으로 회복되지만, 과통과는 봉인 자체가 없는 것과 같다(fail-closed 원칙).
  return tokenizeShell(cleaned, true).tokens
}

// 실제 실행 위치 앞에 올 수 있는 접두사 — 이걸 건너뛰지 않으면 세그먼트 첫 토큰이
// 접두사가 되어 쓰기 명령 이름이 판정기 눈에 안 보인다(`exec tee <sealed>` 등).
// (HR2 P05, reviewer 미검증 #7에서 파생 — 종전에는 sudo·env만 건너뛰었다.)
// `timeout`·`nice`·`npx`는 적대적 의도 없이도 자연히 나온다(reviewer 2026-07-26 🟡-6).
const EXEC_PREFIXES = new Set([
  'sudo', 'env', 'exec', 'nohup', 'command', 'time', 'xargs', 'stdbuf',
  'timeout', 'nice', 'ionice', 'npx',
])
// 접두사 자신이 값 인자를 먹는 경우 — `timeout 60 …`·`nice -n 10 …`(숫자 하나).
const NUMERIC_ARG_PREFIXES = new Set(['timeout', 'nice', 'ionice'])

function commandName(token = '') {
  return slash(token).split('/').at(-1).replace(/\.(?:exe|cmd|bat)$/i, '').toLowerCase()
}

// 복합 명령의 앞머리 키워드 — 이걸 벗기지 않으면 세그먼트 실행부가 `then`·`do`로 읽혀
// 뒤따르는 진짜 명령이 판정기 눈에 안 보인다(`if true; then git push; fi` 통과 — 실측).
// 정확 일치라 `git for-each-ref` 같은 실명령은 걸리지 않는다.
const SEGMENT_KEYWORDS = new Set([
  'if', 'then', 'elif', 'else', 'fi', 'while', 'until', 'do', 'done',
  'for', 'case', 'esac', 'in', 'select', 'function', '!',
])

function splitCommandSegments(tokens) {
  const segments = []
  let current = []
  const flushSegment = () => {
    let start = 0
    while (start < current.length && SEGMENT_KEYWORDS.has(current[start].toLowerCase())) start += 1
    const trimmed = current.slice(start)
    if (trimmed.length) segments.push(trimmed)
    current = []
  }
  for (const token of tokens) {
    // 그룹핑·치환 경계도 세그먼트 구분자다 — `(`·`)`·`` ` ``는 tokenizeShell이 이미 떼어 놓고,
    // `{`·`}`는 셸 문법상 공백으로 분리돼 있다.
    if (/^(?:;|&&?|\|\|?|[(){}`])$/.test(token)) flushSegment()
    else current.push(token)
  }
  flushSegment()
  return segments
}

// 파이프 체인 — `|`로만 이어진 세그먼트 묶음. 파이프는 데이터 흐름이라 sealed 후보의 역할을
// 세그먼트 단독으로 판정할 수 없다(`echo <sealed> | xargs rm` — 생산자와 소비자가 다른
// 세그먼트, BZ P06 reviewer 🔴-C). `&&`·`;`·`||`·그룹 경계는 체인을 끊는다 — 조회 파이프가
// 무관한 쓰기와 한 호출에 섞이는 정상 패턴(백로그 14 오탐 클래스)을 다시 물지 않기 위해서다.
function splitPipeChains(tokens) {
  const chains = []
  let chain = []
  let current = []
  const flushSegment = () => {
    let start = 0
    while (start < current.length && SEGMENT_KEYWORDS.has(current[start].toLowerCase())) start += 1
    const trimmed = current.slice(start)
    if (trimmed.length) chain.push(trimmed)
    current = []
  }
  const flushChain = () => {
    flushSegment()
    if (chain.length) chains.push(chain)
    chain = []
  }
  for (const token of tokens) {
    if (token === '|') flushSegment()
    else if (/^(?:;|&&?|\|\||[(){}`])$/.test(token)) flushChain()
    else current.push(token)
  }
  flushChain()
  return chains
}

// git 전역 옵션 중 **값을 별도 토큰으로 받는** 것들. 빠지면 그 값이 서브커맨드로 읽혀
// 판정이 통째로 어긋난다(`git --attr-source HEAD push` — reviewer 2026-07-26 🟡-5 실측).
const GIT_VALUE_FLAGS = /^(?:-c|-C|--git-dir|--work-tree|--namespace|--config-env|--exec-path|--attr-source|--super-prefix)$/i

function gitSubcommandIndex(tokens, start) {
  let index = start + 1
  while (index < tokens.length) {
    const token = tokens[index]
    if (!token.startsWith('-')) return index
    if (GIT_VALUE_FLAGS.test(token)) index += 2
    else index += 1
  }
  return -1
}

function destructiveSegmentReason(tokens) {
  const start = executableIndex(tokens) // 접두사·그 인자 건너뛰기를 한 곳에서 소유한다(🟡-6)
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
    // ⚠️ 옛 `.claude/changelog.md` allowed 예외는 ADR-041(2026-07-28)로 제거됐다 — CHANGELOG
    // 본체는 00_Documents/CHANGELOG.md로 이동했고, 남은 .claude/CHANGELOG.md는 고정 포인터라
    // 다른 .claude/** 와 같은 봉인 대상이다(아래 정규식이 잡는다). 예외를 되살리지 말 것.
    if (/^(?:claude\.md|agents\.md|\.gitattributes)$/.test(rel)) return 'sealed'
    if (/^\.claude(?:\/|$)/.test(rel)) return 'sealed'
    if (/^\.codex(?:\/|$)/.test(rel)) return 'sealed'
    if (/^\.agents\/skills(?:\/|$)/.test(rel)) return 'sealed'
    // ADR-037(유지보수 창 2026-07-17): 의미 정본 층 봉인 확장 — harness 코어·ADR 본문·ADR 인덱스.
    // ⚠️ 구분자 `[._]`는 폴더 개명(ADR-028 개정 1, `00.Documents` → `00_Documents`) 전환의
    // 신·구 병행 수용이다. 어느 한쪽으로 일원화하면 전환 구간에 반드시 구멍이 생기고,
    // 매칭 실패는 곧 'unrelated' = **봉인 해제 방향**이라 오타 하나가 보안 사고가 된다.
    // 존재하지 않는 쪽이 매칭돼도 무해하므로 봉인 범위는 넓어지지 않는다.
    // ⚠️ NC(ADR-039, 2026-07-26): `(?:\d{2}_)?`는 번호 접두 개명(`harness` → `00_Harness`,
    // `adr` → `01_Adr`)의 병행 수용이다. **특정 번호를 나열하지 않은 이유**는 번호가
    // 「읽는 순서」라서 문서가 하나 끼어들면 재정렬되기 때문이다 — `00_`·`01_`을 하드코딩하면
    // 재정렬 때마다 봉인이 조용히 풀린다. 봉인 방향은 집합을 넓히는 쪽이라 fail-closed 이고,
    // 존재하지 않는 번호가 매칭돼도 무해하다(영구 존치해도 되는 부류).
    if (/^00[._]documents\/(?:\d{2}_)?(?:harness|adr)(?:\/|$)/.test(rel)) return 'sealed'
    if (/^00[._]documents\/adr\.md$/.test(rel)) return 'sealed'
    // ADR-038(유지보수 창 2026-07-24): OpenGate 봉인 — bat·flag·canonical은 영호 단독(자기 개방 방지).
    if (/^98[._]management\/harness_opengate(?:\/|$)/.test(rel)) return 'sealed'
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
const CANDIDATE_TERM = "[^'\"`,;()\\s=&|<>]"
const HARNESS_MARKERS = '(?:\\.claude|\\.codex|\\.agents/skills|claude\\.md|agents\\.md'
  // ⚠️ NC(ADR-039): `(?:\d{2}_)?`는 위 classifyHarnessPath의 봉인 정규식과 **짝**이다.
  // 여기만 빠지면 Edit 도구 경로는 막히는데 셸 우회 쓰기(`tee`·`>`·`sed -i`)는 통과한다.
  + '|\\.gitattributes|00[._]documents/(?:\\d{2}_)?(?:harness|adr)|adr\\.md|harness_opengate)'
const HARNESS_CANDIDATE_RE = new RegExp(`${CANDIDATE_TERM}*${HARNESS_MARKERS}${CANDIDATE_TERM}*`, 'gi')
// 경로 구분자 경계 기준의 2차 추출 (HR2 P05 reviewer 🔴-4). greedy 버전은 마커 앞에 붙은
// 비경로 문자까지 통째로 삼켜 unrelated로 만든다 — `sed 'w.claude/settings.json'`(w 뒤
// 공백은 선택), `\.claude/…`(백슬래시 이음)가 실측 우회였다. 여기서는 마커 왼쪽을
// "`/`로 끝나는 디렉토리 부분" 으로 한정해 다시 뽑는다.
const HARNESS_CANDIDATE_ANCHORED_RE = new RegExp(
  `(?:${CANDIDATE_TERM}*/)?${HARNESS_MARKERS}${CANDIDATE_TERM}*`, 'gi',
)

function extractHarnessCandidates(text = '') {
  const normalized = slash(text)
  // 두 추출을 합집합으로 쓴다 — 과잉 추출은 무해하다(classifyHarnessPath가 앵커로 거른다).
  return [
    ...(normalized.match(HARNESS_CANDIDATE_RE) ?? []),
    ...(normalized.match(HARNESS_CANDIDATE_ANCHORED_RE) ?? []),
  ]
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
  for (;;) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[start] || '')) { start += 1; continue }
    const name = commandName(tokens[start] || '')
    if (!EXEC_PREFIXES.has(name)) return start
    start += 1
    // 접두사 자신의 플래그·값 인자를 건너뛴다 — 종전에는 접두사 토큰 하나만 넘겨서
    // `npx --yes gh pr create`의 실행부가 `--yes`로 읽혔다(reviewer 🟡-6 실측).
    while ((tokens[start] || '').startsWith('-')) start += 1
    if (NUMERIC_ARG_PREFIXES.has(name) && /^[0-9]/.test(tokens[start] || '')) start += 1
  }
}

// ── sed는 읽기도 쓰기도 한다 (HR2 P05, 2026-07-25) ────────────────────────────
// 이름만으로 판정하면 `sed -n '1,50p' <sealed>` 같은 읽기가 오탐된다. 반대로 `-i`만
// 조건으로 삼으면 스크립트의 w/W 명령(`sed '1w <sealed>'`)이 새로 뚫린다 — 양쪽을 다 본다.
// ⚠️ 세그먼트 좁히기는 하지 않는다: 기록된 오탐 표본은 sed와 sealed 경로가 같은 세그먼트라
// 좁히기로는 해소되지 않고, 변수 우회(`F=<sealed>; sed -i … $F`) 방어만 잃는다.
const SED_INPLACE_RE = /^(?:--in-place(?:=.*)?|-[a-z]*i.*)$/i
// 주소부 + w/W/e 명령 (`1w file` · `$W file` · `/re/w file` · `1!w file` · `\%re%w file` · `1e cmd`)
// (HR2 P05 reviewer 🔴-2) 첫 구현의 주소 문자류 `[0-9,$~+\s]`에는 부정(`!`)도 임의 구분자
// 주소(`\%re%`)도 없어서, sed를 무조건 차단에서 조건부로 바꾼 순간 아래 형태가 새로 열렸다.
// GNU sed 4.9 실측으로 다섯 형태 전부 실제 파일을 쓴다는 것을 확인했다.
// ⚠️ `e`는 패턴스페이스를 **셸 명령으로 실행**한다 — 파일 쓰기보다 넓은 통로다.
// ⚠️ 모든 대안에서 백슬래시는 **첫 분기로만** 소비된다(`\\[^]`). `\\.|[^]` 처럼 두 분기가
// 백슬래시에서 겹치면 한 글자를 소비하는 방법이 둘이 되어 백트래킹이 지수로 터진다
// (실측: 백슬래시 40연속에 3,652ms — 판정기가 멈추면 훅이 타임아웃되고, 훅 타임아웃은
// 차단이 아니라 **조용한 통과**다). 겹침을 없애면 각 위치의 선택지가 1개라 선형이 된다.
const sedAddress = (group) => '(?:/(?:\\\\[^]|[^\\\\/])*/'      // /re/
  + `|\\\\(.)(?:\\\\[^]|(?!\\${group})[^\\\\])*?\\${group}`     // \%re% 등 임의 구분자
  + '|[0-9]+|\\$|[0-9]*[~+][0-9]+)[IM]?'                       // 행번호 · $ · 범위 · 수식자
const SED_SCRIPT_W_RE = new RegExp(
  '(?:^|[;\\n{}])\\s*'                                         // 명령 경계
  + `(?:${sedAddress(1)}(?:\\s*,\\s*${sedAddress(2)})?)?`      // 주소 0~2개
  + '\\s*!*\\s*'                                               // 부정
  + '(?:[wW]\\s*\\S|e\\b)',                                    // w/W 파일(공백 선택) · e 실행
)
// s///w 플래그 (`s/a/b/w file` · `s|a|b|gw file`)
// 백슬래시 겹침 제거는 sedAddress 주석 참조 — 여기가 실측 폭발 지점이었다.
const SED_SUBST_W_RE = /s(.)(?:\\[^]|(?!\1)[^\\])*?\1(?:\\[^]|(?!\1)[^\\])*?\1[a-z0-9]*[wW]/

function sedSegmentWrites(segment, start) {
  const args = segment.slice(start + 1)
  if (args.some((arg) => arg.startsWith('-') && SED_INPLACE_RE.test(arg))) return true
  const scripts = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    // -f/--file은 스크립트 **파일**이다 — 내용이 판정기 시야 밖이므로 쓰기로 간주한다
    // (reviewer 🟡-6: 옛 구현은 파일명을 인라인 스크립트인 양 정규식에 넣었다).
    if (/^-[a-z]*f$/i.test(arg) || /^--file=/i.test(arg)) return true
    if (/^-[a-z]*e$/i.test(arg)) {
      scripts.push(args[index + 1] ?? '')
      index += 1
      continue
    }
    if (/^--expression=/i.test(arg)) {
      scripts.push(arg.slice(arg.indexOf('=') + 1))
      continue
    }
    // 옵션이 아닌 첫 인자가 스크립트(-e/-f가 하나도 없을 때만)
    if (!arg.startsWith('-') && scripts.length === 0) scripts.push(arg)
  }
  return scripts.some((script) => SED_SCRIPT_W_RE.test(script) || SED_SUBST_W_RE.test(script))
}

// git 서브커맨드 중 워킹트리 파일을 실제로 바꾸는 것들 (HR2 P05 우선순위 4).
// P08이 `git mv`를 대량 승인시키므로 승인 피로가 곧 우회 키 입력이 된다.
// ⚠️ add/commit은 파일 내용을 바꾸지 않으므로 여기 없다 — 그쪽은 실행 경계(②절) 소관.
// ⚠️ 한계 두 가지를 정직하게 적어 둔다(reviewer 🟡-3·🟡-4):
//   ① `git apply <patch>`는 패치 **내용**의 경로가 시야 밖이다. 목록 등재가 잡는 것은
//      명령줄에 sealed 경로가 드러난 경우뿐 — 방어가 아니라 부분 커버다.
//   ② `git switch <branch>`·`git stash pop`은 경로 토큰 없이도 워킹트리의 `.claude/**`를
//      갈아엎는다. 경로 토큰 기반 판정기로는 **원리적으로** 못 잡는다(sealed 후보가
//      명령줄에 없으면 AND 조건이 성립하지 않는다). 그쪽은 브랜치 운영 규율의 몫이다.
const GIT_WRITE_SUBCOMMANDS = new Set([
  'mv', 'rm', 'restore', 'checkout', 'apply', 'clean',
  // 경로 인자를 받아 파일을 만들거나 덮어쓰는 것들 (reviewer 🟡-2 실측: 전부 통과였다)
  'config', 'archive', 'bundle', 'format-patch', 'worktree', 'init',
])
// stash만 하위 동사로 갈린다 — list/show는 읽기다 (reviewer 🟡-5: P05가 만든 오탐).
const GIT_STASH_READ_VERBS = new Set(['list', 'show'])

function gitSegmentWrites(segment, start) {
  const subcommandIndex = gitSubcommandIndex(segment, start)
  if (subcommandIndex < 0) return false
  const subcommand = segment[subcommandIndex].toLowerCase()
  if (subcommand === 'stash') {
    return !GIT_STASH_READ_VERBS.has((segment[subcommandIndex + 1] || '').toLowerCase())
  }
  return GIT_WRITE_SUBCOMMANDS.has(subcommand)
}

function containsDirectWriteCommand(tokens, writeCommands = harnessWriteCommands) {
  return splitCommandSegments(tokens).some((segment) => {
    const start = executableIndex(segment)
    const name = commandName(segment[start] || '')
    if (name === 'sed') return sedSegmentWrites(segment, start)
    if (name === 'git') return gitSegmentWrites(segment, start)
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

// cd/pushd가 옮긴 작업 디렉토리 기준으로 상대경로를 절대화한다 (HR2 P05 reviewer 🔴-3).
function resolveAgainst(baseDir, target, homeDir) {
  let value = slash(String(target)).trim()
  if (!value) return baseDir
  if (value === '~') return slash(homeDir)
  if (value.startsWith('~/')) return `${slash(homeDir)}/${value.slice(2)}`
  value = driveNormalize(value)
  if (isAbsolutePath(value)) return value
  return `${slash(baseDir)}/${value}`
}

export function harnessShellWriteReason(command = '', opts = {}) {
  const tokens = shellTokens(command)
  const homeDir = opts.homeDir ?? os.homedir()
  const sealedCandidates = (text) => extractHarnessCandidates(text)
    .filter((candidate) => classifyHarnessPath(candidate, opts) === 'sealed')
  const classifyToken = (text) => extractHarnessCandidates(text)
    .map((candidate) => classifyHarnessPath(candidate, opts))

  // ── sealed 후보의 역할 귀속 (BZ P01 2026-07-27, 백로그 14) ────────────────────
  // 옛 구현은 sealed 후보([...tokens, command] 전역)와 쓰기 존재(전역)를 AND 해서,
  // 두 조건이 **서로 다른 세그먼트**에서 와도 발화했다 — 변수 우회(`F=<sealed>;
  // sed -i … $F`) 방어의 의도된 대가였지만, 읽기 인자의 마커(`grep --exclude-dir=.codex`·
  // `git check-attr <sealed>`)가 무관한 쓰기와 한 호출에 섞이기만 해도 차단되는 오탐을
  // 낳았다(라이브 3중 확증). 이제 sealed 후보는 **출처 역할**이 있어야 트리거다:
  //   ① 쓰기 벡터가 있는 세그먼트의 토큰(직접 쓰기·git 쓰기 서브커맨드·임베디드 쓰기)
  //   ② 리다이렉트 대상 — 아래 cwd 추적 루프(기존 로직, 자체로 sealed 확정)
  //   ③ 변수 할당 토큰의 우변 — 변수 우회 방어 유지(쓰기가 어느 세그먼트든 fail-closed)
  //   ④ 원문에서만 발견된 후보 — 토큰화가 따옴표 밖 백슬래시를 소거해 Windows 경로가
  //      깨진 경우다. 역할 판정이 불가능하므로 옛 전역 AND를 유지한다(fail-closed —
  //      `cmd /c mklink .claude\evil.lnk …` 차단이 이 경로에 산다).
  // 읽기 명령의 인자로만 나온 후보는 트리거가 아니다. 과차단은 사람 승인으로 회복되지만
  // 오탐은 쓰기·조회 분리라는 우회 규율을 강요했다 — 귀속이 정밀해질수록 양쪽이 준다.
  //
  // 귀속의 단위는 세그먼트가 아니라 **파이프 체인**이다(BZ P06 재수리 — reviewer 🔴-C).
  // `|`는 앞 세그먼트의 출력을 뒤 세그먼트의 입력으로 넘기는 데이터 흐름이라, sealed
  // 생산자(`echo <sealed>`)와 쓰기 소비자(`xargs rm`)가 세그먼트로는 갈라져도 하나의
  // 쓰기 연산이다. 반면 `&&`·`;`는 독립 실행이므로 체인을 끊는다 — 이 구분이 없으면
  // 백로그 14 오탐(조회 파이프 + 무관 쓰기 혼합)이 되살아난다.
  const chains = splitPipeChains(tokens)
  let anyWrite = false
  let sealedInWriteSegment = false
  let sealedInAssignment = false
  // cd/pushd가 옮긴 작업 디렉토리를 세그먼트 선형 순서로 추적한다 — 리다이렉트 대상과
  // 쓰기 역할 세그먼트의 경로 인자를 "그 시점의 cwd" 기준으로 절대화하기 위해서다.
  // ⚠️ cwd 추적은 체인 귀속과 **한 루프**여야 한다 — 분리하면 「cd로 옮긴 cwd + 파이프
  // stdin 상대경로」(`cd .claude && echo settings.json | xargs rm` — 재리뷰 🔴 B∩C 실측)를
  // 체인 루프는 cwd를 몰라서, cwd 루프는 파이프 역할을 몰라서 양쪽 다 놓친다.
  let cwd = opts.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  let harnessRedirection = false
  for (const chain of chains) {
    const segmentWrites = chain.map((segment) =>
      containsDirectWriteCommand(segment) || containsEmbeddedWrite(segment, opts))
    const chainWrites = segmentWrites.some(Boolean)
    anyWrite = anyWrite || chainWrites
    for (let index = 0; index < chain.length; index += 1) {
      const segment = chain[index]
      // 쓰기 역할 = 자기 세그먼트가 쓰기 || 같은 파이프 체인에 쓰기 세그먼트 존재
      // (생산자의 인자·출력이 stdin으로 흘러 쓰기의 대상이 된다 — C 계열).
      const writeRole = segmentWrites[index] || (chainWrites && chain.length > 1)
      if (writeRole && segment.some((token) => sealedCandidates(token).length > 0)) {
        sealedInWriteSegment = true
      }
      for (const token of segment) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
          && sealedCandidates(token.slice(token.indexOf('=') + 1)).length > 0) {
          sealedInAssignment = true
        }
      }
      // 리다이렉트 대상은 그 시점의 cwd 기준으로 본다. 언제나 프로젝트 루트 기준이던
      // 옛 구현에서는 `cd .claude/hooks && echo x > supervisor-guard.sh` 한 줄로
      // 훅 파일을 덮어쓸 수 있었다(대상 토큰에 마커가 없어 후보 추출조차 되지 않았다).
      for (let t = 0; t < segment.length; t += 1) {
        if (segment[t] !== '>' && segment[t] !== '>>') continue
        const target = segment[t + 1] || ''
        if (!target) continue
        if (classifyHarnessPath(resolveAgainst(cwd, target, homeDir), opts) === 'sealed'
          || classifyToken(target).includes('sealed')) harnessRedirection = true
      }
      const start = executableIndex(segment)
      if (['cd', 'pushd'].includes(commandName(segment[start] || ''))) {
        const target = segment.slice(start + 1).find((token) => !token.startsWith('-'))
        if (target) cwd = resolveAgainst(cwd, target, homeDir)
      } else if (writeRole) {
        // 쓰기 역할 세그먼트의 경로 인자를 cwd로 절대화해 재검사한다 — 상대경로 인자는
        // 마커가 없어 후보 추출조차 되지 않는다(`cd .claude/hooks && rm supervisor-guard.sh`
        // — B 계열, 그리고 위 B∩C).
        for (const token of segment.slice(start + 1)) {
          if (token.startsWith('-') || token === '>' || token === '>>') continue
          if (classifyHarnessPath(resolveAgainst(cwd, token, homeDir), opts) === 'sealed') {
            sealedInWriteSegment = true
          }
        }
      }
    }
  }
  const tokenSealedSet = new Set(
    tokens.flatMap((token) => sealedCandidates(token).map((c) => c.toLowerCase())),
  )
  const rawOnlySealed = sealedCandidates(command)
    .some((candidate) => !tokenSealedSet.has(candidate.toLowerCase()))

  // 명령 치환(`$( … )`·백틱)은 값 흐름이다 — tokenizeShell이 치환 경계를 세그먼트 구분자로
  // 승격시켜 치환 본문이 별도 세그먼트로 갈라지므로, sealed 후보가 어느 명령의 인자였는지
  // 역할 귀속이 구조적으로 불가능하다(`cp evil.json $(echo <sealed>)` — reviewer 🔴-A).
  // 판정 불가는 트리거 ④(원문 전용 후보)와 같은 fail-closed 계열로 다룬다. 기준 원문은
  // 주석·heredoc을 걷어낸 cleaned다 — heredoc 본문의 문구(데이터)까지 물면 과차단이 된다.
  const cleanedCommand = stripHeredocs(stripShellComments(command))
  const hasSubstitution = /\$\(|`/.test(cleanedCommand)
  const anyRedirect = tokens.includes('>') || tokens.includes('>>')
  const substitutionTrigger = hasSubstitution
    && sealedCandidates(cleanedCommand).length > 0
    && (anyWrite || anyRedirect)

  const sealedTrigger = sealedInWriteSegment
    || harnessRedirection
    || (sealedInAssignment && anyWrite)
    || (rawOnlySealed && anyWrite)
    || substitutionTrigger
  if (!sealedTrigger) return null
  return '하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기'
}

// ── OpenGate 자기 개방 방어 (ADR-038 개정 1, 2026-07-25) ──────────────────────
// 방어 범위 = **실행·쓰기 벡터**. 옛 구현은 명령줄에 `harness_opengate`가 부분문자열로
// 들어가기만 해도 차단해서 `ls`·`cat`·`echo` 같은 언급·읽기까지 막았는데,
// ① 읽기는 Read/Glob 도구가 열려 있어 Bash만 막아 봐야 미달성 방어였고
// ② 차단 메시지가 대체 경로를 직접 안내해 방지턱이 아니라 표지판이 됐다.
// 쓰기 벡터(flag 직접 생성·canonical 덮어쓰기)는 classifyHarnessPath가 sealed로 처리한다.
const OPEN_GATE_SCRIPT_RE = /harness_opengate\/[^/]*\.(?:bat|cmd|ps1|sh|vbs)$/i
const SCRIPT_RUNNERS = ['cmd', 'start', 'bash', 'sh', 'powershell', 'pwsh', 'wscript', 'cscript', 'call']

export function openGateExecReason(command = '') {
  if (!/harness_opengate/i.test(slash(command))) return null
  const isGateScript = (token) => OPEN_GATE_SCRIPT_RE.test(slash(token || ''))
  // 원본과 **슬래시 정규화 사본**을 둘 다 판정한다. 토큰화는 POSIX대로 따옴표 밖
  // 백슬래시를 소거하므로(🔴-4 봉합의 대가), Windows 경로
  // `98.Management\Harness_OpenGate\OPEN-GATE.bat`가 토큰 단계에서 구분자를 잃는다.
  // 정규화 사본에서는 백슬래시가 `/`라 이스케이프로 읽히지 않아 경로가 살아남는다.
  for (const source of new Set([command, slash(command)])) {
    for (const segment of splitCommandSegments(shellTokens(source))) {
      const start = executableIndex(segment)
      if (isGateScript(segment[start])) return 'OpenGate 스크립트 직접 실행'
      if (SCRIPT_RUNNERS.includes(commandName(segment[start] || ''))
        && segment.slice(start + 1).some(isGateScript)) {
        return 'OpenGate 스크립트 실행(실행기 경유)'
      }
    }
  }
  return null
}

// ── CORE-06 비가역 사람 게이트 (A 스프린트 백로그 6, 2026-07-26) ──────────────
// 결함의 정체는 **층의 비대칭**이었다. CORE-11(하네스 봉인)은 permission deny + 훅 2층인데
// CORE-06(비가역)은 permission `ask` 1층뿐이라, 세션 권한 모드가 권한 계층을 건너뛰면
// 봉인은 버티고 비가역 게이트만 통째로 죽었다(2026-07-26 push 2회 연속 무프롬프트 — 실측).
// 같은 모드에서 훅 exit 2는 살아 있다는 것도 같은 날 실측했으므로, 빠진 층을 여기 채운다.
//
// ⚠️ 이 판정기는 **묻지 않는다, 닫는다**. 훅이 할 수 있는 건 통과/차단뿐이고, payload만 보므로
// "이 명령을 사람이 승인했는가"를 원리적으로 알 수 없다 — 승인 flag를 두면 에이전트가 그 flag를
// 쓸 수 있어 방어가 자기 자신을 무효화한다(OpenGate가 굳이 배치파일인 이유와 같다). 그래서
// 에이전트에게는 항상 닫고, 사람은 `!` 프리픽스로 실행한다(도구 호출이 아니라 로컬 셸 실행이라
// PreToolUse를 타지 않는다 — 2026-07-26 실측). 사람 경로가 항상 열려 있어 기능 손실은 없다.
const GH_PR_IRREVERSIBLE = new Map([['create', 'PR 생성'], ['merge', 'PR 머지']])
const GH_VALUE_FLAGS = /^(?:-R|--repo|--hostname)$/i
// ⚠️ `--workspaces`(복수)는 boolean이다 — 값 플래그로 등록하면 다음 토큰을 삼켜
// `npm --workspaces publish`가 통과한다(reviewer 2026-07-26 🟡-5 실측). 단수형만 값을 받는다.
const NPM_VALUE_FLAGS = /^(?:--prefix|-w|--workspace)$/i

// 위치 인자(서브커맨드) 후보를 찾는다. 등록된 값 플래그는 2칸 건너뛰지만, **미등록 롱플래그는
// 값을 가질지 모르므로 두 해석을 모두 따라간다** — 종전에는 1칸만 건너뛰어 그 값이 서브커맨드로
// 읽혔고, `npm --registry https://r publish`·`git --attr-source HEAD push`가 통과했다(🟡-5).
// 미지 플래그에서 기본 방향이 통과 쪽인 것이 결함의 본질이라, 여기서는 fail-closed로 뒤집는다.
// depth 상한은 조합 폭발 방지용이며, 넘어가도 1칸 해석은 항상 살아 있다.
function positionalCandidates(tokens, start, valueFlagRe) {
  const found = new Set()
  const walk = (from, depth) => {
    let index = from
    while (index < tokens.length) {
      const token = tokens[index]
      if (!token.startsWith('-')) { found.add(index); return }
      if (valueFlagRe.test(token)) { index += 2; continue }
      if (token.startsWith('--') && !token.includes('=') && depth < 4) walk(index + 2, depth + 1)
      index += 1
    }
  }
  walk(start + 1, 0)
  return [...found].sort((a, b) => a - b)
}

function irreversibleSegmentReason(tokens) {
  const start = executableIndex(tokens)
  const name = commandName(tokens[start] || '')
  const args = tokens.slice(start + 1)
  const lowerArgs = args.map((item) => item.toLowerCase())

  // 중첩 셸은 문자열 본문을 다시 판정한다. destructiveSegmentReason과 달리 cmd도 join 경유인데,
  // 토큰 배열을 그대로 넘기면 `cmd /c "git push"`처럼 본문이 한 토큰으로 묶인 경우를 놓친다.
  if (name === 'cmd') {
    const nested = lowerArgs.findIndex((item) => item === '/c' || item === '/k')
    if (nested >= 0) return irreversibleCommandReason(args.slice(nested + 1).join(' '))
  }
  if (['powershell', 'pwsh'].includes(name)) {
    const nested = lowerArgs.findIndex((item) => item === '-command' || item === '-c')
    if (nested >= 0) return irreversibleCommandReason(args.slice(nested + 1).join(' '))
  }
  if (['bash', 'sh'].includes(name)) {
    const nested = lowerArgs.findIndex((item) => /^-[a-z]*c$/.test(item))
    if (nested >= 0) return irreversibleCommandReason(args.slice(nested + 1).join(' '))
  }

  if (name === 'git') {
    // git의 서브커맨드는 **첫 위치 인자**라는 성질이 강하다 — `git checkout push`의 push는
    // 브랜치지 서브커맨드가 아니다. positionalCandidates는 각 플래그 해석의 *첫* 후보만
    // 모으므로 그 성질이 그대로 보존된다.
    // `--dry-run`·`--help` 예외를 두지 않는다 — 플래그 조합마다 구멍 후보가 생기는 대가로 얻는 것이
    // 편의뿐이고, 사람 경로(`!`)가 열려 있어 손실이 없다.
    if (positionalCandidates(tokens, start, GIT_VALUE_FLAGS)
      .some((index) => tokens[index].toLowerCase() === 'push')) {
      return 'git push (원격 이력 갱신 — 비가역)'
    }
  }

  if (name === 'gh') {
    for (const groupIndex of positionalCandidates(tokens, start, GH_VALUE_FLAGS)) {
      const group = tokens[groupIndex].toLowerCase()
      // release는 현행 permission `ask`의 `gh release*` 범위를 그대로 승계한다. list·view까지
      // 포함하는 과차단이지만, 범위를 좁히는 것은 게이트 완화라 별도 결정 사항이다.
      if (group === 'release') return 'gh release (릴리스 조작 — 비가역)'
      if (group !== 'pr') continue
      for (const verbIndex of positionalCandidates(tokens, groupIndex, GH_VALUE_FLAGS)) {
        const verb = tokens[verbIndex].toLowerCase()
        if (GH_PR_IRREVERSIBLE.has(verb)) {
          return `gh pr ${verb} (${GH_PR_IRREVERSIBLE.get(verb)} — 비가역)`
        }
      }
    }
  }

  if (name === 'npm') {
    const positions = positionalCandidates(tokens, start, NPM_VALUE_FLAGS)
    const words = positions.map((index) => tokens[index].toLowerCase())
    if (words.includes('publish')) return 'npm publish (레지스트리 게시 — 취소 불가)'
    const runIndex = positions[words.indexOf('run')]
    if (runIndex !== undefined) {
      const scriptIndex = positionalCandidates(tokens, runIndex, NPM_VALUE_FLAGS)[0]
      const script = (tokens[scriptIndex] || '').toLowerCase()
      if (script.startsWith('package')) return `npm run ${script} (릴리스 패키징)`
    }
  }

  return null
}

// ⚠️ **알려진 한계**(이 모듈의 관례대로 범위를 본문 옆에 정직히 적어 둔다 — `GIT_WRITE_SUBCOMMANDS`
// 선례). 아래는 비가역이지만 **판정 대상이 아니다**: ① `gh api -X POST …/pulls`·`gh api --method PUT
// …/merge`(REST 직접 호출로 PR을 생성·머지할 수 있다) ② `gh repo delete`·`gh repo archive`
// ③ Git 원격을 직접 다루는 `git send-pack`·`git bundle`. CORE-06 v2가 범위를 "명령형 비가역 6종"으로
// 한정했으므로 계약 위반은 아니지만, **범위를 넓힐 때 여기부터 봐야 한다**. `permissions.ask`
// 2차층도 같은 범위라 이들은 두 층 모두에서 자유롭다.

export function irreversibleCommandReason(command = '') {
  for (const segment of splitCommandSegments(shellTokens(command))) {
    const reason = irreversibleSegmentReason(segment)
    if (reason) return reason
  }
  return null
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

// CLI는 모드를 **여러 개** 받는다. 훅 하나가 두 축을 물을 때 node 스폰이 2회 나던 것을
// 1회로 줄인다(reviewer 2026-07-26 🟡-10 — 스폰 1회 ≈ 92ms, PreToolUse(Bash) 총 6회였다).
// 출력 규약: 인자가 1개면 **이유 문자열 단독**(옛 형식 그대로 — 기존 호출부 무변경),
// 2개 이상이면 `<mode>:<이유>`로 어느 축이 걸렸는지 알린다. 이유에 `:`가 들어가도
// 호출부가 첫 `:`로만 자르면 안전하다. 모드는 **인자 순서대로** 판정하므로 우선순위를
// 호출부가 소유한다(축① 파괴를 축② 비가역보다 먼저 두는 이유 = dangerous-cmd-guard 주석).
if (isMain) {
  const modes = process.argv.slice(2)
  const input = await readStdin()
  const judge = (mode) => {
    if (mode === 'dangerous') return dangerousCommandReason(input)
    if (mode === 'irreversible') return irreversibleCommandReason(input)
    if (mode === 'shell-write') return harnessShellWriteReason(input)
    if (mode === 'open-gate-exec') return openGateExecReason(input)
    if (mode === 'path') return isClaudeHarnessPath(input.trim()) ? 'sealed' : null
    return null
  }
  for (const mode of modes) {
    const result = judge(mode)
    if (!result) continue
    process.stdout.write(modes.length > 1 ? `${mode}:${result}` : result)
    break
  }
}
