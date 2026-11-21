// 화면 맨 위 세 질문(지금 무슨 일 · 내 손이 필요한 일 · 전체 중 어디쯤)의 판정.
// 문장은 짓지 않는다. 원문 글자를 규칙으로 줄이거나, 아래 고정 문구에 원문 값을 넣기만 한다.
import { GOAL_STATUS, SECTION_RE, lines, splitSentences } from './markdown.mjs';

const chars = s => Array.from(String(s ?? ''));
const clip = (s, n) => { const a = chars(s); return a.length > n ? a.slice(0, n).join('').trimEnd() + '…' : a.join(''); };

// 괄호와 백틱 안 글을 덜어낸다. 짧은 이름에서만 쓴다(원문은 그대로 남는다).
export function stripAside(text) {
  let out = '', depth = 0, tick = false;
  for (const c of String(text ?? '')) {
    if (c === '`' && !depth) { tick = !tick; continue; }
    if (tick) continue;
    if (c === '(' || c === '（') { depth++; continue; }
    if ((c === ')' || c === '）') && depth) { depth--; continue; }
    if (!depth) out += c;
  }
  return out.replace(/\s+([,，])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[,，\s]+$/, '').trim();
}

// 「이 goal 문서」·「해당 결정 기록」처럼 지시어(이·그·본·해당·이번) 뒤에 낱말이 두 개까지이고, 문서를 가리키는 낱말로 끝나는 항목.
// 그것만으로는 무엇을 하는지 말하지 않는다. 「이 브랜치에 커밋」처럼 행위로 끝나면 지시어 항목이 아니다.
const DOC_WORD = '(문서|기록|대장|절|줄|파일|goal|단계|목록|메모|계획|Backlog)';
export const isDeicticItem = item => new RegExp(`^(이|그|본|해당|이번)(\\s+\\S+)?\\s+\\S*${DOC_WORD}$`).test(String(item ?? '').trim());

// 단계·goal의 짧은 이름. 규칙은 셋이다.
//  1. 「 — 」(앞뒤 공백 있는 긴 줄표)가 있으면 그 앞부분이다.
//  2. 없으면 괄호·백틱 안을 덜어낸 글이다. 그래도 max(32)자를 넘으면 쉼표로 나눈 첫 항목 + 「외 N가지」다.
//     첫 항목이 지시어 항목이면 그 뒤의 첫 의미 있는 항목을 쓴다(모두 지시어 항목이면 첫 항목). N은 나머지 항목 수다.
//  3. 쉼표도 없으면 max자에서 자르고 「…」를 단다.
export function shortName(text, max = 32) {
  const s = String(text ?? '').trim();
  const dash = /\s[—–]\s/.exec(s);
  if (dash && dash.index > 0) return clip(stripAside(s.slice(0, dash.index)) || s.slice(0, dash.index).trim(), max);
  const bare = stripAside(s) || s;
  if (chars(bare).length <= max) return bare;
  const parts = bare.split(/\s*[,，]\s*/).filter(Boolean);
  const head = parts.find(p => !isDeicticItem(p)) ?? parts[0];
  return parts.length > 1 ? `${clip(head, max)} 외 ${parts.length - 1}가지` : clip(bare, max);
}

// goal 제목: 「M05 G9c — 이름」. 이름이 「 · 」로 이어지면 앞부분만 짧은 이름이다.
export const GOAL_TITLE = /^(M\d+)\s+([A-Z]\d+[a-z]?)\s+[—–-]\s+(.+?)\s*$/;
export function goalTitle(title) {
  const m = GOAL_TITLE.exec(String(title ?? '').trim());
  if (!m) return null;
  return { milestone: m[1], id: m[2], name: m[3].split(/\s+·\s+/)[0].trim(), full: m[3] };
}
// 머리말 「- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · …」의 마일스톤 이름(괄호 덜어냄)
export function milestoneName(statusLine) {
  const first = String(statusLine ?? '').split(/\s+·\s+/)[0];
  const m = /^마일스톤\s*:\s*(.+)$/.exec(first.trim());
  return m ? stripAside(m[1]) || m[1].trim() : null;
}
export const prOf = status => { const m = /\bPR\s*#?(\d+)/.exec(String(status ?? '')); return m ? Number(m[1]) : null; };
// 머리말 「상태:」의 첫 낱말 → 목록의 세 갈래. 알 수 없는 낱말은 지어내지 않고 unknown이다.
export function goalState(status) {
  const w = GOAL_STATUS.exec(String(status ?? ''))?.[1] ?? null;
  return { word: w, state: w === '종결' ? 'done' : w === '실행 중' || w === '병합 대기' ? 'current' : w === '초안' ? 'draft' : 'unknown' };
}

// goal 문서의 「## 목표」 절 첫 문단
export function parseGoalAim(text) {
  const all = lines(text), s = all.findIndex(l => /^##\s+목표\s*$/.test(l));
  if (s < 0) return null;
  const para = [];
  let first = null;
  for (let i = s + 1; i < all.length && !SECTION_RE.test(all[i]); i++) {
    if (!all[i].trim()) { if (para.length) break; continue; }
    first ??= i + 1; para.push(all[i].trim());
  }
  if (!para.length) return null;
  const text2 = para.join(' ');
  return { line: first, text: text2, sentences: splitSentences(text2) };
}

// 계획 문서의 「## … goal 목록」 절 아래 「### G10 — 이름 · 강」 머리들. 아직 파일이 없는 goal을 알려 준다.
export function parsePlannedGoals(text) {
  const out = [];
  let inList = false;
  lines(text).forEach((raw, i) => {
    if (SECTION_RE.test(raw)) { inList = /goal\s*목록/i.test(raw); return; }
    if (!inList) return;
    const m = /^###\s+([A-Z]\d+[a-z]?)\s+[—–-]\s+(.+?)\s*$/.exec(raw);
    if (m) out.push({ id: m[1], name: m[2].split(/\s+·\s+/)[0].trim(), line: i + 1 });
  });
  return out;
}

// 마일스톤 안 goal 목록. 파일이 있는 goal은 파일 이름 순서, 계획만 있는 goal은 그 뒤에 계획 문서 순서다.
// 계획의 「G9」는 파일의 「G9a」·「G9b」로 나뉘었으면 이미 있는 것으로 본다(「G1」과 「G10」은 다르다).
export function buildGoalList(files, planned, currentPath) {
  const items = files.map(f => {
    const t = goalTitle(f.title), g = goalState(f.status);
    return { id: t.id, name: t.name, path: f.path, line: f.line ?? null, state: f.path === currentPath && g.state !== 'done' ? 'current' : g.state,
      word: g.word, pr: prOf(f.status), current: f.path === currentPath, planned: false };
  });
  const covered = id => items.some(it => it.id === id || new RegExp(`^${id}[a-z]$`).test(it.id));
  for (const p of planned) if (!covered(p.id) && !items.some(it => it.planned && it.id === p.id))
    items.push({ id: p.id, name: p.name, path: p.path, line: p.line, state: 'left', word: null, pr: null, current: false, planned: true });
  const n = s => items.filter(it => it.state === s).length;
  return { items, total: items.length, done: n('done'), doing: n('current') + n('draft'), left: n('left'), unknown: n('unknown') };
}

// 최근 활동: 자동 검사 기록(hook-log)을 고정 규칙으로 분류한다.
export const ACTIVITY = Object.freeze({
  read: ['코드를 읽고 있어요', '코드를 읽었어요'],
  test: ['테스트를 돌리고 있어요', '테스트를 돌렸어요'],
  edit: ['파일을 고치고 있어요', '파일을 고쳤어요'],
  build: ['빌드나 형식 검사를 돌리고 있어요', '빌드나 형식 검사를 돌렸어요'],
  commit: ['커밋을 만들고 있어요', '커밋을 만들었어요'],
  push: ['원격 저장소나 PR을 다루고 있어요', '원격 저장소나 PR을 다뤘어요'],
  orca: ['Orca로 다른 작업 창을 다루고 있어요', 'Orca로 다른 작업 창을 다뤘어요'],
  run: ['명령을 실행하고 있어요', '명령을 실행했어요'],
  stop: ['응답을 마쳤어요', '응답을 마쳤어요'],
});
export const KIND_WORD = Object.freeze({ read: '코드 읽기', test: '테스트', edit: '파일 수정', build: '빌드·검사', commit: '커밋', push: '원격·PR', orca: 'Orca 창 관리', run: '기타 명령', stop: '응답 마침' });
const ACTOR = { sub: '하위 에이전트가', main: '메인 세션이' };

// 명령 한 줄의 종류. 앞의 「cd …」와 변수 대입은 건너뛰고 첫 실제 명령으로 정한다.
export function commandKind(cmd) {
  const segs = String(cmd ?? '').split(/\s*(?:&&|\|\||;|\|)\s*/).map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(cd|pushd|set-location)\b/i.test(s) && !/^[A-Za-z_][A-Za-z0-9_]*=\S*$/.test(s));
  const c = (segs[0] || '').replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, '');
  if (!c) return null;
  // npm·pnpm·yarn은 「run」과 「-s」 같은 선택지를 건너뛴 스크립트 이름으로 가른다(test:hooks도 테스트다)
  const script = /^(npm|pnpm|yarn)\s+(?:(?:run|run-script)\s+)?(?:-\S+\s+)*([\w:.-]+)/.exec(c)?.[2] || '';
  if (/^(npx\s+)?(vitest|jest|mocha|playwright\s+test)\b|^node\s+--test\b/.test(c) || /^test\b/.test(script)) return 'test';
  if (/^(npx\s+)?(tsc|eslint|prettier)\b/.test(c) || /^(build|lint|typecheck|check|gate|format)\b/.test(script)) return 'build';
  if (/^git\s+(commit|add)\b/.test(c)) return 'commit';
  if (/^git\s+push\b|^gh\s+(pr|api)\b/.test(c)) return 'push';
  if (/^(grep|rg|sed|cat|head|tail|ls|find|wc|awk|tree|stat|less|diff)\b|^git\s+(log|diff|show|status|grep|blame|ls-files|rev-parse|branch)\b/.test(c)) return 'read';
  if (/^orca\b/.test(c)) return 'orca';
  return 'run';
}
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// 기록 한 줄의 활동 종류. 같은 동작에 여러 검사가 기록을 남기므로 한 검사만 센다(명령은 cmd-guard, 수정은 edit-plan-gate, 마침은 Stop).
export function activityKind(e) {
  if (e.hook === 'cmd-guard' && e.event !== 'PostToolUse' && e.detail) return commandKind(e.detail);
  if (e.hook === 'edit-plan-gate' && EDIT_TOOLS.has(e.tool)) return 'edit';
  if (e.event === 'Stop' && e.hook === 'surface-probe') return 'stop';
  return null;
}

// 응답 마침 뒤 조용함: hook-log의 마지막 기록(활동으로 세지 않는 기록까지 모두 친다)이 응답 마침이면 그 시각을 준다.
// 응답 마침은 surface-probe의 Stop이다. 같은 Stop에 stop-gate도 기록을 남기고 두 훅의 기록 순서는 보장되지 않으므로,
// 기록 끝에 이어진 Stop 기록 묶음 안에 surface-probe가 있으면 응답 마침으로 본다.
// 걸린 시간은 화면 시계가 잰다(public/chime.js quietMinutes). after분을 넘게 조용하면 알아 두면 좋은 사실 줄이다.
// 알림음·탭 제목 배지 대상이 아니다. hook-log로는 사용자 답을 기다리는지, 배경 작업을 기다리는지 가를 수 없다.
export const QUIET_AFTER_MIN = 5;
export function judgeQuiet(entries) {
  const E = entries || [];
  let i = E.length - 1, probe = null;
  for (; i >= 0 && E[i]?.event === 'Stop'; i--) if (!probe && E[i].hook === 'surface-probe') probe = E[i];
  if (!probe || !probe.at) return null;
  return { at: probe.at, session: probe.session, after: QUIET_AFTER_MIN };
}

// 가장 최근 「마침」 뒤의 활동 window개에서 가장 많은 종류를 고른다. 같으면 더 최근 것이다.
// quiet는 judgeQuiet의 값이다. 마지막 기록이 응답 마침이면 마지막 활동도 응답 마침이라 그 갈래에만 붙는다.
export function summarizeActivity(entries, { window = 8 } = {}) {
  const acts = (entries || []).map(e => ({ e, kind: activityKind(e) })).filter(a => a.kind);
  if (!acts.length) return null;
  const last = acts.at(-1);
  if (last.kind === 'stop') {
    const actor = last.e.actor === 'sub' ? 'sub' : 'main';
    return { kind: 'stop', actor, at: last.e.at, session: last.e.session, count: 1, of: 1, detail: null, quiet: judgeQuiet(entries),
      say: `${ACTOR[actor]} ${ACTIVITY.stop[0]}`, sayPast: `${ACTOR[actor]} ${ACTIVITY.stop[1]}` };
  }
  const stopAt = acts.map(a => a.kind).lastIndexOf('stop');
  const recent = acts.slice(stopAt + 1).slice(-window);
  const count = new Map();
  recent.forEach((a, i) => { const c = count.get(a.kind) || { n: 0, i }; c.n++; c.i = i; count.set(a.kind, c); });
  const [kind, { n }] = [...count].sort((a, b) => b[1].n - a[1].n || b[1].i - a[1].i)[0];
  const pick = recent.filter(a => a.kind === kind).at(-1);
  const actor = pick.e.actor || null, who = actor ? ACTOR[actor] + ' ' : '';
  return { kind, actor, at: last.e.at, session: pick.e.session, count: n, of: recent.length, detail: pick.e.detail,
    say: who + ACTIVITY[kind][0], sayPast: who + ACTIVITY[kind][1] };
}

// 지금 하는 일: goal 번호 + 지금 단계의 짧은 이름.
export function doingLine({ goal, phases }) {
  const P = phases;
  if (!P || P.status !== 'ok') return { text: null, why: '단계 정보를 읽지 못했어요.' };
  const id = goal?.id ? goal.id + ' ' : '', n = P.items.length;
  if (P.format !== 'goal') {
    const cur = P.items.find(p => p.num === P.current);
    return cur ? { text: `${id}${cur.num}단계 「${shortName(cur.name)}」 진행 중`, step: cur.num } : { text: null, why: '진행 중인 단계를 정하지 못했어요.' };
  }
  const G = P.goal, cur = P.items.find(p => p.num === P.current), nx = P.items.find(p => p.num === P.next);
  const label = p => p.label ?? p.num;
  if (G.closed) return { text: `${id}종결됐어요`, step: null };
  if (cur && cur.flow === 'stopped') return { text: `${id}${label(cur)}단계 「${shortName(cur.name)}」에서 멈췄어요`, step: cur.num };
  if (cur) return { text: `${id}${label(cur)}단계 「${shortName(cur.name)}」 진행 중`, step: cur.num };
  if (G.stage === 'all-done') return { text: `${id}${n}단계를 모두 마쳤어요`, step: null };
  if (G.stage === 'between' && nx) return { text: `${id}${G.done}단계까지 마쳤고 ${label(nx)}단계 「${shortName(nx.name)}」 시작 전이에요`, step: nx.num };
  if (G.stage === 'not-started' && nx) return { text: `${id}첫 단계 「${shortName(nx.name)}」 시작 전이에요`, step: nx.num };
  return { text: null, why: '「진척 단계」 목록에 항목이 없어요.' };
}

// 내 손이 필요한 일: 원문에 적힌 사실만으로 정한다. 없으면 빈 목록이고 화면은 「없음」이라고 쓴다.
// level: stop(멈춤 — 답하기 전엔 진행하지 않음) · todo(사용자가 할 일). fresh가 있는 항목은 그 분 안에서만 보인다(화면 시계로 판정).
// key: 알림 키. 같은 사실이면 같은 키다(알림음은 키마다 한 번 — public/chime.js, docs/알림.md).
//   단계 번호와 결정 대장 게이트는 goal마다 되풀이되므로 goal 문서 경로를 키에 넣는다.
//   멈춤은 사용자 입력 줄 수를, 결정 대장 게이트는 사용자 결정 수를 넣는다. 사용자가 답한 뒤 다시 막히면 새 사실이다.
//   병합 대기는 goal 문서 경로만 쓴다(PR 번호가 나중에 붙어도 같은 사실). 사용자 입력 줄은 줄 번호 대신 그 줄의 시각으로 가른다.
const keyOf = (...parts) => parts.filter(p => p != null && p !== '').join(':');
export function judgeHand({ phases, ledger, hooks, failLimit = 3 }) {
  const out = [], P = phases;
  if (P?.status === 'ok') {
    const stopped = P.items.find(p => p.flow === 'stopped');
    const rec = P.format === 'goal' ? P.record : stopped?.record;
    const doc = P.format === 'goal' ? P.goal?.ref?.path : null;
    if (stopped) out.push({ id: 'stopped', key: keyOf('stopped', doc ?? stopped.ref?.path ?? rec?.ref?.path, stopped.label ?? stopped.num, `u${rec?.userInput ?? 0}`), level: 'stop',
      say: `${stopped.label ?? stopped.num}단계에서 실패가 ${rec?.failSinceUserInput ?? failLimit}번 쌓여 멈췄어요. 무엇이 막혔는지 보고 메인 세션에 어떻게 할지 답해 주세요.`,
      source: '검증 기록 — 마지막 사용자 입력 뒤 실패 수', ref: rec?.ref || null });
    if (P.format === 'goal') {
      const G = P.goal, cur = P.items.find(p => p.num === P.current);
      if (G.statusWord === '병합 대기') { const pr = prOf(G.status); out.push({ id: 'merge', key: keyOf('merge', doc ?? G.ref?.path), level: 'todo', say: `${pr ? `PR ${pr}` : 'PR'}의 병합을 기다려요 — 위 병합 카드의 「병합」 버튼으로 해 주세요(바탕화면 확인 창에서 한 번 더 눌러요).`, source: 'goal 문서 머리말 「상태: 병합 대기」', ref: G.ref, pr }); }
      else if (!G.closed && cur && /병합\s*승인/.test(cur.name)) out.push({ id: 'merge-step', key: keyOf('merge-step', doc, cur.label ?? cur.num), level: 'todo', say: '지금 단계가 PR 병합으로 끝나요. PR이 열리면 병합 카드에서 「꼭 볼 것」을 보고 「병합」 버튼으로 병합해 주세요.', source: `goal 문서 진척 단계 ${cur.label ?? cur.num}`, ref: cur.ref });
      if (G.waitingUser) { const last = P.record?.last;
        out.push({ id: 'question', key: keyOf('question', last?.file ?? doc, last?.at ?? last?.line), level: 'todo', say: '마지막 검증 기록이 사용자 입력 줄이에요. 답을 기다리는 질문인지 확인해 주세요.', quote: last?.text ?? null, source: 'goal 문서 검증 기록의 마지막 줄', ref: last ? { path: last.file, line: last.line } : null }); }
    }
  }
  if (ledger?.status === 'ok' && ledger.gate !== 'clear') out.push({ id: 'ledger', key: keyOf('ledger', ledger.ref?.path, ledger.gate, `u${ledger.userSide ?? 0}`), level: 'stop',
    say: ledger.gate === 'immediate' ? '되돌리기 어려운 결정을 AI가 혼자 내린 기록이 있어 새 워커를 띄울 수 없어요. 결정 기록을 보고 판단해 주세요.'
      : `AI가 혼자 내린 결정(${ledger.tally.AI}건)이 사용자 결정(${ledger.userSide}건)보다 많아 새 워커를 띄울 수 없어요. 결정 기록을 보고 판단해 주세요.`,
    source: 'goal 문서 결정 대장', ref: ledger.ref || null });
  // 명령 승인 질문: 같은 세션에 그 뒤 기록이 없을 때만 아직 답을 기다리는 것으로 본다
  if (hooks?.status === 'ok') {
    const E = hooks.entries, i = E.map(e => e.hook === 'cmd-guard' && e.verdict === 'ask').lastIndexOf(true);
    if (i >= 0 && !E.slice(i + 1).some(e => e.session === E[i].session))
      out.push({ id: 'ask', key: keyOf('ask', E[i].at), level: 'todo', say: '명령을 실행해도 되는지 승인을 물었어요. 승인 창을 확인해 주세요.', quote: E[i].detail, at: E[i].at, fresh: 10, source: '자동 검사 기록 — 명령 승인 질문 뒤 같은 세션 기록 없음' });
  }
  return out;
}

// 인수인계 메모 「봐야 할 것」에서 「사용자 몫」이라고 적힌 문장. 같은 글은 한 번만 둔다.
export function userChores(watch) {
  const seen = new Set();
  return (watch?.parts || []).filter(s => /사용자\s*몫/.test(s)).filter(s => !seen.has(s) && seen.add(s));
}
