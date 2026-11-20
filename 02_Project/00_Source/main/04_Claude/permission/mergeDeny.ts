// 병합 명령 거부 (M07 G8, 안내 M08 G2) — PR 병합은 사람이 앱의 PR 카드에서 누르는 「병합」 버튼으로 한다. 저장소 규칙이 정한 로컬 병합은 이 노드 밖이다.
// 앱 세션의 에이전트가 셸로 부르는 병합 길 셋을 질문 없이 거부한다.
//   ① `gh pr merge` — 옵션 위치 변형(`gh -R o/r pr merge`, `gh pr -b x merge`)과 `--auto` 포함.
//   ② `gh api`의 `pulls/<n>/merge`·`pulls/<n>/merge-async` 경로 — 메서드와 관계없이(병합 여부 GET도 막힌다).
//   ③ `gh api graphql`의 `mergePullRequest`·`enablePullRequestAutoMerge`.
// 판독은 저장소 가드(.claude/hooks/dangerous-cmd-guard.mjs)의 낱말 규칙을 TS로 다시 쓴 것이다(gh 2.x 하위 명령 규칙).
// 명령 글자를 바꾸면 피해 가므로 L3다 — 실수만 막는다. 같은 토큰이라 서버는 받는다(goal 「하지 않을 것」 단계 B·C).
// 소스 제약(M09 G3 검수 중요 4): 하네스 같음 시험(.claude/hooks/cmd-guard-equivalence.test.mjs)이 이 파일을 Node의 타입 지우기로
// 직접 import해 가드와 판정을 맞춘다. 그래서 import는 `import type`만 쓰고(값 import는 확장자 없는 상대 경로라 Node가 못 찾는다),
// enum·namespace·parameter property처럼 지울 수 없는 TS 문법을 쓰지 않는다. mergeDeny.test.ts의 「merge-deny 소스」 시험이 지킨다.
import type { ControlNodeInfo } from './controlNodes'

// M08 G2(헌법 10조 효력 날 뒤): 이 노드는 작업 폴더와 관계없이 모든 앱 세션에 붙으므로 안내는 작업 폴더 중립이다.
// 호출 거부는 대상 브랜치와 관계없다. 로컬 `git merge`는 이 노드가 막지 않으며, 저장소 규칙이 정해 둔 경우에만 그 조건으로 쓴다
// (AgentDeck은 헌법 10조 — goal을 마일스톤 브랜치에 `git merge --no-ff`, 조건은 `hard-gates`·마지막 `PASS`·강 등급 독립 검수).
const REASON =
  'gh pr merge와 병합 API는 에이전트가 쓰지 않습니다(대상 브랜치와 관계없음). PR 병합은 사용자가 앱의 PR 카드에서 「병합」 버튼으로 합니다. 작업 폴더의 저장소 규칙이 에이전트의 로컬 병합(예: AgentDeck 헌법 10조의 마일스톤 브랜치 `git merge --no-ff`)을 정해 두었으면 그 규칙과 병합 조건을 따르고, 아니면 PR 생성까지만 하세요.'

// ── 셸 판독 ──────────────────────────────────────────────────────────────
// M09 G2: 루프 잠금 노드(loopLock.ts)가 같은 판독을 쓰도록 낱말 단위 함수를 내보낸다. 판정과 동작은 그대로다.
// 큰따옴표 안에서는 `\"`·`\\`·`\$`·`` \` ``만, 따옴표 밖에서는 `\"`·`\'`·`\\`만 이스케이프로 읽는다(가드와 같다).
const DQ_ESCAPABLE = new Set(['"', '\\', '$', '`'])
const BARE_ESCAPABLE = new Set(['"', "'", '\\'])
type Quote = '"' | "'" | null
const isEscape = (quote: Quote, ch: string, next: string | undefined): boolean =>
  ch === '\\' && next !== undefined && (quote === '"' ? DQ_ESCAPABLE.has(next) : quote === null && BARE_ESCAPABLE.has(next))

const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'ash', 'sh.exe', 'bash.exe'])
// heredoc 앞이 셸 실행(`bash <<EOF`, `sh -s <<EOF`)이면 본문이 명령이다.
const SHELL_TAIL = /(?:^|[\s;&|(])(?:\S*[\\/])?(?:ba|da|z|k|a)?sh(?:\.exe)?(?:\s+-\S+)*\s*$/i

// heredoc 본문을 지운다 — `--body "$(cat <<'EOF' … EOF)"`의 본문은 명령이 아니다.
// 셸에 먹이는 heredoc은 본문이 명령이라 지우지 않는다.
// 끝말에 따옴표가 없으면(`<<EOF`, `<<-EOF`) bash가 본문의 `$( … )`·`` ` … ` ``를 실행하므로, 그 안쪽 글을 명령 줄로 남긴다
// (독립 검수 사소 7). 따옴표 친 끝말(`<<'EOF'`, `<<"EOF"`)의 본문은 치환하지 않아 통째로 지운다.
function stripHeredocBodies(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)
    // here-string(`<<<`)과 산술 시프트(`$((a << n))`)는 heredoc이 아니다 — 앞뒤가 `<`가 아닌 `<<`만 본다
    const m = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(line)
    if (!m) continue
    if (SHELL_TAIL.test(line.slice(0, m.index))) continue
    const tabs = m[1] === '-'
    let j = i + 1
    while (j < lines.length && (tabs ? lines[j].replace(/^\t+/, '') : lines[j]).trimEnd() !== m[3]) j++
    // 끝 줄이 없으면 지우지 않는다 — 짝 없는 `<<`가 뒤 명령을 숨기지 않게 한다
    if (j >= lines.length) continue
    if (m[2] === '') out.push(...bodySubstitutions(lines.slice(i + 1, j).join('\n')))
    i = j
  }
  return out.join('\n')
}

// 따옴표 없는 heredoc 본문의 명령 치환 — 본문의 따옴표는 글자일 뿐이라 따옴표를 따지지 않는다. `\$`·`` \` ``는 글자다.
function bodySubstitutions(body: string): string[] {
  const found: string[] = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\') { i++; continue }
    if (ch === '$' && body[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < body.length; j++) {
        if (body[j] === '(') depth++
        else if (body[j] === ')' && --depth === 0) break
      }
      found.push(body.slice(i + 2, j))
      i = j
      continue
    }
    if (ch === '`') {
      const end = body.indexOf('`', i + 1)
      if (end < 0) break
      found.push(body.slice(i + 1, end))
      i = end
    }
  }
  return found
}

// `$( … )`·`` ` … ` ``의 안쪽 글을 따로 판독할 스크립트로 꺼낸다(작은따옴표 밖만).
function substitutions(text: string): string[] {
  const found: string[] = []
  let quote: Quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isEscape(quote, ch, text[i + 1])) { i++; continue }
    if (quote === "'") { if (ch === "'") quote = null; continue }
    if (ch === "'" && quote === null) { quote = "'"; continue }
    if (ch === '"') { quote = quote === '"' ? null : '"'; continue }
    if (ch === '$' && text[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++
        else if (text[j] === ')' && --depth === 0) break
      }
      found.push(text.slice(i + 2, j))
      i = j
      continue
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end < 0) break
      found.push(text.slice(i + 1, end))
      i = end
    }
  }
  return found
}

// 따옴표 밖의 `;`·개행·`|`·`&`·괄호·중괄호에서 나눈다.
function splitSegments(text: string): string[] {
  const segments: string[] = []
  let cur = ''
  let quote: Quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isEscape(quote, ch, text[i + 1])) { cur += ch + text[++i]; continue }
    if (quote) { cur += ch; if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (';\n|&()'.includes(ch)) { segments.push(cur); cur = ''; continue }
    cur += ch
  }
  segments.push(cur)
  return segments.map((s) => s.trim()).filter(Boolean)
}

// 따옴표를 벗기고 따옴표 밖 공백에서 나눈다.
function tokenize(segment: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: Quote = null
  let started = false
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (isEscape(quote, ch, segment[i + 1])) { cur += segment[++i]; started = true; continue }
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue }
    if (/\s/.test(ch)) { if (started) out.push(cur); cur = ''; started = false; continue }
    cur += ch
    started = true
  }
  if (started) out.push(cur)
  return out
}

// 래퍼 — 뒤의 낱말을 명령으로 실행한다. 값을 다음 낱말로 받는 옵션과, 명령 앞의 위치 인자 수(`timeout <시간>`)를 적는다.
// 값이 붙은 꼴(`-o0`, `--signal=KILL`)은 한 낱말이라 따로 적지 않는다 (독립 검수 중요 3).
// split(M09 G3)은 `env -S` 문자열 판독 칸이다 — 그 글자와 값을 받는 짧은 옵션 글자, 긴 옵션의 종류(splitScriptOf가 읽는다).
interface SplitSpec {
  short: string
  valueShort: string
  long: Readonly<Record<string, 'split' | 'value' | 'flag'>>
}
interface WrapperSpec {
  valueOpts: readonly string[]
  positional: number
  split?: SplitSpec
}
// 가드(.claude/hooks/dangerous-cmd-guard.mjs)의 WRAPPER_SPECS와 행 글이 같다 — cmd-guard-equivalence.test.mjs가 지킨다.
const WRAPPERS: ReadonlyMap<string, WrapperSpec> = new Map<string, WrapperSpec>([
  ['sudo', { valueOpts: ['-u', '-g', '-h', '-p', '-C', '-U', '-r', '-t', '-D', '-R', '-T', '--user', '--group', '--host', '--prompt', '--close-from', '--other-user', '--role', '--type', '--chdir', '--chroot', '--command-timeout'], positional: 0 }],
  ['doas', { valueOpts: ['-u', '-C'], positional: 0 }],
  ['env', { valueOpts: ['-u', '-C', '--unset', '--chdir'], positional: 0, split: { short: 'S', valueShort: 'uCa', long: { chdir: 'value', 'split-string': 'split', unset: 'value', argv0: 'value', 'ignore-environment': 'flag', null: 'flag', debug: 'flag', 'block-signal': 'flag', 'default-signal': 'flag', 'ignore-signal': 'flag', 'list-signal-handling': 'flag', help: 'flag', version: 'flag' } } }],
  ['nohup', { valueOpts: [], positional: 0 }],
  ['time', { valueOpts: ['-f', '-o', '--format', '--output'], positional: 0 }],
  ['nice', { valueOpts: ['-n', '--adjustment'], positional: 0 }],
  ['ionice', { valueOpts: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid'], positional: 0 }],
  ['xargs', { valueOpts: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--eof', '--replace', '--max-lines', '--max-args', '--max-procs', '--max-chars', '--process-slot-var'], positional: 0 }],
  ['command', { valueOpts: [], positional: 0 }],
  ['busybox', { valueOpts: [], positional: 0 }],
  ['exec', { valueOpts: ['-a'], positional: 0 }],
  ['timeout', { valueOpts: ['-s', '-k', '--signal', '--kill-after'], positional: 1 }],
  ['stdbuf', { valueOpts: ['-i', '-o', '-e', '--input', '--output', '--error'], positional: 0 }],
  ['watch', { valueOpts: ['-n', '--interval', '-q', '--equexit'], positional: 0 }],
])
const wrapperOf = (token: string): WrapperSpec | undefined => WRAPPERS.get(baseName(token).replace(/\.exe$/, ''))
const RE_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const RE_SHELL_C = /^-[A-Za-z]*c$/

// 옵션 낱말이 다음 낱말을 값으로 먹는가(가드 takesValue와 같다, M11 G3) — 붙여 쓴 값(`-oL`·`--signal=KILL`)은 먹지 않는다.
// 짧은 묶음(`-vs`)은 끝 글자가 값 옵션이면 먹고, `=` 없는 긴 옵션은 값 옵션의 접두(`--sig`)면 먹는다(getopt_long 줄임).
function takesValue(spec: WrapperSpec, t: string): boolean {
  if (spec.valueOpts.includes(t)) return true
  if (t.startsWith('--')) return !t.includes('=') && t.length > 3 && spec.valueOpts.some((o) => o.startsWith('--') && o.startsWith(t))
  return /^-[A-Za-z]{2,}$/.test(t) && spec.valueOpts.includes('-' + t.slice(-1))
}

// `sh [옵션…] -c [옵션…] [--] 스크립트`의 스크립트(가드 shellScriptsOf와 같다, M11 G3). 짧은 묶음 어디의 `c`든 -c 모드이고
// (`-ce`·`-lc`), 스크립트는 옵션 구간 뒤 첫 낱말이다(`bash -c -x "…"`). `-o`·`-O` 묶음과 `--rcfile`·`--init-file`은 값을 먹는다.
// `-c` 꼴 낱말 바로 뒤의 낱말도 합집합으로 본다. -c 모드가 아니면(`bash -x run.sh`) 파일 이름이라 없다.
const SHELL_VALUE_LONG = new Set(['--rcfile', '--init-file'])
function shellScriptsOf(args: string[]): string[] {
  const at = new Set<number>()
  let cMode = false
  let i = 0
  while (i < args.length) {
    const t = args[i]
    if (t === '--' || t === '-') { i++; break }
    if (t.startsWith('--')) { i += SHELL_VALUE_LONG.has(t) ? 2 : 1; continue }
    if (!/^[-+][A-Za-z]+$/.test(t)) break
    if (t[0] === '-' && t.includes('c')) cMode = true
    i += /[oO]/.test(t) ? 2 : 1
  }
  if (cMode && i < args.length) at.add(i)
  const k = args.findIndex((t) => RE_SHELL_C.test(t))
  if (k >= 0 && k + 1 < args.length) at.add(k + 1)
  return [...at].map((j) => args[j])
}

function baseName(token: string): string {
  const i = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  return (i < 0 ? token : token.slice(i + 1)).toLowerCase()
}

interface Cmd {
  base: string
  args: string[]
}

// 명령 위치 — 머리의 `VAR=값` 할당과 셸 문법 낱말(`{`·`!`·`then`·`do` …)을 건너뛰고, 래퍼(`sudo`·`env`·`xargs` …) 뒤의 명령과
// 머리가 find일 때 `-exec`류 뒤의 명령도 본다(가드와 같다).
// 중괄호는 구분자로 두지 않는다 — `gh api repos/{owner}/{repo}/…` 자리표시가 쪼개진다.
const SHELL_WORDS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until'])
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
function commandsOf(tokens: string[]): Cmd[] {
  let head = 0
  while (head < tokens.length - 1 && (RE_ASSIGN.test(tokens[head]) || SHELL_WORDS.has(tokens[head]))) head++
  if (head >= tokens.length) return []
  const cmds: Cmd[] = [{ base: baseName(tokens[head]), args: tokens.slice(head + 1) }]
  let i = head
  for (let spec = wrapperOf(tokens[i]); spec && i < tokens.length - 1; spec = wrapperOf(tokens[i])) {
    let j = i + 1
    // 옵션(값을 받는 옵션은 그 값까지)과 `VAR=값`을 건너뛰고, 위치 인자(`timeout`의 시간)를 건너뛴다
    while (j < tokens.length && (tokens[j].startsWith('-') || RE_ASSIGN.test(tokens[j]))) j += takesValue(spec, tokens[j]) ? 2 : 1
    j += spec.positional
    if (j >= tokens.length) break
    cmds.push({ base: baseName(tokens[j]), args: tokens.slice(j + 1) })
    i = j
  }
  if (baseName(tokens[head]).replace(/\.exe$/, '') === 'find') {
    for (let j = head + 1; j < tokens.length - 1; j++) {
      if (!FIND_EXEC.has(tokens[j].toLowerCase())) continue
      // 명령 인자는 끝맺음(`;`·`\;`, `{} +`) 앞까지다 — 따옴표 밖 `\;`는 구분자에서 잘려 `\`만 남는다
      let end = j + 2
      while (end < tokens.length && !findExecEnd(tokens, end)) end++
      cmds.push({ base: baseName(tokens[j + 1]), args: tokens.slice(j + 2, end) })
    }
  }
  return cmds
}
const findExecEnd = (tokens: string[], k: number): boolean =>
  tokens[k] === ';' || tokens[k] === '\\;' || tokens[k] === '\\' || (tokens[k] === '+' && tokens[k - 1] === '{}')

// ── gh 판정 ──────────────────────────────────────────────────────────────
const isGh = (c: Cmd): boolean => c.base === 'gh' || c.base === 'gh.exe'

// gh의 하위 명령 낱말 둘 — `=` 없는 `--긴옵션`과 두 글자 `-x`는 다음 낱말을 값으로 먹는다(가드 ghWords, gh 2.92 실측).
// 동사 뒤의 낱말은 보지 않는다 — `gh pr create --title merge`의 `merge`는 병합이 아니다.
const GH_NO_VALUE = new Set(['--help', '-h', '--version'])
function ghWords(args: string[]): string[] {
  const words: string[] = []
  for (let i = 0; i < args.length && words.length < 2; i++) {
    const t = args[i]
    if (!t.startsWith('-')) { words.push(t.split(/[<>]/)[0]); continue }
    if (GH_NO_VALUE.has(t)) continue
    if (t.startsWith('--') ? !t.includes('=') : t.length === 2) i++
  }
  return words
}

// `gh api`의 글 값 옵션 — 이 값(본문·헤더·jq)은 경로가 아니므로 보지 않는다. 나머지 낱말은 모두 경로 후보로 본다
// (`gh api -i <경로>`처럼 값 없는 옵션 뒤의 경로를 놓치지 않으려고 첫 낱말만 보지 않는다).
const API_TEXT_LONG = new Set(['--field', '--raw-field', '--header', '--jq', '--template'])
const API_TEXT_SHORT = 'fFHqt'
const MERGE_PATH = /pulls\/[^/\s]+\/merge(?:-async)?(?=$|[/?#])/i
const GRAPHQL_MERGE = /mergePullRequest|enablePullRequestAutoMerge/

function apiShowsMergePath(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t.startsWith('--')) { if (API_TEXT_LONG.has(t)) i++; continue }
    // 값을 다음 낱말로 받는 것은 정확히 두 글자(`-f`)일 때뿐이다. 붙여 쓴 값(`-fsha=…`, `-XPUT`)은 다음 낱말을 먹지 않는다.
    if (/^-[A-Za-z]/.test(t)) { if (t.length === 2 && API_TEXT_SHORT.includes(t[1])) i++; continue }
    if (MERGE_PATH.test(t)) return true
  }
  return false
}

const CMD_SHELLS = new Set(['cmd', 'cmd.exe'])
const POWERSHELLS = new Set(['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'])
// `-Command`의 줄임(`-c`, `-com` …)과 `-File`의 줄임
const PS_COMMAND = /^[-/](?:c|co|com|comm|comma|comman|command)$/i
const PS_FILE = /^[-/](?:f|fi|fil|file)$/i

// Windows 셸이면 안쪽에서 실행될 스크립트 후보를, 아니면 null을 돌려준다.
function windowsShellScripts(c: Cmd): string[] | null {
  if (CMD_SHELLS.has(c.base)) {
    const k = c.args.findIndex((t) => /^\/[ck]$/i.test(t))
    return k >= 0 ? [c.args.slice(k + 1).join(' ')] : []
  }
  if (!POWERSHELLS.has(c.base)) return null
  const k = c.args.findIndex((t) => PS_COMMAND.test(t))
  if (k >= 0) return [c.args.slice(k + 1).join(' ')]
  if (c.args.some((t) => PS_FILE.test(t))) return []
  // 옵션 값(`-ExecutionPolicy Bypass`)과 명령을 가르지 못하므로, 옵션이 아닌 낱말마다 거기서부터를 후보로 본다
  const out: string[] = []
  c.args.forEach((t, i) => { if (!t.startsWith('-')) out.push(c.args.slice(i).join(' ')) })
  return out
}

// `env -S`·`--split-string` (M09 G3) — GNU env는 문자열을 낱말로 나눠 그 자리에 끼우고 옵션 읽기를 잇는다. 그래서 다시 읽을 글은
// `env <문자열> <뒤 낱말>`이다(`env -S "-i gh …"`의 `-i`도 옵션으로 읽힌다). 뒤 낱말은 작은따옴표로 감싸 낱말 하나로 남긴다.
// 옵션은 getopt처럼 읽는다(loopLock.ts의 wrapperOpts와 같다) — 묶은 짧은 옵션은 값 옵션 글자에서 끝나고(`-vS`는 -S,
// `-uS`의 S는 -u의 값), 값은 붙여 쓰거나(`-S"…"`·`--split-string=…`) 다음 낱말이며, 긴 옵션은 표에서 유일한 접두면 줄여 쓴다(`--sp`).
// 가드(dangerous-cmd-guard.mjs)의 splitScriptOf와 같은 판독이다. 없으면 null.
const shQuote = (t: string): string => `'${t.replace(/'/g, "'\\''")}'`
// 값 안의 주석 (G3 검수 중요 1) — env는 따옴표 밖 낱말 머리의 `#`부터 **값 끝까지만** 버리고 뒤 낱말은 그대로 돈다.
// 다시 읽을 글에서는 그 `#`가 뒤 낱말을 삼킬 수 있으므로, 잇기 전에 값에서 잘라 낸다. 따옴표 안의 `#`는 글자다(가드와 같다).
function dropSplitComment(v: string): string {
  let quote: Quote = null
  let wordStart = true
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    const atStart = wordStart
    wordStart = false
    if (quote === "'") { if (ch === "'") quote = null; continue }
    if (ch === '\\') { i++; continue }
    if (quote === '"') { if (ch === '"') quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (/\s/.test(ch)) { wordStart = true; continue }
    if (ch === '#' && atStart) return v.slice(0, i)
  }
  return v
}
function splitScriptOf(c: Cmd): string | null {
  const spec = WRAPPERS.get(c.base.replace(/\.exe$/, ''))?.split
  if (!spec) return null
  const args = c.args
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    let value: string | undefined
    if (t === '--') return null
    if (t === '-') continue
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const name = t.slice(2, eq < 0 ? undefined : eq)
      const hits = Object.keys(spec.long).filter((l) => l.startsWith(name))
      const kind = Object.hasOwn(spec.long, name) ? spec.long[name] : hits.length === 1 ? spec.long[hits[0]] : undefined
      if (kind === undefined || kind === 'flag') continue
      value = eq < 0 ? args[++i] : t.slice(eq + 1)
      if (kind !== 'split') continue
    } else if (t.startsWith('-')) {
      let k = 1
      while (k < t.length && t[k] !== spec.short && !spec.valueShort.includes(t[k])) k++
      if (k === t.length) continue
      value = k + 1 < t.length ? t.slice(k + 1) : args[++i]
      if (t[k] !== spec.short) continue
    } else if (RE_ASSIGN.test(t)) continue
    else return null
    if (value === undefined) return null
    return [c.base, dropSplitComment(value), ...args.slice(i + 1).map(shQuote)].join(' ')
  }
  return null
}

function scriptReason(script: string, rawText: string, depth: number): string | null {
  if (depth > 4) return null
  const text = stripHeredocBodies(script.replace(/\\\r?\n/g, ' '))
  for (const sub of substitutions(text)) {
    const r = scriptReason(sub, rawText, depth + 1)
    if (r) return r
  }
  for (const seg of splitSegments(text)) {
    for (const c of commandsOf(tokenize(seg))) {
      // `env -S` 문자열은 셸 `-c` 스크립트처럼 다시 판독한다 (M09 G3)
      const split = splitScriptOf(c)
      if (split !== null) {
        const r = scriptReason(split, rawText, depth + 1)
        if (r) return r
        continue
      }
      if (SHELLS.has(c.base)) {
        for (const s of shellScriptsOf(c.args)) {
          const r = scriptReason(s, rawText, depth + 1)
          if (r) return r
        }
        continue
      }
      // eval은 인자를 이어 스크립트로 돌린다(가드는 eval 뒤를 명령 위치로 본다)
      if (c.base === 'eval') {
        const r = scriptReason(c.args.join(' '), rawText, depth + 1)
        if (r) return r
        continue
      }
      // Windows 셸 — `cmd /c …`, `powershell -Command …`, `pwsh -c …`. 뒤의 낱말을 이어 한 스크립트로 다시 읽는다(독립 검수 중요 3).
      // powershell(.exe)은 옵션 없는 첫 낱말부터가 명령이다. pwsh는 그 자리가 파일이지만, 막는 쪽으로 같게 본다(-File이 있으면 뺀다).
      const inner = windowsShellScripts(c)
      if (inner) {
        for (const s of inner) {
          const r = scriptReason(s, rawText, depth + 1)
          if (r) return r
        }
        continue
      }
      if (!isGh(c)) continue
      const [group, verb] = ghWords(c.args)
      if (group === 'pr' && verb === 'merge') return REASON
      if (group === 'api') {
        if (apiShowsMergePath(c.args)) return REASON
        // GraphQL 본문은 `-f query=…`·`--input` heredoc 어디에도 올 수 있어 명령 원문 전체에서 찾는다.
        // 끝점은 `graphql`·`/graphql`·`https://api.github.com/graphql` 꼴이 모두 온다.
        if (c.args.some((t) => /(?:^|\/)graphql\/?$/i.test(t)) && GRAPHQL_MERGE.test(rawText)) return REASON
      }
    }
  }
  return null
}

// 병합 꼴이면 사유를, 아니면 null을 돌려준다.
export function mergeDenyReason(command: string): string | null {
  return scriptReason(command, command, 0)
}

// 루프 잠금 노드(M09 G2, loopLock.ts)가 쓰는 판독 함수. 이 노드의 판정 경로와 같은 함수다.
export { SHELLS, shellScriptsOf, stripHeredocBodies, substitutions, splitSegments, tokenize, commandsOf, windowsShellScripts, ghWords, baseName }
export type { Cmd }

// ── 훅과 노드 정보 ─────────────────────────────────────────────────────────
// 공개 타입 PreToolUseHookInput에서 이 노드가 읽는 칸만 적는다(enginePathLock.ts와 같은 모양).
interface PreToolUseInput {
  hook_event_name?: string
  tool_name?: string
  tool_input?: unknown
}

interface HookOutput {
  hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string }
}

export interface MergeDenyMatcher {
  matcher?: string
  hooks: ((input: PreToolUseInput, toolUseID: string | undefined, opts: { signal: AbortSignal }) => Promise<HookOutput>)[]
  timeout: number
  onFailure: 'block'
}

const MERGE_DENY_TIMEOUT_S = 10

// SDK hooks.PreToolUse에 넣는 매처. 도구 이름으로 거르지 않고 `command` 입력을 가진 모든 도구(Bash, PowerShell 등)를 본다.
export function buildMergeDenyHook(): MergeDenyMatcher {
  return {
    hooks: [
      async (input) => {
        const ti = input.tool_input
        const command = ti && typeof ti === 'object' ? (ti as Record<string, unknown>)['command'] : undefined
        if (typeof command !== 'string') return {}
        const reason = mergeDenyReason(command)
        if (reason === null) return {}
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
      },
    ],
    timeout: MERGE_DENY_TIMEOUT_S,
    onFailure: 'block',
  }
}

export const MERGE_DENY_NODE: ControlNodeInfo = Object.freeze({
  id: 'merge-deny',
  name: 'PR 병합 명령 거부',
  point: 'preToolUse',
  judge: 'rule',
  results: Object.freeze(['deny'] as const),
  // 명령 글자를 바꾸면 피해 가므로 L3다 — 실수만 막는다. 끌 수 없다.
  protection: 'L3',
  locked: true,
  onFailure: 'block',
  timeoutMs: MERGE_DENY_TIMEOUT_S * 1000,
})
