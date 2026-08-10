// 표피 검사 훅 계약 (M02 Phase 4 Step 2) — 51_surface-probe.cjs의 상수·파서·출력·로그·오류 계약을 실측한다.
//
// 계약의 소유자는 계획 문면이다 (04_Phase_4.md Step 2, 결정 대장 [USER] 2026-08-10):
//   검사 대상 = Stop 입력 transcript의 마지막 assistant 메시지 text 블록을 단일 `\n` 하나로 이어 붙인 본문.
//   제외 구간 = 코드 펜스·백틱 스팬 내부와 Markdown 링크 목적지.
//   표피 넷 = 원문자 라틴 1회 · 문장당 균형 괄호 2쌍 · 문장당 화살표 3개 · 문장 200자 초과.
//   출력 = 항상 exit 0 · decision 부재 · systemMessage는 verdict `발화`에만 정확히 1건.
//   로그 = 모든 실행이 여섯 필드(hook·event·session·agent_id·ts·verdict) 한 줄.
//   입력 오류 3형(transcript 부재·JSONL 파싱 실패·assistant text 부재) = fail-open + `판정불가`.
import { createGateHarness } from './_lib/gate-harness.mjs'
import { createRunner } from './_lib/runner.mjs'

const r = createRunner('표피 검사 훅 계약 (51_surface-probe)')
const h = createGateHarness()
const runs = [] // 출력·로그 계약을 전 실행에 걸어 판정하려고 모은다

let seq = 0
function text(...ts) {
  return ts.map((t) => ({ type: 'text', text: t }))
}
// 마지막 assistant 메시지를 만들어 훅을 1회 구동한다 — 판정 결과를 요약해 돌려준다.
function probe(blocks, opts = {}) {
  seq++
  const tp = h.path(`t-${seq}.jsonl`)
  const lines = [...(opts.prelude || [])]
  lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '질문' }] } }))
  lines.push(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: blocks } }))
  h.write(tp, lines.join('\n') + '\n')
  return raw({ transcript_path: tp, ...(opts.payload || {}) }, opts)
}
function raw(extraPayload, opts = {}) {
  const payload = {
    hook_event_name: 'Stop', session_id: opts.session || 'sp-session', cwd: h.mirror,
    stop_hook_active: false, ...extraPayload,
  }
  const out = h.run('51_surface-probe.cjs', payload)
  const line = out.added.find((l) => l.hook === 'surface-probe') || null
  let msg = null, parsed = null
  const s = (out.stdout || '').trim()
  if (s) { try { parsed = JSON.parse(s) } catch { parsed = 'PARSE_FAIL' } }
  if (parsed && parsed !== 'PARSE_FAIL') msg = typeof parsed.systemMessage === 'string' ? parsed.systemMessage : null
  const rec = {
    code: out.code, stdout: s, parsed, line,
    verdict: line ? line.verdict : '(로그 없음)',
    msgs: msg === null ? 0 : 1,
    logCount: out.added.length,
  }
  runs.push(rec)
  return rec
}

// ── 표피 넷의 경계값 양쪽 ──────────────────────────────────────────────
r.judge('SP-01 원문자 0개 (①은 목록 관행)', probe(text('① 첫째 항목만 있는 응답이다.')).verdict, '통과')
r.judge('SP-02 원문자 1개 (ⓐ)', probe(text('ⓐ로 지칭하는 응답이다.')).verdict, '발화')
r.judge('SP-03 균형 괄호 1쌍', probe(text('괄호가 한 쌍(하나)뿐인 문장이다.')).verdict, '통과')
r.judge('SP-04 균형 괄호 2쌍', probe(text('괄호가 두 쌍(하나) 그리고(둘) 있는 문장이다.')).verdict, '발화')
r.judge('SP-05 화살표 2개', probe(text('가 → 나 → 다 순서다.')).verdict, '통과')
r.judge('SP-06 화살표 3개', probe(text('가 → 나 → 다 → 라 순서다.')).verdict, '발화')
r.judge('SP-07 문장 200자', probe(text('가'.repeat(199) + '.')).verdict, '통과')
r.judge('SP-08 문장 201자', probe(text('가'.repeat(200) + '.')).verdict, '발화')
r.judge('SP-09 여는 괄호 3개·짝 0쌍', probe(text('짝이 없는 ((( 문장이다.')).verdict, '통과')
r.judge('SP-09b 중첩 괄호는 2쌍', probe(text('중첩된 (가 (나)) 문장이다.')).verdict, '발화')

// ── 제외 구간 ──────────────────────────────────────────────────────────
const fence = probe(text('아래 예시는 판정 대상이 아니다.\n```js\nconst x = (a) + (b) // ⓐ → ⓑ → ⓒ → ⓓ\n```\n본문은 깨끗하다.'))
r.judge('SP-10 코드 펜스 내부 제외', fence.verdict, '통과')
r.judge('SP-11 백틱 스팬 내부 제외', probe(text('명령은 `run(a) → run(b) → run(c) → ⓐ`뿐이다.')).verdict, '통과')
r.judge('SP-12 링크 2개 문장 비발화', probe(text('정본은 [계획](01_Milestones/x.md)과 [규칙](00_Documents/y.md)이다.')).verdict, '통과')

// ── 구조 경계 ──────────────────────────────────────────────────────────
r.judge('SP-13 목록 두 항목 괄호 비합산', probe(text('- 첫 항목(하나)이다.\n- 둘째 항목(둘)이다.')).verdict, '통과')
r.judge('SP-13b 한 항목 안 2쌍은 발화', probe(text('- 한 항목(하나)에 둘(둘)이다.')).verdict, '발화')
r.judge('SP-14 표 행 셀 비합산', probe(text('| 가(하나) | 나(둘) |')).verdict, '통과')
r.judge('SP-14b 표제 줄 경계', probe(text('# 제목(하나)\n본문(둘)이다.')).verdict, '통과')

// ── text 블록 결합이 단일 `\n`임의 실측 (블록 경계 2건 + 대조군) ────────
r.judge('SP-15 블록 두 개에 걸친 괄호 비합산', probe(text('앞 블록은 괄호 한 쌍(하나)', '(둘) 뒤 블록이다.')).verdict, '통과')
r.judge('SP-15b 대조군 — 같은 글자를 한 블록에 두면 발화', probe(text('앞 블록은 괄호 한 쌍(하나)(둘) 뒤 블록이다.')).verdict, '발화')
r.judge('SP-16 블록 경계에서 문장이 닫힌다', probe(text('가 → 나 → 다', '라 → 마 그리고 바.')).verdict, '통과')
r.judge('SP-16b 대조군 — 경계가 없으면 화살표 3개로 발화', probe(text('가 → 나 → 다 라 → 마 그리고 바.')).verdict, '발화')

// ── 블록 종류·메시지 선택 ──────────────────────────────────────────────
const mixed = probe([
  { type: 'thinking', thinking: 'ⓐ 생각은 (가) 검사 (나) 대상이 → → → 아니다.' },
  { type: 'text', text: '실제 답은 깨끗하다.' },
  { type: 'tool_use', id: 'x', name: 'Bash', input: { command: 'echo (가) (나) → → →' } },
])
r.judge('SP-17 thinking·tool_use 블록 제외', mixed.verdict, '통과')
const older = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ⓐ 앞 메시지는 위반이다.' }] } })
r.judge('SP-18 마지막 assistant 메시지만 본다', probe(text('마지막 답은 깨끗하다.'), { prelude: [older] }).verdict, '통과')

// ── 입력 오류 3형 (fail-open) ─────────────────────────────────────────
const noPath = raw({})
r.judge('SP-19 transcript_path 부재', noPath.verdict, '판정불가')
const badJson = h.path('broken.jsonl')
h.write(badJson, '{이건 JSON이 아니다\n또 아니다\n')
r.judge('SP-20 JSONL 파싱 실패', raw({ transcript_path: badJson }).verdict, '판정불가')
const noText = h.path('no-text.jsonl')
h.write(noText, [
  JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '질문' }] } }),
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'y', name: 'Read', input: {} }] } }),
].join('\n') + '\n')
r.judge('SP-21 assistant text 블록 부재', raw({ transcript_path: noText }).verdict, '판정불가')

// ── agent_id 유·무 ────────────────────────────────────────────────────
const withAgent = probe(text('깨끗한 답이다.'), { payload: { agent_id: 'agt_p4' } })
r.judge('SP-22 agent_id 있으면 값 기록', withAgent.line ? withAgent.line.agent_id : '(로그 없음)', 'agt_p4')
const noAgent = probe(text('깨끗한 답이다.'))
r.judge('SP-23 agent_id 없으면 null 기록', noAgent.line ? noAgent.line.agent_id : '(로그 없음)', null)

// ── 출력·로그 계약 (전 실행 일괄) ─────────────────────────────────────
r.check('SP-24 모든 실행이 exit 0', runs.every((x) => x.code === 0), `실측 코드: ${[...new Set(runs.map((x) => x.code))].join(',')}`)
r.check('SP-25 어떤 실행도 decision 필드를 내지 않는다',
  runs.every((x) => !(x.parsed && x.parsed !== 'PARSE_FAIL' && 'decision' in x.parsed)),
  `decision 낸 실행 ${runs.filter((x) => x.parsed && x.parsed !== 'PARSE_FAIL' && 'decision' in x.parsed).length}건`)
r.check('SP-26 stdout이 있으면 JSON이다', runs.every((x) => x.parsed !== 'PARSE_FAIL'), 'JSON 파싱 실패한 stdout이 있다')
r.check('SP-27 발화 verdict에만 systemMessage 정확히 1건',
  runs.every((x) => x.msgs === (x.verdict === '발화' ? 1 : 0)),
  runs.filter((x) => x.msgs !== (x.verdict === '발화' ? 1 : 0)).map((x) => `${x.verdict}/${x.msgs}건`).join(' '))
r.check('SP-28 통과·판정불가는 stdout 무출력',
  runs.filter((x) => x.verdict !== '발화').every((x) => x.stdout === ''), '비발화 실행이 stdout을 냈다')
const SIX = ['hook', 'event', 'session', 'agent_id', 'ts', 'verdict']
r.check('SP-29 모든 실행이 로그 줄 정확히 1건', runs.every((x) => x.logCount === 1), `줄 수 집합: ${[...new Set(runs.map((x) => x.logCount))].join(',')}`)
r.check('SP-30 모든 로그 줄이 여섯 필드를 갖춘다',
  runs.every((x) => x.line && SIX.every((k) => k in x.line)),
  `결손 줄 ${runs.filter((x) => !x.line || !SIX.every((k) => k in x.line)).length}건`)
r.check('SP-31 event는 Stop, verdict는 세 값 중 하나',
  runs.every((x) => x.line && x.line.event === 'Stop' && ['발화', '통과', '판정불가'].includes(x.line.verdict)), '이벤트·verdict 어휘 이탈')
r.check('SP-32 표피별 계수가 evidence에 담긴다',
  runs.filter((x) => x.verdict !== '판정불가').every((x) => x.line && x.line.evidence && typeof x.line.evidence === 'object'
    && ['circled', 'parens', 'arrows', 'long'].every((k) => k in x.line.evidence)), 'evidence 표피 계수 결손')
r.check('SP-33 판정불가 줄에 사유가 있다',
  runs.filter((x) => x.verdict === '판정불가').every((x) => x.line && typeof x.line.reason === 'string' && x.line.reason.length > 0), '사유 없는 판정불가 줄')
const fired = runs.find((x) => x.verdict === '발화')
r.check('SP-34 피드백 문구가 기계 판정 불능 한계를 명시한다',
  !!(fired && /핵심 층/.test(fired.stdout) && /기계 판정 불능/.test(fired.stdout)),
  fired ? fired.stdout.slice(0, 120) : '발화 실행 없음')
r.check('SP-35 피드백 문구 접두가 `[표피 훅]`이다',
  !!(fired && /^\{"systemMessage":"\[표피 훅\]/.test(fired.stdout)), fired ? fired.stdout.slice(0, 60) : '발화 실행 없음')

h.cleanup()
process.exit(r.summary())
