// 루프 잠금 노드 (M09 G2) — 앱 안 마일스톤 루프의 작업 노드 세션에만 붙는 PreToolUse 잠금. 일반 앱 세션에는 붙지 않는다
// (sdkOptions.ts — 실행 입력의 loopLock이 있을 때만 넣는다. IPC 요청은 그 칸을 옮기지 않는다).
// 노드 세션은 앱 「자동」 모드로 돈다. 훅은 권한 평가의 맨 앞이라(공식 permissions 문서: 훅 → 규칙 → 모드 → canUseTool)
// 자동 모드의 허용보다 먼저, 질문 없이 거부한다. 거부하는 것:
//   ① 원격 쓰기 — git push(전역 옵션·경로로 부른 git·git-push 실행 파일 포함)·send-pack·subtree push·원격 바꾸기,
//      값으로 받은 명령(rebase -x, bisect run, submodule foreach)의 다시 판독, 명령을 실행하는 `-c` 키,
//      gh는 읽기 하위 명령(허용 목록) 밖 전부, gh api는 쓰기 메서드나 본문 옵션(-f·-F·--input)이 있으면.
//   ② 자격 꺼내기·환경 되돌리기 — gh auth, git credential*, credential-manager, 자격 없는 환경 변수의 재설정·해제(env -i 포함).
//   ③ 설정·훅 심기 — git config 쓰기(읽기 꼴만 허용), `.git/` 안 전체 쓰기.
//   ④ 실행기 몫 파일 — .agentdeck/run-state.json·verification.md와 앱 영역(userData의 loop 폴더) 쓰기, git clean -x.
//   ⑤ Claude 설정 — `.claude/`·`.mcp.json` 쓰기, 그리고 mcp__ 도구 전부(자기 자격으로 원격에 닿는다).
//   ⑥ 작업 저장소 밖 쓰기 — OS 임시 폴더와 널 장치만 빼고 거부한다(전역 ~/.gitconfig·~/.claude가 실행기와 앱에 닿는다).
//   ⑦ 셸 위치 (G2 재검수 중요 C) — 명령 안에서 cd를 차례로 따라가고(`&&`면 그 폴더, `;`면 폴더가 있을 때만, `|`·`&`·`||`와
//      하위 셸은 옛 위치도 남긴다), 훅 인스턴스가 호출 사이로 넘긴다(셸 위치는 호출 사이에 남는다). 훅 입력의 cwd가 따라간 후보 가운데
//      하나면 그 위치로 좁히고, 아니면 후보에 더한다. 상대 경로는 모든 후보에서 풀어 본다. cd가 보호 폴더(.git·.claude·앱 영역·
//      .agentdeck 자체)나 저장소 밖을 가리키면 거부한다. `cd -`·맨 `cd`·popd는 거부하지 않고 위치를 「모름」으로 두며, 모르는 위치의
//      상대 경로 쓰기(압축 풀기·내려받기의 암묵적 「.」 포함)는 거부한다. 맨 이름 run-state.json·verification.md 쓰기는 위치와 관계없이
//      거부한다. 경로는 `.git`·`.claude`·`.agentdeck`가 어디에 있든 그 이름으로 본다(어느 저장소의 것이든).
//      G2 3차 검수 중요 E·F — `builtin cd`·`command cd`도 셸의 cd로 따라가고, 그 밖의 래퍼(env·nohup·sudo …) 뒤의 cd는 옛 위치를
//      남긴다. `env -C`·`env --chdir`·`sudo -D`는 그 뒤 명령의 위치로 판정한다(cd와 같은 보호 폴더 거부). eval의 인자는 다시 판독하고
//      안쪽 cd를 밖으로 내며(판독 못 한 글이면 「모름」을 더한다), source·`.` 뒤는 「모름」이다(다음 호출에서는 훅이 준 cwd로 바뀐다).
//      CDPATH를 정하는 꼴은 거부한다.
//      env·sudo 옵션은 getopt처럼 읽고(묶은 짧은 옵션·줄인 긴 옵션), env -S의 문자열은 명령으로 다시 판독한다.
//      G2 4차 검수 — trap 몸통은 모르는 위치에서 다시 판독하고, 위치를 바꾸거나(cd 류) 모르는 스크립트를 부르는(eval·source·`.`)
//      몸통은 거부한다. trap 뒤 위치에는 「모름」을 더한다. BASH_ENV·ENV를 셸에 남기는 꼴은 거부하고, 명령 앞 할당이면 그 셸 -c의
//      시작 위치를 「모름」으로 본다.
//      앞에서 폴더를 바꿀 수 있는 명령(읽기 목록 밖 전부 — rm·mv·Remove-Item·git checkout·npm run …)이 돌았으면 뒤의 cd는 실패할 수
//      있다고 본다(`&&` 바로 뒤의 명령은 cd가 됐을 때만 돈다).
//   ⑧ 교체 객체 (G2 재검수 차단 A) — git replace, fast-import, update-ref --stdin, refs/replace를 건드리는 ref 쓰기, 맨 위를 덮는
//      fetch refspec(`refs/*:refs/*`). 실행기 git은 교체 객체를 따르지 않지만(gitPort) 심는 길도 막는다.
//   ⑨ 전역 패키지 설치 (G2 재검수) — npm·pnpm·bun의 -g·--global·--location=global, npm link(맨), yarn global. 실행기가 PATH에서 찾는
//      git·gh 이름을 덮을 수 있다.
// 노드 문서(.agentdeck/milestone-spec.md·goals/*.md·decisions.md)와 일반 소스 편집, 읽기 명령은 막지 않는다. git rm --cached는
// 작업 트리를 지우지 않아 지우기로 보지 않는다.
//
// 명령 글자 판정은 겹이다 — 보증이 아니다. 실측으로 확인한 싼 구멍만 한 줄 규칙으로 막았고, 다음은 남는다:
//   - 스크립트 파일과 인터프리터(node -e·python -c·perl -e·ruby -e)의 안 — 판독하지 않는다. source·`.`는 위치만 「모름」으로 둔다.
//   - 셸 함수·별칭 — 정의한 몸통의 cd는 「돌지 않을 수 있다」로만 보고, 부르는 자리(`f`)가 무엇을 하는지는 모른다. 별칭은 펼치지 않는다.
//   - 위치를 따라가지 못하는 명령 — `git -C 폴더`(그 안의 상대 경로), make -C·npm --prefix·pnpm -C 같은 도구별 위치 옵션,
//     xargs·find -exec로 넘긴 cd, PowerShell 함수·스크립트 블록 안의 Set-Location.
//   - 셸 옵션·훅 변수 — `shopt -s cdable_vars`(폴더가 아니면 같은 이름 변수로 cd), PROMPT_COMMAND, 다른 신호의 trap이 나중에 도는
//     시점(몸통은 판독하지만 언제 도는지는 모른다), BASH_ENV 파일 자체의 내용.
//   - 명령 낱말 간접 참조 —`c=cd; $c .git && …`, `"c""d" .git`처럼 명령 이름을 변수·조각으로 만든 꼴은 cd로 보지 않는다.
//   - 판정과 실행 사이의 틈 — 앞에 아무 명령 없는 cd는 판정 때의 폴더를 믿는다(그 사이 다른 프로세스가 지우면 틀린다).
//   - 경로 변수 — PWD·TEMP·TMP·TMPDIR를 혼자 선 할당·export류·$env:로 다시 정하는 꼴은 거부한다. 홈·APPDATA 재지정은 판정이 실제
//     값(저장소 밖)으로 펼쳐 거부 쪽으로 틀어진다. 명령 앞 할당은 그 명령 환경만 바꾼다.
//   - 상속된 CDPATH — 자식 환경에 CDPATH가 있으면 상대 cd가 옮겨 간다(자식 환경은 05_Loop/childEnv.ts가 정한다). 정하는 꼴만 거부한다.
//   - source·`.`가 위치를 바꿨는지는 다음 호출의 훅 cwd를 믿는다 — 훅 cwd가 셸의 진짜 위치가 아니면 틀린다.
//   - 변수 간접 참조(판독 못 한 변수는 쓰기 대상이면 거부), git apply·worktree·clone 같은 간접 쓰기.
//   - 전역 쓰기의 다른 길(npm config set prefix, corepack enable, PATH 변수 바꾸기).
//   - 호출 사이 위치 — 훅 입력 cwd의 의미는 G4 실주행에서 실측한다. 한 세션의 Bash·PowerShell·하위 에이전트 호출이 위치 하나를 같이 쓴다.
// 상태 위조는 앱 쪽 다이제스트와 위조 래치(05_Loop), 실행기 git 설정·ssh 설정·grafts는 실행기의 설정 대조(05_Loop/configGuard.ts)가
// 따로 본다. 원격 쓰기의 구조적 보증은 사용자가 범위를 좁힌 토큰이다(이 goal 밖).
// 셸 판독은 병합 거부 노드(mergeDeny.ts)의 낱말 함수를 같이 쓴다. 명령 마디 나누기는 구분자를 알아야 해서 여기서 한다.
import fs from 'node:fs'
import os from 'node:os'
import type { ControlNodeInfo } from './controlNodes'
import {
  SHELLS,
  commandsOf,
  shellScriptsOf,
  ghWords,
  stripHeredocBodies,
  tokenize,
  windowsShellScripts,
  type Cmd,
} from './mergeDeny'

export interface LoopLockScope {
  // 작업 저장소 뿌리 — 상대 경로를 여기에 붙여 본다(셸 위치를 따라가기 전의 시작 위치)
  repoRoot: string
  // 앱 영역(실물은 userData의 loop 폴더) — 다이제스트·잠금·설정 스냅숏·빈 훅 폴더가 산다
  appLoopDir: string
  // 저장소 밖이어도 쓰기를 허용하는 폴더. 기본은 os.tmpdir(). `/tmp`는 늘 허용한다(Git Bash의 임시 폴더)
  tempDirs?: string[]
  // 경로 변수(APPDATA·HOME·USERPROFILE·TEMP 등) 펼치기에 쓰는 값. 기본은 이 프로세스의 환경
  vars?: Record<string, string | undefined>
  // 폴더가 있는가 — `cd x; …`에서 cd가 실패할 수 있는지 본다. 기본은 파일 시스템
  isDir?: (p: string) => boolean
  // M09 G4 — 검수 세션의 읽기 전용 꼴. 위 거부에 더해 저장소 안 쓰기 전부(편집 도구·쓰기 명령·리다이렉트), 읽기 목록 밖 git 하위 명령,
  // 로컬에 내려받는 gh(pr checkout·repo clone·run download), 패키지 설치·npx를 거부한다. 인터프리터와 npm 스크립트의 안은 판독하지
  // 않는다(겹) — 검수 뒤 실행기가 작업 트리 해시를 다시 대조해 바뀌었으면 그 pass를 받지 않는다(loopRunner).
  readOnly?: boolean
  // M10 G2 — 메인 대화의 꼴(05_Loop/mainChat.ts). 있으면 위 판정 대신 허용 목록으로 본다(fail-closed — mainChatToolReason).
  //   셸은 모두 거부, 편집 도구는 `.agentdeck/milestone-spec.md`·`.agentdeck/decisions.md` 두 경로만 canWrite()가 참일 때(실행기 커서가
  //   브레인스토밍 노드에 있고 그 방문이 열려 있을 때 — 구동자가 훅 시각에 다시 판정한다), MCP 도구는 toolServer(앱 안 도구 서버)의 것만.
  mainChat?: { toolServer: string; canWrite: () => boolean | Promise<boolean> }
}

const READONLY = '검수 세션은 읽기 전용입니다 — 저장소 쓰기·git 쓰기 하위 명령·내려받기·패키지 설치는 막습니다. 읽고 판정만 합니다.'

const TAIL = ' 원격은 실행기 코드만 만지고, 작업 노드는 로컬 커밋까지만 합니다.'
const REMOTE = 'push·원격 바꾸기·PR·저장소 설정 같은 원격 쓰기는 작업 노드 세션에서 막습니다.' + TAIL
const GIT_EXEC = '명령을 실행하는 git 설정 키(-c)와 값으로 받은 명령은 작업 노드 세션에서 막습니다 — 원격 쓰기를 숨길 수 있습니다.' + TAIL
const CREDENTIAL = '원격 자격을 꺼내거나 자격 없는 환경(GH_TOKEN·GH_CONFIG_DIR·GIT_CONFIG_*·GCM_* 등)을 되돌리는 명령은 작업 노드 세션에서 막습니다.' + TAIL
const CONFIG = 'git 설정·훅·저장소 내부(.git/)는 작업 노드 세션이 바꾸지 않습니다 — 실행기의 git 동작이 그것을 읽습니다.' + TAIL
const EXECUTOR = '실행 상태(.agentdeck/run-state.json)·검증 기록(.agentdeck/verification.md)·앱 영역은 실행기만 씁니다. 노드 문서(milestone-spec.md, goals/*.md, decisions.md)는 써도 됩니다.' + TAIL
const CLAUDE = 'Claude 설정(.claude/, .mcp.json)은 작업 노드 세션이 바꾸지 않습니다 — 다음 세션의 권한·훅·MCP가 바뀝니다.' + TAIL
const OUTSIDE = '작업 저장소 밖(OS 임시 폴더 제외)에 쓰는 것은 작업 노드 세션에서 막습니다 — 전역 git·Claude 설정이 실행기와 앱에 닿습니다.' + TAIL
const UNREADABLE = '판독하지 못한 경로(모르는 변수·8.3 짧은 이름·모르는 셸 위치의 상대 경로)에 쓰는 것은 작업 노드 세션에서 막습니다.' + TAIL
const CWD = '셸 위치를 보호 폴더(.git·.agentdeck·.claude·앱 영역)나 저장소 밖, 판독하지 못한 곳으로 옮기는 꼴은 작업 노드 세션에서 막습니다. 저장소 안 폴더는 `cd 폴더 && 명령`으로 씁니다.' + TAIL
const MCP = 'MCP 도구는 작업 노드 세션에서 쓰지 않습니다 — 자기 자격으로 원격에 닿을 수 있습니다.' + TAIL
const TOO_DEEP = '중첩이 깊어 판독하지 못한 명령은 작업 노드 세션에서 막습니다.' + TAIL
const REPLACE = 'git replace와 교체 참조(refs/replace) 쓰기는 작업 노드 세션에서 막습니다 — 실행기가 병합하는 커밋의 트리를 바꿔치기합니다.' + TAIL
const CDPATH = 'CDPATH 설정은 작업 노드 세션에서 막습니다 — 상대 cd가 어디로 가는지 판독할 수 없게 됩니다.' + TAIL
const GLOBAL_PKG = '전역 패키지 설치(npm -g·pnpm add -g·yarn global 등)는 작업 노드 세션에서 막습니다 — 실행기가 PATH에서 찾는 git·gh를 가로챌 수 있습니다.' + TAIL

// ── 경로 ─────────────────────────────────────────────────────────────────
// 셸 위치 후보. 경로는 canon 꼴(대소문자 그대로), UNKNOWN은 「모름」이다.
type Cwd = readonly string[]
const UNKNOWN = '\u0000?'
// source·`.` 뒤의 「모름」(M11 G3, M09-6) — 호출 안에서는 UNKNOWN과 같고, 다음 호출에서는 훅이 준 cwd로 바뀐다(startCwd)
const SOURCED = '\u0000?source'
const isUnknown = (base: string): boolean => base === UNKNOWN || base === SOURCED

interface Resolved {
  root: string; rootRaw: string; app: string; temps: string[]; vars: Record<string, string>; isDir: (p: string) => boolean; readOnly: boolean
}

const VAR_NAMES = ['APPDATA', 'LOCALAPPDATA', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR']

function lookup(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

const fsIsDir = (p: string): boolean => { try { return fs.statSync(p).isDirectory() } catch { return false } }

function resolveScope(scope: LoopLockScope): Resolved {
  const env = scope.vars ?? process.env
  const vars: Record<string, string> = {}
  for (const n of VAR_NAMES) { const v = lookup(env, n); if (v) vars[n] = v }
  vars.HOME ??= vars.USERPROFILE ?? ''
  vars.USERPROFILE ??= vars.HOME
  vars.TMPDIR ??= vars.TEMP ?? vars.TMP ?? ''
  for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k]
  const rootRaw = canon(scope.repoRoot, scope.repoRoot)
  return {
    root: rootRaw.toLowerCase(),
    rootRaw,
    app: normalize(scope.appLoopDir, scope.repoRoot),
    temps: [...(scope.tempDirs ?? [os.tmpdir()]), '/tmp'].map((t) => normalize(t, scope.repoRoot)),
    vars,
    isDir: scope.isDir ?? fsIsDir,
    readOnly: scope.readOnly === true,
  }
}

// 경로 변수와 `~`를 펼친다. 모르는 변수·명령 치환이 남으면 null(판독 못 함).
const VAR_RE = /\$env:([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/gi
function expandVars(raw: string, vars: Record<string, string>): string | null {
  let s = raw.replace(/^~(?=$|[\\/])/, () => vars.HOME ?? '~')
  s = s.replace(VAR_RE, (m, a?: string, b?: string, c?: string, d?: string) => vars[(a ?? b ?? c ?? d ?? '').toUpperCase()] ?? m)
  return /\$[A-Za-z_{(]|%[A-Za-z_][A-Za-z0-9_]*%|`|^~/.test(s) ? null : s
}

// $PWD는 그 후보 위치다. 모르는 위치면 펼치지 않는다(판독 못 함).
function varsAt(r: Resolved, base: string): Record<string, string> {
  if (!isUnknown(base)) return { ...r.vars, PWD: base }
  const rest = { ...r.vars }
  delete rest.PWD
  return rest
}

const isAbsolute = (p: string): boolean => /^[a-zA-Z]:/.test(p) || /^[\\/]/.test(p)

// 판정용 정규형(대소문자 그대로): `\\?\`·`\\.\` 접두를 떼고, 역슬래시→슬래시, msys 드라이브(`/c/…`)→`c:/…`, 상대는 base에 붙이고,
// 마디마다 Windows가 버리는 꼬리(대체 데이터 흐름 `:…`, 끝 점·공백)를 떼고 `.`·`..`를 푼다.
function canon(raw: string, base: string): string {
  const slash = (p: string): string => p.replace(/^[\\/]{2}[?.][\\/]/, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const p = slash(raw.trim()).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  const joined = isAbsolute(p) ? p : `${slash(base).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:').replace(/\/+$/, '')}/${p}`
  const out: string[] = []
  joined.split('/').forEach((seg, i) => {
    let s = seg
    if (!(i === 0 && /^[a-zA-Z]:$/.test(s))) s = s.replace(/:.*$/, '')
    if (s !== '.' && s !== '..') s = s.replace(/[. ]+$/, '')
    if ((s === '' && i > 0) || s === '.') return
    if (s === '..') { if (out.length > 1) out.pop(); return }
    out.push(s)
  })
  return out.join('/')
}
const normalize = (raw: string, base: string): string => canon(raw, base).toLowerCase()

// readonly: 읽기 전용 꼴(G4 검수 세션)에서 저장소 안 쓰기. cd 판정에는 쓰지 않는다(저장소 안 폴더로 옮겨 다니는 것은 읽기다).
type PathKind = 'executor' | 'config' | 'claude' | 'outside' | 'unreadable' | 'readonly'

const EXECUTOR_FILE = /\/\.agentdeck\/(?:run-state\.json|verification\.md)$/
const GIT_DIR = /\/\.git(?:\/|$)/
const CLAUDE_PATH = /\/\.claude(?:\/|$)|\/\.mcp\.json$/
const BARE_EXECUTOR = /^(?:run-state\.json|verification\.md)[. ]*$/i
const SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul', 'nul:', 'con', '$null'])
const GLOB = /[*?[]/

const under = (c: string, dir: string): boolean => c === dir || c.startsWith(dir + '/')

function kindOf(c: string, r: Resolved, destructive: boolean): PathKind | null {
  if (under(c, r.app)) return 'executor'
  if (EXECUTOR_FILE.test(c)) return 'executor'
  if (GIT_DIR.test(c)) return 'config'
  if (CLAUDE_PATH.test(c)) return 'claude'
  if (destructive && /\/\.agentdeck$/.test(c)) return 'executor'
  // 지우기·옮기기가 저장소 뿌리나 그 위를 가리키면 .git과 .agentdeck도 함께 간다
  if (destructive && under(r.root, c)) return 'config'
  if (under(c, r.root)) {
    if (c.slice(r.root.length).split('/').some((s) => /~\d/.test(s))) return 'unreadable'
    return r.readOnly ? 'readonly' : null
  }
  return r.temps.some((t) => under(c, t)) ? null : 'outside'
}

// 와일드카드 꼴(`.agentdeck/*`, `.git/hook*/*`)은 보호 경로의 대표 이름에 맞춰 본다. 마디 첫 `*`·`?`는 점 파일에 맞지 않는다(bash 기본).
function globKind(c: string, r: Resolved, destructive: boolean): PathKind | null {
  let re = ''
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]
    const segStart = i === 0 || c[i - 1] === '/'
    if (ch === '*' || ch === '?') re += (segStart ? '(?!\\.)' : '') + (ch === '*' ? '[^/]*' : '[^/]')
    else if (ch === '[') { const end = c.indexOf(']', i + 2); re += '[^/]'; i = end < 0 ? c.length : end }
    else re += ch.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  const rx = new RegExp(`^${re}$`)
  const samples = [
    `${r.root}/.agentdeck/run-state.json`, `${r.root}/.agentdeck/verification.md`, `${r.root}/.git/config`, `${r.root}/.git/head`,
    `${r.root}/.git/hooks/pre-push`, `${r.root}/.git/info/exclude`, `${r.root}/.claude/settings.json`, `${r.root}/.mcp.json`,
    r.app, `${r.app}/digests`,
    ...(destructive ? [`${r.root}/.agentdeck`, `${r.root}/.git`, `${r.root}/.claude`] : []),
  ]
  const hit = samples.find((s) => rx.test(s))
  if (hit !== undefined) return kindOf(hit, r, destructive)
  const prefix = c.slice(0, c.search(GLOB))
  const dir = prefix.slice(0, prefix.lastIndexOf('/'))
  const k = dir ? kindOf(dir, r, false) : null
  return k === 'outside' || k === 'readonly' ? k : null
}

// 쓰기 대상 하나를 셸 위치 후보마다 풀어 본다. 모르는 위치의 상대 경로는 판독 못 함이다.
function pathKind(raw: string, r: Resolved, destructive: boolean, cwd: Cwd): PathKind | null {
  const t = raw.trim()
  if (!t || SINKS.has(t.replace(/\\/g, '/').toLowerCase())) return null
  for (const base of cwd) {
    const ex = expandVars(t, varsAt(r, base))
    if (ex === null) return 'unreadable'
    // 셸 위치와 관계없이 맨 이름의 실행기 몫 파일은 거부한다
    if (!/[\\/]/.test(ex) && BARE_EXECUTOR.test(ex)) return 'executor'
    if (!isAbsolute(ex) && isUnknown(base)) return 'unreadable'
    const c = normalize(ex, isUnknown(base) ? r.rootRaw : base)
    const k = GLOB.test(c) ? globKind(c, r, destructive) : kindOf(c, r, destructive)
    if (k) return k
  }
  return null
}

// cd 대상의 판정 — 보호 폴더(.git·.claude·앱 영역)·.agentdeck 자체·저장소 밖. 와일드카드는 보호 폴더 이름까지 맞춰 본다.
// 읽기 전용 꼴(readonly)은 cd를 막지 않는다 — 저장소 안 폴더로 옮기는 것은 읽기다.
function cdKind(c: string, r: Resolved): PathKind | null {
  const k = GLOB.test(c) ? globKind(c, r, true) : kindOf(c, r, false)
  if (k !== null && k !== 'readonly') return k
  return !GLOB.test(c) && /\/\.agentdeck$/.test(c) ? 'executor' : null
}

const REASON_OF: Record<PathKind, string> = {
  executor: EXECUTOR, config: CONFIG, claude: CLAUDE, outside: OUTSIDE, unreadable: UNREADABLE, readonly: READONLY,
}
const reasonOfKind = (k: PathKind | null): string | null => (k === null ? null : REASON_OF[k])

// 편집 도구가 이 경로에 쓰면 사유를, 아니면 null을 돌려준다. 편집 도구의 경로는 저장소 뿌리 기준이다.
export function loopPathReason(filePath: string, scope: LoopLockScope): string | null {
  const r = resolveScope(scope)
  return reasonOfKind(pathKind(filePath, r, false, [r.rootRaw]))
}

// ── 환경 변수 ────────────────────────────────────────────────────────────
// 자격 없는 환경(05_Loop/childEnv.ts)이 정한 변수들. Windows 환경 변수는 대소문자를 가리지 않는다.
const ENV_NAMES = 'GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GH_CONFIG_DIR|GIT_CONFIG(?:_[A-Z0-9_]+)?|GCM_[A-Z0-9_]+|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH|GIT_SSH_COMMAND|SSH_AUTH_SOCK|GIT_TERMINAL_PROMPT'
const PROTECTED_ENV = new RegExp(`^(?:${ENV_NAMES})$`, 'i')
const PS_ENV_SET = new RegExp(`\\$env:(?:${ENV_NAMES})\\s*[+]?=`, 'i')
const PS_ENV_REMOVE = new RegExp(`(?:remove-item|clear-item|set-item|new-item|ri|rm|del|erase|ni)\\b[^;|\\n]*\\benv:[\\\\/]?(?:${ENV_NAMES})\\b`, 'i')
const DOTNET_ENV = new RegExp(`SetEnvironmentVariable\\s*\\(\\s*['"](?:${ENV_NAMES})['"]`, 'i')

const assignName = (t: string): string | null => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(t)?.[1] ?? null
const protectedAssign = (t: string): boolean => { const n = assignName(t); return n !== null && PROTECTED_ENV.test(n) }
// G4 검수 사소 1 — git(과 그 페이저·편집기)이 명령으로 돌리는 환경 변수. 읽기 전용 꼴에서 정하는 꼴을 거부한다(`X=… git diff`, env·export 류).
// 설정 주입(GIT_CONFIG_*)도 같은 부류다 — -c처럼 명령 키를 넣을 수 있다.
const EXEC_ENV_NAMES = 'GIT_EXTERNAL_DIFF|GIT_PAGER|PAGER|GIT_EDITOR|EDITOR|VISUAL|GIT_SEQUENCE_EDITOR|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_ASKPASS|SSH_ASKPASS|LESSOPEN|LESSCLOSE|GIT_CONFIG|GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\\d+|GIT_CONFIG_VALUE_\\d+|GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM'
const EXEC_ENV = new RegExp(`^(?:${EXEC_ENV_NAMES})$`, 'i')
// M11 G3(M09-8) — PowerShell 꼴(`$env:GIT_PAGER = …`)과 .NET 꼴로 정하는 것도 읽기 전용 꼴에서 거부한다
const PS_EXEC_ENV_SET = new RegExp([
  `\\$env:(?:${EXEC_ENV_NAMES})\\s*[+]?=`,
  `(?:set-item|new-item|si|ni)\\b[^;|\\n]*\\benv:[\\\\/]?(?:${EXEC_ENV_NAMES})\\b`,
  `SetEnvironmentVariable\\s*\\(\\s*['"](?:${EXEC_ENV_NAMES})['"]`,
].join('|'), 'i')
const execEnvAssign = (t: string): boolean => { const n = assignName(t); return n !== null && EXEC_ENV.test(n) }
const ENV_SETTERS = new Set(['env', 'export', 'declare', 'typeset', 'local', 'readonly', 'set'])

function envCmdReason(b: string, a: string[]): string | null {
  switch (b) {
    case 'env':
      for (let i = 0; i < a.length; i++) {
        const t = a[i]
        if (t === '-i' || t === '-' || t === '--ignore-environment' || protectedAssign(t)) return CREDENTIAL
        if ((t === '-u' || t === '--unset') && PROTECTED_ENV.test(a[i + 1] ?? '')) return CREDENTIAL
        if (/^-u./.test(t) && PROTECTED_ENV.test(t.slice(2))) return CREDENTIAL
        if (t.startsWith('--unset=') && PROTECTED_ENV.test(t.slice(8))) return CREDENTIAL
      }
      return null
    case 'export': case 'declare': case 'typeset': case 'local': case 'readonly': case 'set':
      return a.some(protectedAssign) ? CREDENTIAL : null
    case 'unset': case 'setx':
      return a.some((t) => PROTECTED_ENV.test(t)) ? CREDENTIAL : null
    default:
      return null
  }
}

// ── git ──────────────────────────────────────────────────────────────────
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])
const REMOTE_MUTATE = new Set(['add', 'rm', 'remove', 'rename', 'set-url', 'set-head', 'set-branches'])
const CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool', '--list', '-l'])
const CONFIG_WRITE_FLAGS = new Set(['--add', '--unset', '--unset-all', '--replace-all', '--rename-section', '--remove-section', '--edit', '-e'])
const CONFIG_VALUE_OPTS = new Set(['-f', '--file', '--blob', '--type', '-t', '--default', '--comment', '--value'])
// 명령을 실행하거나 다른 설정 파일을 끌어오는 키 — 원격 쓰기·자격 꺼내기를 숨길 수 있다
const EXEC_KEY = /^(?:alias\.|filter\.|include\.|includeif\.|protocol\.|pager\.|core\.(?:pager|editor|fsmonitor|hookspath|gitproxy)$|sequence\.editor$|diff\.external$|.*\.textconv$|diff\..*\.command$|merge\..*\.driver$|gpg\.(?:.*\.)?program$|uploadpack\.packobjectshook$|remote\..*\.(?:uploadpack|receivepack)$)/
// refs/replace를 언급해도 읽기만 하는 하위 명령
const REF_READ = new Set(['log', 'show', 'for-each-ref', 'show-ref', 'rev-parse', 'rev-list', 'cat-file', 'ls-remote', 'describe', 'name-rev', 'diff', 'ls-tree'])
const MENTIONS_REPLACE = /refs\/replace(?:\/|$)/i
// refspec의 받는 쪽이 refs 맨 위(`refs/*`, `*`)면 refs/replace도 덮는다
const WIDE_DST = (t: string): boolean => { const k = t.lastIndexOf(':'); return k >= 0 && /^\+?(?:refs\/)?\*$/.test(t.slice(k + 1)) }

function configKeyReason(kv: string): string | null {
  const key = kv.split('=')[0].toLowerCase()
  if (key.startsWith('credential') || key === 'core.askpass' || key === 'core.sshcommand') return CREDENTIAL
  return EXEC_KEY.test(key) ? GIT_EXEC : null
}

// git config의 읽기 꼴만 허용한다 — 읽기 옵션, `get`·`list` 하위 명령, 키 하나. 나머지는 쓰기로 본다(fail-closed).
function configIsRead(rest: string[]): boolean {
  const positional: string[] = []
  let read = false
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]
    if (CONFIG_WRITE_FLAGS.has(t)) return false
    if (CONFIG_READ_FLAGS.has(t)) { read = true; continue }
    if (CONFIG_VALUE_OPTS.has(t)) { i++; continue }
    if (t.startsWith('-')) continue
    positional.push(t.toLowerCase())
  }
  return read || positional[0] === 'get' || positional[0] === 'list' || positional.length === 1
}

const operandsOf = (args: string[]): string[] => args.filter((t) => !t.startsWith('-'))
const firstWord = (args: string[]): string | undefined => operandsOf(args)[0]?.toLowerCase()

interface Ctx { r: Resolved; depth: number; cwd: Cwd }
type Check = (paths: string[], destructive: boolean) => string | null

// 읽기 전용 꼴(G4)의 git 허용 목록 — 저장소·작업 트리·ref를 바꾸지 않는 하위 명령. config·remote는 아래 판정이 따로 본다.
const GIT_READONLY = new Set([
  'status', 'log', 'show', 'diff', 'ls-files', 'ls-tree', 'cat-file', 'rev-parse', 'rev-list', 'blame', 'grep', 'describe',
  'name-rev', 'for-each-ref', 'show-ref', 'branch', 'shortlog', 'merge-base', 'ls-remote', 'help', 'version', 'var',
  'check-ignore', 'check-attr', 'count-objects', 'diff-tree', 'diff-index', 'diff-files', 'range-diff', 'whatchanged',
])
// branch는 목록 꼴만 — 이름 인자가 없거나 --list·-l이 있고, 만들기·지우기·옮기기·추적 바꾸기 옵션이 없다.
// G4 검수 사소 1 — 짧은 옵션 묶음(-vu)과 붙여 쓴 값(-uorigin/x, -u=origin/x)도 쓰기 옵션으로 본다.
const BRANCH_WRITE = /^(?:-[a-zA-Z]*[dDmMcCfu][a-zA-Z]*|-u.+|--delete|--move|--copy|--force|--set-upstream-to(?:=.*)?|--unset-upstream|--edit-description|--track|--no-track|--create-reflog)$/
function branchIsRead(rest: string[]): boolean {
  if (rest.some((t) => BRANCH_WRITE.test(t))) return false
  return rest.includes('--list') || rest.includes('-l') || operandsOf(rest).length === 0
}
// git grep -O·--open-files-in-pager는 맞은 파일을 그 프로그램으로 연다(명령 실행) — 짧은 옵션 묶음(-nO) 포함
const GREP_OPENS = (t: string): boolean => /^-[a-zA-Z]*O/.test(t) || t.startsWith('--open-files-in-pager')

function gitReason(args: string[], ctx: Ctx, check: Check): string | null {
  const recurse = (s: string): string | null => scriptReason(s, ctx.r, ctx.depth + 1, ctx.cwd).reason
  let i = 0
  for (; i < args.length; i++) {
    const t = args[i]
    if (!t.startsWith('-')) break
    if (t === '-c' || t === '--config-env') { const r = configKeyReason(args[i + 1] ?? ''); if (r) return r; i++; continue }
    if (t.startsWith('--config-env=')) { const r = configKeyReason(t.slice('--config-env='.length)); if (r) return r; continue }
    if (GIT_VALUE_OPTS.has(t)) i++
  }
  const sub = args[i]?.toLowerCase()
  const rest = args.slice(i + 1)
  if (sub === undefined) return null
  if (sub === 'push' || sub === 'send-pack' || sub === 'http-push') return REMOTE
  // 읽기 전용 꼴(G4) — 읽기 목록 밖 하위 명령은 거부한다. 원격·설정 판정은 아래가 계속 본다(config 쓰기는 CONFIG).
  if (ctx.r.readOnly && sub !== 'config') {
    // remote는 보기 꼴(맨 이름·-v·show·get-url)만 — update·prune은 원격 추적 ref를 쓴다
    if (sub === 'remote') { if (!['', 'show', 'get-url'].includes(firstWord(rest) ?? '')) return READONLY }
    else if (!GIT_READONLY.has(sub)) return READONLY
    if (sub === 'branch' && !branchIsRead(rest)) return READONLY
    if (sub === 'grep' && rest.some(GREP_OPENS)) return READONLY
    // diff·log 류의 --output은 파일에 쓴다
    if (rest.some((t) => t === '--output' || t.startsWith('--output='))) return READONLY
  }
  if ((sub === 'lfs' || sub === 'subtree') && firstWord(rest) === 'push') return REMOTE
  if (sub === 'remote') return REMOTE_MUTATE.has(firstWord(rest) ?? '') ? REMOTE : null
  if (sub === 'config') return configIsRead(rest) ? null : CONFIG
  if (sub.startsWith('credential')) return CREDENTIAL
  // 교체 객체 — 실행기 병합의 트리를 바꿔치기한다. 내용을 모르는 표준 입력 ref 쓰기도 막는다(⑧)
  if (sub === 'replace' || sub === 'fast-import') return REPLACE
  if (sub === 'update-ref' && rest.includes('--stdin')) return REPLACE
  if (!REF_READ.has(sub) && args.some((t) => MENTIONS_REPLACE.test(t))) return REPLACE
  if ((sub === 'fetch' || sub === 'pull') && args.some(WIDE_DST)) return REPLACE
  // 무시 목록의 파일까지 지우는 꼴 — `.agentdeck/`는 .git/info/exclude로 무시 목록에 있다. dry-run(-n)은 지우지 않는다
  if (sub === 'clean') {
    const flags = rest.filter((t) => /^-[a-zA-Z]+$/.test(t)).join('')
    if (/n/.test(flags) || rest.includes('--dry-run')) return null
    return /[xX]/.test(flags) ? EXECUTOR : null
  }
  if (sub === 'submodule') {
    const k = rest.indexOf('foreach')
    if (k >= 0) return recurse(rest.slice(k + 1).filter((t) => !t.startsWith('--')).join(' '))
  }
  if (sub === 'rebase') {
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k]
      if (t === '-x' || t === '--exec') { const r = recurse(rest[k + 1] ?? ''); if (r) return r; k++; continue }
      if (t.startsWith('--exec=')) { const r = recurse(t.slice(7)); if (r) return r; continue }
      if (/^-x./.test(t)) { const r = recurse(t.slice(2)); if (r) return r }
    }
    return null
  }
  if (sub === 'bisect' && firstWord(rest) === 'run') return recurse(rest.slice(rest.findIndex((t) => t.toLowerCase() === 'run') + 1).join(' '))
  // 작업 트리 파일을 덮어쓰거나 옮기는 꼴 — 대상 경로를 본다(.claude/ 되돌리기 등). rm --cached는 인덱스만 바꾼다
  if (sub === 'checkout' || sub === 'restore' || sub === 'mv' || sub === 'rm') {
    const paths: string[] = []
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k]
      if (t === '-s' || t === '--source' || t === '-b' || t === '-B') { k++; continue }
      if (!t.startsWith('-')) paths.push(t)
    }
    return check(paths, sub === 'mv' || (sub === 'rm' && !rest.includes('--cached')))
  }
  return null
}

// ── gh ───────────────────────────────────────────────────────────────────
// 허용 목록 — 읽기 하위 명령만. 목록 밖(별칭·확장·설정 쓰기 포함)은 원격 쓰기로 본다(fail-closed). auth는 자격 꺼내기다.
// 도움말 꼴(`--help`·`-h`)도 따로 풀지 않는다 — `--body -h`처럼 값 자리의 `-h`가 통로가 된다(병합 거부 노드와 같다).
const GH_READ: Readonly<Record<string, readonly string[] | '*'>> = {
  pr: ['view', 'list', 'status', 'diff', 'checks', 'checkout'],
  issue: ['view', 'list', 'status'],
  repo: ['view', 'list', 'clone'],
  run: ['view', 'list', 'watch', 'download'],
  workflow: ['view', 'list'],
  label: ['list'],
  cache: ['list'],
  config: ['get', 'list'],
  search: '*',
  status: '*',
  help: '*',
  version: '*',
}
// gh api 쓰기 판정 — 가드 ghApiWrites와 같다(M11 G3). GET 밖 메서드는 쓰기다: `-X`·`--method` 값, `--method=X`, `-XPUT`·`-X=PUT`,
// `-iX PUT` 묶음. 본문 옵션(-f·-F·--field·--raw-field·--input)은 기본 메서드를 POST로 바꾼다. 짧은 묶음은 값을 먹는 글자(H·p·q·t)에서 멈춘다.
const API_FIELD_LONG = ['--field', '--raw-field', '--input']
const API_VALUE_SHORT = 'Hpqt'
const notGet = (v: string | undefined): boolean => v === undefined || v.toUpperCase() !== 'GET'

function apiIsWrite(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '--') break
    if (t === '--method') { if (notGet(args[i + 1])) return true; i++; continue }
    if (t.startsWith('--method=')) { if (notGet(t.slice(9))) return true; continue }
    if (API_FIELD_LONG.some((o) => t === o || t.startsWith(`${o}=`))) return true
    if (t.startsWith('--') || !/^-[A-Za-z]/.test(t)) continue
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if (ch === 'f' || ch === 'F') return true
      if (ch === 'X') {
        const rest = t.slice(j + 1).replace(/^=/, '')
        if (notGet(rest || args[i + 1])) return true
        if (!rest) i++
        break
      }
      if (API_VALUE_SHORT.includes(ch)) break
    }
  }
  return false
}

// 읽기 전용 꼴(G4)에서 더 막는 gh — 작업 트리·로컬에 내려받는다
const GH_LOCAL_WRITE = new Set(['pr checkout', 'repo clone', 'run download'])

function ghReason(args: string[], readOnly = false): string | null {
  const [group, verb] = ghWords(args).map((w) => w.toLowerCase())
  if (group === undefined) return null
  if (group === 'auth') return CREDENTIAL
  if (readOnly && GH_LOCAL_WRITE.has(`${group} ${verb ?? ''}`)) return READONLY
  if (group === 'api') return apiIsWrite(args) ? REMOTE : null
  const allowed = GH_READ[group]
  if (allowed === '*') return null
  return allowed !== undefined && verb !== undefined && allowed.includes(verb) ? null : REMOTE
}

// ── 전역 패키지 (⑨) ──────────────────────────────────────────────────────
// 전역 플래그가 있어도 읽기만 하는 하위 명령
const PKG_GLOBAL_READ = new Set(['ls', 'list', 'll', 'la', 'root', 'prefix', 'bin', 'outdated', 'view', 'info', 'show', 'v', 'explain', 'why', 'help', 'search', 'doctor'])

function globalPkgReason(b: string, a: string[]): string | null {
  const name = b.replace(/\.(?:exe|cmd|bat|ps1)$/, '')
  if (name === 'yarn') {
    const ops = operandsOf(a).map((t) => t.toLowerCase())
    return ops[0] === 'global' && !['list', 'bin', 'dir'].includes(ops[1] ?? '') ? GLOBAL_PKG : null
  }
  if (name !== 'npm' && name !== 'pnpm' && name !== 'bun') return null
  let global = false
  const ops: string[] = []
  for (let i = 0; i < a.length; i++) {
    const t = a[i].toLowerCase()
    if (t === '-g' || t === '--global' || t === '--location=global' || /^--global=(?:true)?$/.test(t)) { global = true; continue }
    if (t === '--location' || t === '--prefix') { if (t === '--location' && a[i + 1]?.toLowerCase() === 'global') global = true; i++; continue }
    if (!t.startsWith('-')) ops.push(t)
  }
  // 맨 npm link는 지금 패키지를 전역에 건다
  if (name === 'npm' && (ops[0] === 'link' || ops[0] === 'ln') && ops.length === 1) return GLOBAL_PKG
  return global && !PKG_GLOBAL_READ.has(ops[0] ?? '') ? GLOBAL_PKG : null
}

// 읽기 전용 꼴(G4)의 패키지 설치·내려받아 돌리기. 맨 yarn(=install)도 설치다. npm run·test 같은 스크립트는 막지 않는다(겹, 머리 주석).
const PKG_INSTALL = new Set(['install', 'i', 'in', 'ins', 'add', 'ci', 'update', 'up', 'upgrade', 'remove', 'rm', 'uninstall', 'un', 'r',
  'link', 'ln', 'unlink', 'prune', 'dedupe', 'ddp', 'rebuild', 'dlx', 'exec', 'x', 'create', 'init'])
const OTHER_INSTALL = ['install', 'add', 'sync', 'get', 'uninstall', 'remove']
// G4 검수 사소 1 — 판 붙은 pip(pip3.12), python -m pip, uvx·uv pip·uv tool, corepack을 거친 패키지 관리자도 설치로 본다.
const PIP = /^pip(?:\d+(?:\.\d+)*)?$/
const PYTHON = /^(?:python(?:\d+(?:\.\d+)*)?|py)$/
function pkgInstallReason(b: string, a: string[]): boolean {
  const name = b.replace(/\.(?:exe|cmd|bat|ps1)$/, '').toLowerCase()
  if (name === 'npx' || name === 'pnpx' || name === 'bunx' || name === 'uvx') return true
  if (PIP.test(name) || name === 'pipx' || name === 'cargo' || name === 'go' || name === 'gem') {
    return OTHER_INSTALL.includes(firstWord(a) ?? '')
  }
  if (name === 'uv') {
    const ops = operandsOf(a).map((t) => t.toLowerCase())
    if (ops[0] === 'pip') return OTHER_INSTALL.includes(ops[1] ?? '')
    if (ops[0] === 'tool') return ['install', 'run', 'upgrade'].includes(ops[1] ?? '')
    return OTHER_INSTALL.includes(ops[0] ?? '')
  }
  if (PYTHON.test(name)) {
    const i = a.findIndex((t) => t === '-m' || /^-m\S/.test(t))
    if (i < 0) return false
    const mod = (a[i] === '-m' ? a[i + 1] ?? '' : a[i].slice(2)).toLowerCase()
    if (mod === 'ensurepip') return true
    return PIP.test(mod) && OTHER_INSTALL.includes(firstWord(a.slice(a[i] === '-m' ? i + 2 : i + 1)) ?? '')
  }
  if (name === 'corepack') {
    const ops = operandsOf(a).map((t) => t.toLowerCase())
    if (['npm', 'pnpm', 'yarn'].includes(ops[0] ?? '')) return pkgInstallReason(ops[0], a.slice(a.findIndex((t) => t.toLowerCase() === ops[0]) + 1))
    return ['install', 'enable', 'prepare', 'up', 'use'].includes(ops[0] ?? '')
  }
  if (name !== 'npm' && name !== 'pnpm' && name !== 'yarn' && name !== 'bun') return false
  const op = firstWord(a)
  if (op === undefined) return name === 'yarn'
  return PKG_INSTALL.has(op)
}

// ── 쓰기 명령 ────────────────────────────────────────────────────────────
// 명백한 쓰기 꼴만 본다 — 인자 전부가 대상인 명령, 마지막 인자(또는 -t·-Destination)가 대상인 복사, 제자리 편집(sed·perl -i),
// dd of=, 내려받기(curl -o·wget -O)와 풀기(tar -C·unzip -d). 복사·풀기 대상은 폴더일 수 있어 그 안 전체로 본다.
// 대상 없이 지금 위치에 쓰는 꼴(tar x·unzip·curl -O·wget)은 「.」에 쓴다고 본다 — 모르는 위치면 거부된다.
const WRITE_ALL = new Set([
  'rm', 'rmdir', 'unlink', 'mv', 'touch', 'truncate', 'shred', 'ln', 'chmod', 'chown', 'tee', 'mklink',
  'del', 'erase', 'rd', 'move', 'ren', 'rename',
  'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni', 'new-item', 'ni',
  'set-content', 'sc', 'add-content', 'ac', 'clear-content', 'clc', 'out-file',
])
const DESTRUCTIVE = new Set(['rm', 'rmdir', 'unlink', 'mv', 'shred', 'del', 'erase', 'rd', 'move', 'ren', 'rename', 'remove-item', 'ri', 'move-item', 'mi', 'rename-item', 'rni'])
const WRITE_LAST = new Set(['cp', 'install', 'rsync', 'scp', 'copy', 'xcopy', 'robocopy', 'copy-item', 'cpi'])
const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location'])
const POP = new Set(['popd', 'pop-location'])
// PowerShell 이름 인자 — `-Destination x`·`-Destination:x`
const PS_DEST = /^-(?:destination|dest|target)$/i
const PS_PATH = /^-(?:destination|dest|target|path|literalpath|lp|pspath|filepath)$/i
const PS_PATH_COLON = /^-(?:destination|dest|target|path|literalpath|lp|pspath|filepath):(.+)$/i

interface Target { path: string; destructive: boolean }

// 값 옵션 하나(`-o x`, `-ox`, `--output x`, `--output=x`)의 값들. short는 묶음 끝 글자로도 받는다(`-sSLo x`).
function optionValues(args: string[], short: string | null, long: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (long.includes(t)) { if (args[i + 1] !== undefined) out.push(args[++i]); continue }
    const eq = long.find((l) => t.startsWith(l + '='))
    if (eq) { out.push(t.slice(eq.length + 1)); continue }
    if (short === null || t.startsWith('--') || !t.startsWith('-')) continue
    if (t === `-${short}` || (new RegExp(`^-[a-zA-Z]+${short}$`).test(t))) { if (args[i + 1] !== undefined) out.push(args[++i]); continue }
    if (t.startsWith(`-${short}`) && t.length > 2) out.push(t.slice(2))
  }
  return out
}

function psValues(args: string[], re: RegExp): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const m = PS_PATH_COLON.exec(args[i])
    if (m && re.test(args[i].split(':')[0])) out.push(m[1])
    else if (re.test(args[i]) && args[i + 1] !== undefined) out.push(args[++i])
  }
  return out
}

const baseOf = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p
// 대상 폴더(그 안 전체로 본다)가 없으면 지금 위치 「.」에 쓴다 — 저장소 뿌리에서의 풀기는 지우기가 아니다
const here = (list: string[]): Target[] =>
  list.length > 0 ? list.map((path) => ({ path, destructive: true })) : [{ path: '.', destructive: false }]

function writeTargets(b: string, a: string[]): Target[] {
  const operands = operandsOf(a)
  if (WRITE_ALL.has(b)) {
    const destructive = DESTRUCTIVE.has(b)
    return [...operands, ...psValues(a, PS_PATH)].map((path) => ({ path, destructive }))
  }
  if (WRITE_LAST.has(b)) {
    const named = [...psValues(a, PS_DEST), ...optionValues(a, 't', ['--target-directory'])]
    const dest = named[0] ?? operands[operands.length - 1]
    if (dest === undefined) return []
    const sources = [...operands, ...psValues(a, /^-(?:path|literalpath|lp)$/i)].filter((s) => s !== dest)
    return [{ path: dest, destructive: true }, ...sources.map((s) => ({ path: `${dest}/${baseOf(s)}`, destructive: false }))]
  }
  if ((b === 'sed' || b === 'perl') && a.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) {
    return operands.map((path) => ({ path, destructive: false }))
  }
  if (b === 'dd') return a.filter((t) => t.startsWith('of=')).map((t) => ({ path: t.slice(3), destructive: false }))
  if (b === 'curl') {
    const out = optionValues(a, 'o', ['--output']).map((path) => ({ path, destructive: false }))
    const remoteName = a.some((t) => t === '--remote-name' || t === '--remote-name-all' || /^-[a-zA-Z]*O[a-zA-Z]*$/.test(t))
    return remoteName ? [...out, { path: '.', destructive: false }] : out
  }
  if (b === 'wget') {
    const doc = optionValues(a, 'O', ['--output-document']).map((path) => ({ path, destructive: false }))
    const prefix = optionValues(a, 'P', ['--directory-prefix'])
    return [...doc, ...(doc.length === 0 ? here(prefix) : prefix.map((path) => ({ path, destructive: true })))]
  }
  if (b === 'tar') {
    const extract = a.some((t) => t === '--extract' || t === '--get' || /^-[a-zA-Z]*x/.test(t)) || /^[a-zA-Z]*x[a-zA-Z]*$/.test(a[0] ?? '')
    const dirs = optionValues(a, 'C', ['--directory'])
    return [
      ...(extract ? here(dirs) : dirs.map((path) => ({ path, destructive: true }))),
      ...optionValues(a, 'f', ['--file']).map((path) => ({ path, destructive: false })),
    ]
  }
  if (b === 'unzip') {
    if (a.some((t) => /^-[a-zA-Z]*[ltvZ]/.test(t))) return []
    return here(optionValues(a, 'd', []))
  }
  return []
}

// 따옴표 밖 `>`·`>>`·`>|`·`&>`·`>&파일`의 대상 낱말. `>&2` 같은 파일 설명자 복제는 대상이 아니다.
function redirectTargets(text: string): string[] {
  const out: string[] = []
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\' && quote === '"') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\\') { i++; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch !== '>') continue
    let j = i + 1
    if (text[j] === '>' || text[j] === '|') j++
    if (text[j] === '&') { if (/[0-9-]/.test(text[j + 1] ?? '')) { i = j + 1; continue } j++ }
    while (text[j] === ' ' || text[j] === '\t') j++
    let word = ''
    const q = text[j]
    if (q === '"' || q === "'") {
      const end = text.indexOf(q, j + 1)
      word = text.slice(j + 1, end < 0 ? text.length : end)
      j = end < 0 ? text.length : end + 1
    } else {
      while (j < text.length && !/[\s;&|<>()]/.test(text[j])) word += text[j++]
    }
    if (word) out.push(word)
    i = j - 1
  }
  return out
}

// ── 판독 ─────────────────────────────────────────────────────────────────
// 명령 마디를 구분자와 함께 차례로 편다. 명령 치환(`$( )`·`<( )`·`>( )`·백틱)은 그 마디의 글로 두고 안쪽 글을 subs로 꺼낸다.
// 따옴표·이스케이프 규칙은 병합 거부 노드와 같다(큰따옴표 안 `\"`·`\\`·`\$`·`` \` ``, 밖 `\"`·`\'`·`\\`).
type Sep = ';' | '&&' | '||' | '|' | '&' | '(' | ')'
type Item = { kind: 'piece'; text: string; subs: string[] } | { kind: 'sep'; sep: Sep }
type Quote = '"' | "'" | null
const DQ_ESCAPABLE = new Set(['"', '\\', '$', '`'])
const BARE_ESCAPABLE = new Set(['"', "'", '\\'])
const isEscape = (quote: Quote, ch: string, next: string | undefined): boolean =>
  ch === '\\' && next !== undefined && (quote === '"' ? DQ_ESCAPABLE.has(next) : quote === null && BARE_ESCAPABLE.has(next))

function matchParen(text: string, open: number): number {
  let depth = 0
  for (let j = open; j < text.length; j++) {
    if (text[j] === '(') depth++
    else if (text[j] === ')' && --depth === 0) return j
  }
  return text.length
}

function splitItems(text: string): Item[] {
  const items: Item[] = []
  let cur = ''
  let subs: string[] = []
  let quote: Quote = null
  const flush = (): void => { const t = cur.trim(); if (t || subs.length) items.push({ kind: 'piece', text: t, subs }); cur = ''; subs = [] }
  const sep = (s: Sep): void => { flush(); items.push({ kind: 'sep', sep: s }) }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (isEscape(quote, ch, next)) { cur += ch + next; i++; continue }
    if (quote === "'") { cur += ch; if (ch === "'") quote = null; continue }
    if (next === '(' && (ch === '$' || (quote === null && (ch === '<' || ch === '>')))) {
      const end = matchParen(text, i + 1)
      subs.push(text.slice(i + 2, end))
      cur += text.slice(i, end + 1)
      i = end
      continue
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end < 0) { cur += text.slice(i); break }
      subs.push(text.slice(i + 1, end))
      cur += text.slice(i, end + 1)
      i = end
      continue
    }
    if (quote === '"') { cur += ch; if (ch === '"') quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === ';' || ch === '\n') { sep(';'); continue }
    if (ch === '&') {
      if (next === '&') { sep('&&'); i++; continue }
      // `>&2`·`2>&1`·`&>파일`은 넘겨주기다
      if (next === '>' || cur.trimEnd().endsWith('>')) { cur += ch; continue }
      sep('&')
      continue
    }
    if (ch === '|') {
      if (next === '|') { sep('||'); i++; continue }
      if (cur.trimEnd().endsWith('>')) { cur += ch; continue }
      if (next === '&') i++
      sep('|')
      continue
    }
    if (ch === '(' || ch === ')') { sep(ch); continue }
    cur += ch
  }
  flush()
  return items
}

const dedupe = (list: string[]): string[] => {
  const seen = new Set<string>()
  return list.filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}
const union = (a: Cwd, b: Cwd): Cwd => dedupe([...a, ...b])

// 저장소 뿌리로 가는 꼴 — `cd "$(git rev-parse --show-toplevel)"`(따옴표 없이, 백틱 꼴 포함)
const TOPLEVEL = /^(?:\$\(\s*git\s+rev-parse\s+--show-toplevel\s*\)|`\s*git\s+rev-parse\s+--show-toplevel\s*`)$/

type CdEffect = { reason: string } | { reason: null; dirs: Cwd; canFail: boolean }

// cd 하나가 셸 위치를 어떻게 바꾸는가. 보호 폴더·밖·판독 못 한 대상이면 사유다.
function cdEffect(c: Cmd, b: string, r: Resolved, cwd: Cwd): CdEffect {
  if (POP.has(b)) return { reason: null, dirs: [UNKNOWN], canFail: true }
  const args = c.args.filter((t) => !/^\/d$/i.test(t))
  if (args[0] === '-') return { reason: null, dirs: [UNKNOWN], canFail: true }
  const joined = args.join(' ').trim()
  if (TOPLEVEL.test(joined)) return { reason: null, dirs: [r.rootRaw], canFail: true }
  const target = operandsOf(args)[0] ?? psValues(args, PS_PATH)[0]
  // 맨 cd(홈)·pushd 맞바꾸기·pushd +N은 어디로 가는지 모른다
  if (target === undefined || /^[+-]\d+$/.test(target)) return { reason: null, dirs: [UNKNOWN], canFail: target !== undefined }
  const dirs: string[] = []
  let canFail = false
  for (const base of cwd) {
    const ex = expandVars(target, varsAt(r, base))
    if (ex === null) return { reason: CWD }
    if (!isAbsolute(ex) && isUnknown(base)) {
      // 모르는 위치에서의 상대 cd — 보호 이름은 뿌리 기준으로라도 본다(저장소 밖 판정은 못 한다)
      const k = cdKind(normalize(ex, r.rootRaw), r)
      if (k !== null && k !== 'outside') return { reason: CWD }
      dirs.push(UNKNOWN)
      canFail = true
      continue
    }
    const raw = canon(ex, isUnknown(base) ? r.rootRaw : base)
    if (cdKind(raw.toLowerCase(), r) !== null) return { reason: CWD }
    dirs.push(raw)
    if (!r.isDir(raw)) canFail = true
  }
  return { reason: null, dirs: dedupe(dirs), canFail }
}

const baseOfCmd = (c: Cmd): string => c.base.replace(/\.exe$/, '')

// ── 위치를 바꾸는 다른 꼴 (G2 3차 검수 중요 E) ──────────────────────────────
// `builtin cd`는 셸의 cd다 — 뒤의 낱말을 명령으로 다시 본다(`command`는 병합 거부 노드의 래퍼 목록에 있다).
function withBuiltins(cmds: Cmd[], depth = 0): Cmd[] {
  const out: Cmd[] = []
  for (const c of cmds) {
    out.push(c)
    if (baseOfCmd(c) === 'builtin' && c.args.length > 0 && depth < 4) out.push(...withBuiltins(commandsOf(c.args), depth + 1))
  }
  return out
}
// 셸 자신이 도는 자리 — 앞이 `builtin`·`command`뿐이다. 그 밖의 래퍼(env·nohup·sudo …) 뒤의 cd는 바깥 프로그램이다.
const SHELL_PREFIX = new Set(['builtin', 'command'])

// `env`·`sudo`의 옵션을 getopt처럼 읽는다 — 묶은 짧은 옵션(`-vC 폴더`, `-C폴더`), 줄인 긴 옵션(`--chd=폴더`).
// chdir은 그 뒤 명령의 위치, split은 env -S의 문자열(명령으로 나눠 돈다 — 다시 판독한다), rest는 그 뒤 낱말이다.
interface OptSpec { chdirShort: string; splitShort: string | null; valueShort: string; long: Readonly<Record<string, 'chdir' | 'split' | 'value' | 'flag'>> }
const OPT_SPECS: Readonly<Record<string, OptSpec>> = {
  env: {
    chdirShort: 'C', splitShort: 'S', valueShort: 'u',
    long: { chdir: 'chdir', 'split-string': 'split', unset: 'value', argv0: 'value', 'ignore-environment': 'flag', null: 'flag', debug: 'flag',
      'block-signal': 'flag', 'default-signal': 'flag', 'ignore-signal': 'flag', 'list-signal-handling': 'flag', help: 'flag', version: 'flag' },
  },
  sudo: {
    chdirShort: 'D', splitShort: null, valueShort: 'ughpCUrtTR',
    long: { chdir: 'chdir', chroot: 'value', 'close-from': 'value', 'command-timeout': 'value', user: 'value', group: 'value', host: 'value',
      prompt: 'value', 'other-user': 'value', role: 'value', type: 'value' },
  },
}
interface WrapperOpts { chdir: string | null; split: string | null; rest: string[] }

function wrapperOpts(b: string, args: string[]): WrapperOpts | null {
  const spec = OPT_SPECS[b]
  if (!spec) return null
  const out: WrapperOpts = { chdir: null, split: null, rest: [] }
  const take = (kind: 'chdir' | 'split' | 'value', v: string | undefined): void => {
    if (kind === 'chdir') out.chdir = v ?? null
    else if (kind === 'split') out.split = v ?? ''
  }
  let i = 0
  for (; i < args.length; i++) {
    const t = args[i]
    if (t === '--') { i++; break }
    if (t.startsWith('--')) {
      const [name, eq] = [t.slice(2).split('=')[0], t.includes('=') ? t.slice(t.indexOf('=') + 1) : undefined]
      const hits = Object.keys(spec.long).filter((l) => l.startsWith(name))
      const kind = spec.long[name] ?? (hits.length === 1 ? spec.long[hits[0]] : undefined)
      if (kind === undefined) continue
      if (kind === 'flag') continue
      if (eq !== undefined) take(kind, eq)
      else take(kind, args[++i])
      continue
    }
    if (t.startsWith('-') && t.length > 1) {
      for (let k = 1; k < t.length; k++) {
        const ch = t[k]
        const kind = ch === spec.chdirShort ? 'chdir' : ch === spec.splitShort ? 'split' : spec.valueShort.includes(ch) ? 'value' : null
        if (kind === null) continue
        take(kind, k + 1 < t.length ? t.slice(k + 1) : args[++i])
        break
      }
      continue
    }
    if (assignName(t) !== null) continue
    break
  }
  out.rest = args.slice(i)
  return out
}

// 판정이 펼치는 경로 변수 가운데 셸에서 다시 정하면 판정이 틀어지는 것 — PWD(따라간 위치로 펼친다)와 임시 폴더(쓰기를 허용한다).
// 홈·APPDATA는 다시 정해도 판정이 실제 값(저장소 밖)으로 펼쳐 거부 쪽으로 틀어진다. 명령 앞 할당(`TMPDIR=x npm test`)은 그 명령의
// 환경만 바꾸고 같은 줄의 펼치기는 옛 값이라 막지 않는다. 혼자 선 할당·export류·PowerShell $env: 할당만 거부한다.
// BASH_ENV·ENV(G2 4차 검수)는 비대화형 셸이 시작할 때 읽어 돌리는 파일이다 — 셸에 남기면 뒤의 모든 `bash -c`가 모르는 스크립트를 먼저 돈다.
// 명령 앞 할당은 그 셸의 시작 위치를 「모름」으로 본다(마디 걷기).
const PATH_VARS = /^(?:PWD|TEMP|TMP|TMPDIR|BASH_ENV|ENV)$/i
// trap 몸통 안의 위치 바꾸기·모르는 스크립트 — 셸에 남아 뒤의 명령(다음 호출 포함)마다 돌므로 따라갈 수 없다
const TRAP_MOVES = /(?:^|[\s;&|(`])(?:cd|pushd|popd|chdir|set-location|sl|push-location|pop-location|eval|source|\.)(?=$|[\s;&|)])/i
const STARTUP_ASSIGN = /^(?:BASH_ENV|ENV)=/
const PS_PATH_VAR_SET = /\$env:(?:PWD|TEMP|TMP|TMPDIR|BASH_ENV|ENV)\s*[+]?=|SetEnvironmentVariable\s*\(\s*['"](?:TEMP|TMP|TMPDIR|BASH_ENV|ENV)['"]/i
const VAR_SET = '판정이 쓰는 경로 변수(PWD·TEMP·TMP·TMPDIR)나 셸 시작 파일(BASH_ENV·ENV)을 셸에서 다시 정하는 꼴은 작업 노드 세션에서 막습니다 — 쓰기 대상과 셸 위치를 판독할 수 없게 됩니다.' + TAIL

function pathVarReason(tokens: string[], cmds: Cmd[]): string | null {
  if (tokens.length > 0 && tokens.every((t) => assignName(t) !== null) && tokens.some((t) => PATH_VARS.test(assignName(t) ?? ''))) return VAR_SET
  for (const c of cmds) {
    const b = baseOfCmd(c)
    if (['export', 'declare', 'typeset', 'local', 'readonly', 'read', 'setx'].includes(b)) {
      if (c.args.some((t) => PATH_VARS.test(assignName(t) ?? t))) return VAR_SET
    }
    if (b === 'printf') { const k = c.args.indexOf('-v'); if (k >= 0 && PATH_VARS.test(c.args[k + 1] ?? '')) return VAR_SET }
  }
  return null
}

// CDPATH를 정하면 상대 cd가 어디로 갈지 판독할 수 없다 — 정하는 꼴을 거부한다(셸 변수는 호출 사이에 남는다).
// M11 G3(M09-6) — 셸 꼴은 마디의 낱말로 본다(명령 머리의 할당, 변수를 정하는 명령의 인자). 커밋 메시지 같은 따옴표 안 글자는 보지 않는다.
// PowerShell·.NET 꼴은 스크립트 글자로 본다.
const CDPATH_PS_SET = /\$env:CDPATH\s*\+?=|(?:set-item|new-item|si|ni)\b[^;|\n]*env:[\\/]?CDPATH\b|SetEnvironmentVariable\s*\(\s*['"]CDPATH/i
const CDPATH_SETTERS = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'read', 'mapfile', 'readarray', 'setx', 'set', 'env'])
const isCdpath = (t: string): boolean => /^CDPATH(?:\+?=|$)/i.test(t)
// `${CDPATH=…}`·`${CDPATH:=…}`는 어느 자리에서든 펼치는 순간 변수를 정한다 — 작은따옴표 안만 펼치지 않는다(독립 검수 중요)
const CDPATH_EXPAND_SET = /\$\{CDPATH:?=/i

function outsideSingleQuotes(s: string): string {
  let out = ''
  let dq = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) { out += ch + s[++i]; continue }
    if (ch === '"') dq = !dq
    else if (ch === "'" && !dq) {
      const end = s.indexOf("'", i + 1)
      if (end < 0) break
      i = end
      out += ' '
      continue
    }
    out += ch
  }
  return out
}

const HEAD_WORDS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until'])

function cdpathSet(tokens: string[], cmds: Cmd[]): boolean {
  for (const t of tokens) {
    if (HEAD_WORDS.has(t)) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(t)) break
    if (isCdpath(t)) return true
  }
  return cmds.some((c) => {
    const b = baseOfCmd(c)
    if (CDPATH_SETTERS.has(b)) return c.args.some(isCdpath)
    return b === 'printf' && c.args.some((t, i) => t === '-vCDPATH' || (t === '-v' && c.args[i + 1] === 'CDPATH'))
  })
}

// ── 앞에 돈 명령 (G2 3차 검수 중요 F) ───────────────────────────────────────
// 판정 때 폴더가 있어도, 앞의 명령이 지우거나 옮기면(rm·mv·Remove-Item·git checkout·npm run …) 뒤의 cd는 실패한다. 앞 호출이 남긴
// 백그라운드 일도 시간이 지나면 지운다 — `sleep 5; cd src`처럼 읽기 명령으로 기다릴 수도 있다. 그래서 cd 밖 명령이 하나라도 앞에
// 돌았으면 뒤의 cd를 실패할 수 있다고 본다(보수). 앞에 아무것도 없는 cd는 판정 때의 폴더를 믿는다(판정과 실행 사이의 틈은 남는다).
const NO_DELAY = new Set(['builtin', 'command', 'cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location'])
const readOnlyCmd = (c: Cmd): boolean => NO_DELAY.has(baseOfCmd(c))

function cmdReason(c: Cmd, ctx: Ctx): string | null {
  const b = baseOfCmd(c)
  const check: Check = (paths, destructive) => {
    for (const p of paths) { const r = reasonOfKind(pathKind(p, ctx.r, destructive, ctx.cwd)); if (r) return r }
    return null
  }
  if (b === 'git') return gitReason(c.args, ctx, check)
  if (b.includes('credential-manager') || b.startsWith('git-credential')) return CREDENTIAL
  if (b.startsWith('git-')) return gitReason([b.slice(4), ...c.args], ctx, check)
  if (b === 'gh') return ghReason(c.args, ctx.r.readOnly)
  // 셸 위치는 마디 걷기(scriptReason)가 본다
  if (CD.has(b) || POP.has(b)) return null
  const env = envCmdReason(b, c.args)
  if (env) return env
  // G4 검수 사소 1 — 읽기 전용 꼴에서 git이 명령으로 돌리는 환경 변수를 env·export 류로 정하는 꼴(GIT_EXTERNAL_DIFF·GIT_PAGER 등)
  if (ctx.r.readOnly && ENV_SETTERS.has(b) && c.args.some(execEnvAssign)) return READONLY
  const pkg = globalPkgReason(b, c.args)
  if (pkg) return pkg
  if (ctx.r.readOnly && pkgInstallReason(b, c.args)) return READONLY
  for (const t of writeTargets(b, c.args)) {
    const r = reasonOfKind(pathKind(t.path, ctx.r, t.destructive, ctx.cwd))
    if (r) return r
  }
  return null
}

interface Walk { reason: string | null; end: Cwd; mutated: boolean }

// 스크립트 하나를 마디 차례로 걷는다. 명령 치환·셸 -c·Windows 셸의 안쪽은 그 자리의 위치로 다시 판독한다(안쪽 cd는 밖으로 나오지 않는다).
// `&&` 줄은 처음 실패한 명령에서 멈춘다 — 줄 안에서 실패할 수 있는 명령(cd 밖 명령 전부, 실패할 수 있는 cd)이 돈 자리를 모아 두고,
// 줄이 끝나면(`&&` 밖 구분자·끝) 그 자리들을 다음 명령의 위치 후보에 더한다. 조건·반복·중괄호 몸통의 cd는 돌지 않을 수 있다.
// end는 명령이 끝났을 때 셸이 있을 수 있는 위치들이다(exit·return이 멈춘 자리 포함).
const OPEN_KW = new Set(['if', 'while', 'until', 'for', 'select', 'case', '{'])
const CLOSE_KW = new Set(['fi', 'done', 'esac', '}'])
const EXIT_CMD = new Set(['exit', 'return', 'logout', 'exec'])

// mutated는 앞에서 폴더를 바꿀 수 있는 명령이 돌았는가다(중요 F) — 안쪽 스크립트(셸 -c·eval·명령 치환)로 넘기고 돌려받는다.
function scriptReason(script: string, r: Resolved, depth: number, start: Cwd, mutatedAtStart = false): Walk {
  const deny = (reason: string): Walk => ({ reason, end: start, mutated: true })
  if (depth > 4) return deny(TOO_DEEP)
  if (PS_ENV_SET.test(script) || PS_ENV_REMOVE.test(script) || DOTNET_ENV.test(script)) return deny(CREDENTIAL)
  if (r.readOnly && PS_EXEC_ENV_SET.test(script)) return deny(READONLY)
  if (CDPATH_PS_SET.test(script) || CDPATH_EXPAND_SET.test(outsideSingleQuotes(script))) return deny(CDPATH)
  if (PS_PATH_VAR_SET.test(script)) return deny(VAR_SET)
  const items = splitItems(stripHeredocBodies(script.replace(/\\\r?\n/g, ' ')))
  let cwd: Cwd = start
  let chain: Cwd = []
  let stops: Cwd = []
  let body = 0
  let mutated = mutatedAtStart
  const stack: { cwd: Cwd; chain: Cwd }[] = []
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    if (item.kind === 'sep') {
      if (item.sep === '(') { stack.push({ cwd, chain }); chain = []; continue }
      if (item.sep === ')') {
        // 하위 셸의 cd는 밖으로 나오지 않는다. 하위 셸 자체가 실패할 수 있다
        const saved = stack.pop()
        if (saved) { cwd = saved.cwd; chain = union(saved.chain, cwd) }
        continue
      }
      if (item.sep !== '&&') { cwd = union(chain, cwd); chain = [] }
      continue
    }
    const head = tokenize(item.text)[0]?.toLowerCase() ?? ''
    if (OPEN_KW.has(head)) body++
    const inBody = body > 0
    if (CLOSE_KW.has(head) || /(?:^|[\s;])\}$/.test(item.text)) body = Math.max(0, body - 1)
    const prevItem = items[idx - 1]
    const nextItem = items[idx + 1]
    const prev = prevItem?.kind === 'sep' ? prevItem.sep : null
    const next = nextItem?.kind === 'sep' ? nextItem.sep : null
    let pieceMutates = false
    for (const s of item.subs) {
      const inner = scriptReason(s, r, depth + 1, cwd, mutated)
      if (inner.reason) return deny(inner.reason)
      pieceMutates ||= inner.mutated
    }
    for (const target of redirectTargets(item.text)) {
      const reason = reasonOfKind(pathKind(target, r, false, cwd))
      if (reason) return deny(reason)
    }
    const tokens = tokenize(item.text)
    for (const t of tokens) {
      if (assignName(t) === null) break
      if (protectedAssign(t)) return deny(CREDENTIAL)
      if (r.readOnly && execEnvAssign(t)) return deny(READONLY)
    }
    const cmds = withBuiltins(commandsOf(tokens))
    if (cdpathSet(tokens, cmds)) return deny(CDPATH)
    const varSet = pathVarReason(tokens, cmds)
    if (varSet) return deny(varSet)
    // 명령마다의 위치 — env -C·sudo -D가 그 뒤 명령의 위치를 바꾼다(셸 위치는 그대로다)
    let cmdCwd: Cwd = cwd
    let atShell = true
    // 이 마디가 셸 위치를 바꾸는 꼴: cd(셸 자리·래퍼 뒤), eval·source의 끝 위치
    let cd: { c: Cmd; external: boolean } | null = null
    let evalEnd: Cwd | null = null
    for (const c of cmds) {
      const b = baseOfCmd(c)
      const shellPos = atShell
      atShell = atShell && SHELL_PREFIX.has(b)
      const wo = wrapperOpts(b, c.args)
      if (wo?.chdir != null) {
        const e = cdEffect({ base: 'cd', args: [wo.chdir] }, 'cd', r, cmdCwd)
        if (e.reason !== null) return deny(e.reason)
        cmdCwd = e.dirs
      }
      // env -S '명령 낱말들' — 문자열을 명령으로 나눠 돈다. 뒤 낱말과 이어 다시 판독한다(뒤 명령 마디는 낱말 판독이 틀린다)
      if (wo?.split != null) {
        const inner = scriptReason([wo.split, ...wo.rest].join(' '), r, depth + 1, cmdCwd, mutated)
        if (inner.reason) return deny(inner.reason)
        pieceMutates = true
        break
      }
      // trap 몸통은 신호 때마다(DEBUG면 명령마다) 돌고 셸에 남는다 — 모르는 위치에서 판독하고, 위치를 바꾸는 몸통은 거부한다(G2 4차 검수)
      if (b === 'trap' && shellPos) {
        const body = c.args[0]
        if (body !== undefined && body !== '-' && !body.startsWith('-')) {
          if (TRAP_MOVES.test(body)) return deny(CWD)
          const inner = scriptReason(body, r, depth + 1, union(cmdCwd, [UNKNOWN]), true)
          if (inner.reason) return deny(inner.reason)
          evalEnd = union(cmdCwd, [UNKNOWN])
          pieceMutates = true
        }
        continue
      }
      if (SHELLS.has(c.base)) {
        const scripts = shellScriptsOf(c.args)
        // BASH_ENV·ENV 앞 할당이면 셸이 그 파일을 먼저 돈다 — 시작 위치를 「모름」으로 본다
        const start = tokens.some((t) => STARTUP_ASSIGN.test(t)) ? union(cmdCwd, [UNKNOWN]) : cmdCwd
        for (const s of scripts) {
          const inner = scriptReason(s, r, depth + 1, start, mutated)
          if (inner.reason) return deny(inner.reason)
          pieceMutates ||= inner.mutated
        }
        if (scripts.length === 0) pieceMutates = true
        continue
      }
      for (const s of windowsShellScripts(c) ?? []) {
        const inner = scriptReason(s, r, depth + 1, cmdCwd, mutated)
        if (inner.reason) return deny(inner.reason)
      }
      // eval은 인자를 이 셸에서 스크립트로 돌린다 — 안쪽 cd가 밖으로 나온다. 판독 못 한 글(변수·치환)이면 끝 위치에 「모름」을 더한다
      if (b === 'eval' && shellPos) {
        const text = c.args.join(' ')
        const inner = scriptReason(text, r, depth + 1, cmdCwd, mutated)
        if (inner.reason) return deny(inner.reason)
        pieceMutates ||= inner.mutated
        evalEnd = /[$`]/.test(text) ? union(inner.end, [UNKNOWN]) : inner.end
        continue
      }
      // source·`.`는 파일의 스크립트를 이 셸에서 돌린다 — 안을 모르니 위치를 「모름」으로 둔다
      if ((b === 'source' || b === '.') && shellPos && c.args.length > 0) { evalEnd = [SOURCED]; pieceMutates = true; continue }
      const reason = cmdReason(c, { r, depth, cwd: cmdCwd })
      if (reason) return deny(reason)
      if ((CD.has(b) || POP.has(b)) && cd === null) cd = { c, external: !shellPos }
      if (!readOnlyCmd(c)) pieceMutates = true
    }
    if (cmds.some((c) => EXIT_CMD.has(baseOfCmd(c)))) stops = union(stops, cwd)
    let effect: CdEffect | null = null
    let external = false
    if (evalEnd !== null) effect = { reason: null, dirs: evalEnd, canFail: true }
    else if (cd !== null) { effect = cdEffect(cd.c, baseOfCmd(cd.c), r, cwd); external = cd.external }
    const mutatedBefore = mutated
    mutated ||= pieceMutates
    if (effect === null) {
      // 이 명령이 실패하면 줄이 여기서 멈춘다
      chain = union(chain, cwd)
      continue
    }
    if (effect.reason !== null) return deny(effect.reason)
    // 파이프·백그라운드·`||` 곁이나 조건 몸통, 래퍼 뒤의 cd는 하위 셸·바깥 프로그램이거나 돌지 않을 수 있다 — 옛 위치를 남긴다
    // 몸통 안이라도 `cd x && 명령`의 명령은 cd가 돈 뒤에만 돈다 — 옛 위치는 줄이 끝날 때 다시 더해진다
    const uncertain = external || prev === '||' || prev === '|' || next === '|' || next === '&' || next === '||'
    const canFail = effect.canFail || mutatedBefore
    const before = cwd
    cwd = uncertain || (inBody && next !== '&&') ? union(before, effect.dirs) : effect.dirs
    if (canFail || uncertain || inBody) chain = union(chain, before)
  }
  cwd = union(chain, cwd)
  return { reason: null, end: union(stops, cwd), mutated }
}

// 셸 명령이 잠금에 걸리면 사유를, 아니면 null을 돌려준다. 셸 위치는 저장소 뿌리에서 시작한다(호출 사이는 훅이 넘긴다).
export function loopCommandReason(command: string, scope: LoopLockScope): string | null {
  const r = resolveScope(scope)
  return scriptReason(command, r, 0, [r.rootRaw]).reason
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// 도구 호출 하나의 판정과, 명령이면 끝난 뒤의 셸 위치.
// 편집 도구가 쓴 폴더는 다음 호출의 cd와 관계없다(판정 때 isDir를 다시 본다) — mutated는 호출 안에서만 쓴다.
function toolCheck(toolName: string | undefined, toolInput: unknown, r: Resolved, cwd: Cwd): Walk {
  if (toolName !== undefined && toolName.toLowerCase().startsWith('mcp__')) return { reason: MCP, end: cwd, mutated: false }
  const ti = toolInput && typeof toolInput === 'object' ? (toolInput as Record<string, unknown>) : {}
  // G4 검수 사소 2 — 편집 도구는 command 칸 판독보다 먼저 본다(입력에 command를 끼워 편집 도구 판정을 건너뛰지 못한다)
  if (toolName !== undefined && EDIT_TOOLS.has(toolName)) {
    // 읽기 전용 꼴(G4)은 편집 도구를 경로와 관계없이 거부한다
    if (r.readOnly) return { reason: READONLY, end: cwd, mutated: false }
    const p = typeof ti['file_path'] === 'string' ? ti['file_path'] : ti['notebook_path']
    if (typeof p === 'string') return { reason: reasonOfKind(pathKind(p, r, false, [r.rootRaw])), end: cwd, mutated: false }
  }
  const command = ti['command']
  if (typeof command === 'string') return scriptReason(command, r, 0, cwd)
  return { reason: null, end: cwd, mutated: false }
}

// 도구 호출 하나의 판정. mcp__ 도구는 전부 거부, `command` 입력을 가진 도구(Bash·PowerShell 등)는 명령으로, 편집 도구는 경로로 본다.
export function loopLockReason(toolName: string | undefined, toolInput: unknown, scope: LoopLockScope): string | null {
  const r = resolveScope(scope)
  return toolCheck(toolName, toolInput, r, [r.rootRaw]).reason
}

// ── 훅과 노드 정보 ─────────────────────────────────────────────────────────
// 공개 타입 PreToolUseHookInput에서 이 노드가 읽는 칸만 적는다(mergeDeny.ts와 같은 모양). cwd는 BaseHookInput의 칸이다.
interface PreToolUseInput {
  hook_event_name?: string
  tool_name?: string
  tool_input?: unknown
  cwd?: string
}

interface HookOutput {
  hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string }
}

interface LoopLockMatcher {
  matcher?: string
  hooks: ((input: PreToolUseInput, toolUseID: string | undefined, opts: { signal: AbortSignal }) => Promise<HookOutput>)[]
  timeout: number
  onFailure: 'block'
}

const LOOP_LOCK_TIMEOUT_S = 10

// 호출의 시작 위치 — 훅 입력의 cwd가 따라간 후보 가운데 하나면(모름이 없을 때) 그 위치로 좁히고, 아니면 후보에 더한다.
// 그 cwd가 셸의 진짜 위치인지는 공개 문서가 말하지 않아(CwdChanged 훅이 있어 위치를 따라가는 것으로 보인다) 좁히기에만 쓴다.
// 앞 호출의 source·`.`가 남긴 「모름」(SOURCED)은 훅이 준 cwd로 바꾼다 — 훅 cwd가 없으면 그대로 「모름」이다.
function startCwd(tracked: Cwd, hookCwd: string | undefined, r: Resolved): Cwd {
  if (typeof hookCwd !== 'string' || hookCwd.trim() === '') return tracked
  const h = canon(hookCwd, r.rootRaw)
  const known = tracked.filter((t) => t !== SOURCED)
  if (known.length === 0) return [h]
  if (!known.includes(UNKNOWN) && known.some((t) => t.toLowerCase() === h.toLowerCase())) return [h]
  return union(known, [h])
}

// ── M10 G2 메인 대화의 꼴 ─────────────────────────────────────────────────
// 허용 목록 밖은 모두 거부한다. 셸이 없으니 셸 위치를 따라가지 않는다 — 편집 도구의 상대 경로는 저장소 뿌리 기준이다.
const MAIN_SHELL = '메인 대화에서는 셸(Bash·PowerShell)을 쓰지 않습니다 — 루프 일은 실행기가 하고, 메인은 읽기·질문·앱 안 도구(멈춤·이어 가기·Backlog)만 씁니다.'
const MAIN_TOOL = '메인 대화에서 쓰지 않는 도구입니다 — 읽기 도구, 질문 도구(AskUserQuestion), 앱 안 도구(멈춤·이어 가기·Backlog)만 씁니다.'
const MAIN_MCP = '메인 대화의 MCP 도구는 앱 안 도구(멈춤·이어 가기·Backlog)뿐입니다.'
const MAIN_PATH = '메인 대화가 쓰는 파일은 .agentdeck/milestone-spec.md와 .agentdeck/decisions.md 둘뿐입니다 — 저장소 파일은 작업 노드가 고칩니다.'
const MAIN_WINDOW = '스펙·결정 대장은 실행기가 브레인스토밍 노드에 있을 때만 씁니다 — 지금은 쓰기 창이 닫혀 있습니다(브레인스토밍 밖이거나 사람 판정을 기다립니다).'
const MAIN_LINK = '.agentdeck 경로가 링크라 쓰지 않습니다 — 저장소 밖을 가리킬 수 있습니다.'
const MAIN_SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const MAIN_READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'AskUserQuestion', 'TodoWrite', 'ToolSearch'])
const MAIN_WRITABLE = ['milestone-spec.md', 'decisions.md'] as const

// `.agentdeck` 폴더나 그 파일이 링크(정션 포함)이거나, 실제 경로가 저장소 뿌리의 `.agentdeck` 아래가 아니면 참. 판정하지 못하면 참이다.
function linkedAway(rootRaw: string, name: string): boolean {
  try {
    const dir = `${rootRaw}/.agentdeck`
    const file = `${dir}/${name}`
    const dirStat = fs.lstatSync(dir, { throwIfNoEntry: false })
    if (!dirStat) return false
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return true
    const fileStat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (fileStat && (fileStat.isSymbolicLink() || !fileStat.isFile())) return true
    const want = normalize(`${fs.realpathSync(rootRaw)}/.agentdeck${fileStat ? `/${name}` : ''}`, rootRaw)
    return normalize(fs.realpathSync(fileStat ? file : dir), rootRaw) !== want
  } catch {
    return true
  }
}

// 메인 대화의 도구 호출 하나의 판정. scope.mainChat이 없으면 거부한다.
export async function mainChatToolReason(toolName: string | undefined, toolInput: unknown, scope: LoopLockScope): Promise<string | null> {
  const main = scope.mainChat
  if (!main || toolName === undefined) return MAIN_TOOL
  const ti = toolInput && typeof toolInput === 'object' ? (toolInput as Record<string, unknown>) : {}
  if (toolName.toLowerCase().startsWith('mcp__')) return toolName.startsWith(`mcp__${main.toolServer}__`) ? null : MAIN_MCP
  if (EDIT_TOOLS.has(toolName)) {
    if (toolName === 'NotebookEdit') return MAIN_PATH
    const raw = ti['file_path']
    if (typeof raw !== 'string' || raw.trim() === '') return MAIN_PATH
    // G2 독립 검수 — 편집 도구는 경로를 글자 그대로 쓴다(셸이 아니다). 변수·물결표·명령 치환을 펼쳐 두 경로로 보면 실제로는
    // 다른 파일(`$PWD/…` 글자 그대로의 폴더 등)을 쓰는 호출을 지나보낸다 — 펼치지 않고 거부한다
    const p = raw.trim()
    if (/[$%`]/.test(p) || p.startsWith('~')) return MAIN_PATH
    const r = resolveScope(scope)
    const target = normalize(p, r.rootRaw)
    const name = MAIN_WRITABLE.find((n) => target === `${r.root}/.agentdeck/${n}`)
    if (name === undefined) return MAIN_PATH
    if (linkedAway(r.rootRaw, name)) return MAIN_LINK
    let open = false
    try { open = (await main.canWrite()) === true } catch { open = false }
    return open ? null : MAIN_WINDOW
  }
  if (MAIN_SHELL_TOOLS.has(toolName) || typeof ti['command'] === 'string') return MAIN_SHELL
  return MAIN_READ_TOOLS.has(toolName) ? null : MAIN_TOOL
}

// 훅 인스턴스 하나가 작업 노드 세션 하나의 셸 위치를 호출 사이로 넘긴다(workSession이 세션마다 새로 만든다).
// M10 G2 — scope.mainChat이 있으면 메인 대화의 꼴(mainChatToolReason)로 판정한다.
export function buildLoopLockHook(scope: LoopLockScope): LoopLockMatcher {
  if (scope.mainChat) {
    return {
      hooks: [
        async (input) => {
          const reason = await mainChatToolReason(input.tool_name, input.tool_input, scope)
          if (reason === null) return {}
          return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
        },
      ],
      timeout: LOOP_LOCK_TIMEOUT_S,
      onFailure: 'block',
    }
  }
  const r = resolveScope(scope)
  let tracked: Cwd = [r.rootRaw]
  return {
    hooks: [
      async (input) => {
        const start = startCwd(tracked, input.cwd, r)
        const out = toolCheck(input.tool_name, input.tool_input, r, start)
        if (out.reason === null) {
          tracked = out.end
          return {}
        }
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: out.reason } }
      },
    ],
    timeout: LOOP_LOCK_TIMEOUT_S,
    onFailure: 'block',
  }
}

// 앱 세션 등록부(listControlNodes)에는 넣지 않는다 — 컨트롤 패널은 앱 세션의 노드를 보인다. 루프 화면(G3)이 이 정보를 쓴다.
export const LOOP_LOCK_NODE: ControlNodeInfo = Object.freeze({
  id: 'loop-lock',
  name: '루프 작업 노드 세션의 원격 쓰기·자격·git 설정·Claude 설정·실행기 몫 파일·저장소 밖 쓰기 잠금',
  point: 'preToolUse',
  judge: 'rule',
  results: Object.freeze(['deny'] as const),
  // 명령 글자를 바꾸면 피해 가므로 L3다 — 겹일 뿐이다. 끌 수 없다.
  protection: 'L3',
  locked: true,
  onFailure: 'block',
  timeoutMs: LOOP_LOCK_TIMEOUT_S * 1000,
})
