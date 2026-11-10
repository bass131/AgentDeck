import { createHash } from 'node:crypto';

export const SCHEMA = 'ad-dashboard/1';
// 화면에 전하는 코드 상수다. 사용자 판단이 아니므로 설정 파일에 넣지 않는다.
export const RULES = Object.freeze({
  failLimit: 3,               // 헌법 7조·plan-gate FAIL_LIMIT
  hookTailBytes: 512 * 1024,  // hook-log는 계속 커지므로 꼬리만 읽는다
  hookTailLines: 400,         // 꼬리에서 판독하는 줄 수(deny 모음의 범위)
  hookRecent: 40,             // 최근 기록으로 보여 주는 줄 수
  denyVerdicts: Object.freeze(['deny', 'block']),
  denyFreshMinutes: 10,       // 마지막 막힌 판정이 이 시간 안이면 머리 신호를 「주의」로 올린다
  commitScan: 200,            // Phase 커밋 토큰을 찾는 최근 커밋 수
});

// 긴 문단을 문장 단위로 나눈다. 백틱·괄호·낫표 안과 「1. 」 같은 번호 뒤에서는 나누지 않는다.
// 글자는 하나도 버리지 않는다(나눈 조각을 공백으로 이으면 원문과 같다).
export function splitSentences(text) {
  const s = String(text ?? '').trim(), out = [];
  if (!s) return out;
  let depth = 0, tick = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') { tick = !tick; continue; }
    if (tick) continue;
    if (c === '(' || c === '「' || c === '[') depth++;
    else if (c === ')' || c === '」' || c === ']') depth = Math.max(0, depth - 1);
    else if ((c === '.' || c === '?' || c === '!') && depth === 0 && /\s/.test(s[i + 1] || '') && !/\d/.test(s[i - 1] || '')) {
      out.push(s.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// ---- plan-gate(.claude/hooks/20_plan-gate.cjs)와 같은 판정식 ----
// 바꾸면 test/drift.test.mjs가 훅 원문과의 차이를 알려 준다.
export const SECTION_RE = /^##\s+/;
export const PHASE_ANY_RE = /^##\s+Phase\s+(\d+)/;
export const PHASE_FULL_RE = /^##\s+Phase\s+(\d+)\s*[—-]\s*(.+?)\s*·\s*태그:\s*(.+?)\s*·\s*의존:\s*(.+?)\s*$/;
export const RECORD_HEADER = /^검증 기록\s*$/;
export const USER_INPUT_RE = /^-\s*USER-INPUT\b/;
export const FAIL_RE = /^-\s*FAIL\b/;
export const PASS_RE = /^-\s*PASS\b/;
export const LEDGER_HEADER = /^##\s+결정 대장/;
export const LEDGER_LINE = /^-\s*\[(USER·위임|USER|AI·비가역|AI)\]/;

export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
export const isoKst = value => new Date(+new Date(value) + 9 * 3600000).toISOString().replace('Z', '+09:00');
const clip = (s, n) => s == null ? null : (Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s);

// plan-gate처럼 \r?\n으로 나눈다. 마지막 개행 뒤의 빈 줄은 세지 않는다.
// BOM은 코드 포인트로 판정한다. 원문에 보이지 않는 글자를 두지 않는다.
export const stripBom = text => text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
export function lines(text) {
  if (!text) return [];
  const result = stripBom(text).split(/\r?\n/);
  if (result.at(-1) === '') result.pop();
  return result;
}

// 계획 문서 여러 개를 plan-gate처럼 이어 붙이되, 줄마다 출처 파일과 줄 번호를 남긴다.
export function planLines(parts) {
  const out = [];
  for (const p of parts) lines(p.text).forEach((text, i) => out.push({ text, line: i + 1, file: p.file }));
  return out;
}

export function sections(entries) {
  const result = [];
  let cur = null;
  for (const e of entries) {
    if (SECTION_RE.test(e.text)) { cur = { header: e.text, file: e.file, line: e.line, body: [] }; result.push(cur); }
    else if (cur) cur.body.push(e);
  }
  return result;
}

// 계획 문서 첫머리: 「# 」 제목과 「- 마일스톤: … · 상태: …」 줄
export function parsePlanHeader(text) {
  const all = lines(text);
  const end = all.findIndex(l => SECTION_RE.test(l));
  const head = end < 0 ? all : all.slice(0, end);
  const ti = head.findIndex(l => /^#\s+/.test(l));
  if (ti < 0) throw new Error('계획 문서 첫머리에서 「# 」 제목 줄을 찾지 못했어요.');
  const si = head.findIndex(l => /^-\s*마일스톤\s*:/.test(l));
  let statusLine = null, status = null;
  if (si >= 0) {
    statusLine = head[si].replace(/^-\s*/, '').trim();
    const parts = statusLine.split(/\s+·\s+/);
    const k = parts.findIndex(s => /^상태\s*:/.test(s));
    if (k >= 0) status = parts.slice(k).join(' · ').replace(/^상태\s*:\s*/, '').trim();
  }
  return { title: head[ti].replace(/^#\s+/, '').trim(), titleLine: ti + 1, statusLine, status, statusLineNo: si >= 0 ? si + 1 : null };
}

// 표 한 줄을 칸으로 나눈다. 「\|」는 칸 구분이 아니다.
export function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return s.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
}

// 「Phase 흐름」 절의 첫 표: Phase 번호, 이름(태그 앞), 태그, 목표
export function parsePhaseFlow(text) {
  const all = lines(text);
  const start = all.findIndex(l => /^##\s+Phase 흐름\s*$/.test(l));
  if (start < 0) throw new Error('계획 문서에서 「Phase 흐름」 절을 찾지 못했어요.');
  const body = [];
  for (let i = start + 1; i < all.length && !SECTION_RE.test(all[i]); i++) body.push({ text: all[i], line: i + 1 });
  const t0 = body.findIndex(l => /^\s*\|/.test(l.text));
  if (t0 < 0) throw new Error('「Phase 흐름」 절에서 표를 찾지 못했어요.');
  const rows = [];
  for (let k = t0; k < body.length && /^\s*\|/.test(body[k].text); k++) rows.push(body[k]);
  const header = splitRow(rows[0].text);
  if (!rows[1] || !splitRow(rows[1].text).every(c => /^:?-{3,}:?$/.test(c))) throw new Error('「Phase 흐름」 표의 구분 줄을 읽지 못했어요.');
  const col = re => header.findIndex(h => re.test(h));
  const cPhase = col(/^Phase$/i), cName = col(/이름/), cGoal = col(/목표/);
  if (cPhase < 0 || cName < 0 || cGoal < 0) throw new Error('「Phase 흐름」 표에서 Phase·이름·목표 열을 찾지 못했어요.');
  return rows.slice(2).flatMap(r => {
    const cells = splitRow(r.text);
    if (!/^\d+$/.test(cells[cPhase] || '')) return [];
    const nameCell = cells[cName] || '';
    return [{ num: Number(cells[cPhase]), name: nameCell.replace(/\s*·\s*`.*$/, '').trim(),
      tags: [...nameCell.matchAll(/`([^`]+)`/g)].map(m => m[1]), goal: cells[cGoal] || '', line: r.line }];
  });
}

function recordLine(marker, l) {
  const rest = l.text.replace(/^-\s*\S+\s*/, '');
  const m = /^(\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)\s*(?:—\s*)?(.*)$/.exec(rest);
  return { marker, at: m ? m[1] : null, text: m ? m[2] : rest, file: l.file, line: l.line };
}

// Phase 절마다 「검증 기록」 줄을 센다. 집계 범위와 USER-INPUT 기준점 이동은 plan-gate 판정 ②와 같다.
export function parsePhaseRecords(entries) {
  return sections(entries).flatMap(s => {
    const m = PHASE_ANY_RE.exec(s.header);
    if (!m) return [];
    const full = PHASE_FULL_RE.exec(s.header);
    const goal = s.body.find(l => /^\*\*목표\*\*\s*:/.test(l.text));
    const ri = s.body.findIndex(l => RECORD_HEADER.test(l.text));
    const record = { section: ri >= 0, line: ri >= 0 ? s.body[ri].line : null, pass: 0, fail: 0, userInput: 0, failSinceUserInput: 0, last: null };
    if (ri >= 0) for (const l of s.body.slice(ri + 1)) {
      if (USER_INPUT_RE.test(l.text)) { record.userInput++; record.failSinceUserInput = 0; record.last = recordLine('USER-INPUT', l); }
      else if (FAIL_RE.test(l.text)) { record.fail++; record.failSinceUserInput++; record.last = recordLine('FAIL', l); }
      else if (PASS_RE.test(l.text)) { record.pass++; record.last = recordLine('PASS', l); }
    }
    return [{ num: Number(m[1]), name: full ? full[2] : null, tags: full ? [...full[3].matchAll(/`([^`]+)`/g)].map(x => x[1]) : [],
      deps: full ? full[4] : null, goal: goal ? goal.text.replace(/^\*\*목표\*\*\s*:\s*/, '') : null, file: s.file, line: s.line, record }];
  });
}

// 결정 대장: plan-gate 판정 ③과 같은 출처 태그 집계와 주도권 게이트 판정
export function parseLedger(entries) {
  const sec = sections(entries).find(s => LEDGER_HEADER.test(s.header));
  if (!sec) throw new Error('계획 문서에서 「결정 대장」 절을 찾지 못했어요. plan-gate는 이 계획을 반려해요.');
  const tally = { USER: 0, 'USER·위임': 0, AI: 0, 'AI·비가역': 0 }, aiLines = [];
  for (const l of sec.body) {
    const m = LEDGER_LINE.exec(l.text);
    if (!m) continue;
    tally[m[1]]++;
    if (m[1] === 'AI' || m[1] === 'AI·비가역') aiLines.push({ tag: m[1], text: l.text.replace(/^-\s*\[[^\]]+\]\s*/, ''), file: l.file, line: l.line });
  }
  const userSide = tally.USER + tally['USER·위임'];
  const gate = tally['AI·비가역'] >= 1 ? 'immediate' : tally.AI > userSide ? 'ask' : 'clear';
  return { file: sec.file, line: sec.line, tally, userSide, gate, aiLines };
}

const SUMMARY_KEYS = { '스탬프': 'stamp', '바뀐 것': 'changed', '내린 결정': 'decided', '봐야 할 것': 'watch' };
// work-pin: 「좌표」 절과 「마감 요약」 절의 「- 이름: 내용」 줄
export function parsePin(text) {
  const all = lines(text);
  function block(re) {
    const s = all.findIndex(l => re.test(l));
    if (s < 0) return null;
    const items = [];
    for (let i = s + 1; i < all.length && !/^#{1,2}\s/.test(all[i]); i++) {
      const raw = all[i];
      const m = /^-\s+([^:：]{1,40}?)\s*[:：]\s*(.*)$/.exec(raw);
      if (m) items.push({ label: m[1].trim(), text: m[2].trim(), line: i + 1 });
      else if (/^-\s+/.test(raw)) items.push({ label: null, text: raw.replace(/^-\s+/, '').trim(), line: i + 1 });
      else if (/^\s+\S/.test(raw) && items.length) items.at(-1).text += ' ' + raw.trim();
    }
    for (const it of items) it.parts = splitSentences(it.text);
    return { header: all[s].replace(/^##\s+/, ''), line: s + 1, items };
  }
  const coord = block(/^##\s+좌표\s*$/), summary = block(/^##\s+마감 요약/);
  let fields = null;
  if (summary) {
    fields = { stamp: null, changed: null, decided: null, watch: null };
    for (const it of summary.items) { const k = SUMMARY_KEYS[it.label]; if (k && !fields[k]) fields[k] = { text: it.text, line: it.line, parts: it.parts }; }
  }
  return { coord, summary: summary && { header: summary.header, line: summary.line, ...fields,
    missing: Object.entries(SUMMARY_KEYS).filter(([, k]) => !fields[k]).map(([label]) => label) } };
}

// Backlog: 「N. **제목**」 번호 항목을 「## 」 절별로 모은다. 코드 펜스 안은 읽지 않는다.
export function parseBacklog(text) {
  const out = [];
  let section = null, fence = false;
  lines(text).forEach((raw, i) => {
    if (/^\s*(`{3,}|~{3,})/.test(raw)) { fence = !fence; return; }
    if (fence) return;
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h) { section = { name: h[1], line: i + 1, items: [] }; out.push(section); return; }
    const m = /^(\d+)\.\s+\*\*(.+?)\*\*/.exec(raw);
    if (!m) return;
    if (!section) { section = { name: '절 밖', line: null, items: [] }; out.push(section); }
    section.items.push({ num: Number(m[1]), title: m[2].trim(), line: i + 1 });
  });
  const kept = out.filter(s => s.items.length);
  return { count: kept.reduce((n, s) => n + s.items.length, 0), sections: kept };
}

// hook-log 꼬리: 잘린 첫 줄은 버리고, 마지막 limit줄만 JSON으로 읽는다
export function parseHookTail(text, { truncated = false, limit = RULES.hookTailLines } = {}) {
  let raw = lines(text);
  if (truncated) raw = raw.slice(1);
  const window = raw.filter(l => l.trim()).slice(-limit);
  const seen = new Map(), entries = [];
  let bad = 0;
  for (const l of window) {
    let j;
    try { j = JSON.parse(l); } catch { bad++; continue; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) { bad++; continue; }
    const n = (seen.get(l) || 0) + 1; seen.set(l, n);
    const str = v => v == null ? null : String(v);
    const session = str(j.session);
    entries.push({ key: hash([l, n]), at: str(j.ts), hook: str(j.hook), verdict: str(j.verdict), rule: str(j.rule),
      reason: clip(str(j.reason), 400), tool: str(j.tool), detail: clip(str(j.cmd ?? j.target ?? j.file ?? j.evidence?.file), 160),
      event: str(j.event), session, sessionShort: shortSession(session), role: str(j.role), sub: j.agent_id != null,
      deny: RULES.denyVerdicts.includes(j.verdict) });
  }
  // 세션별 집계: 이 창 안에서 줄 수, 막힌 판정 수, 처음·마지막 시각. 순서는 마지막 활동이 최근인 것부터다.
  const by = new Map();
  for (const e of entries) {
    const id = e.session ?? '';
    const s = by.get(id) || { id: e.session, short: e.sessionShort, lines: 0, deny: 0, firstAt: e.at, lastAt: e.at, roles: [] };
    s.lines++; if (e.deny) s.deny++; s.lastAt = e.at;
    if (e.role && !s.roles.includes(e.role)) s.roles.push(e.role);
    by.set(id, s);
  }
  const sessions = [...by.values()].reverse().sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return { lines: window.length, bad, entries, sessions };
}
// 세션 표기: UUID 꼴이면 앞 네 글자, 아니면 앞 14자. 값이 없으면 null이다.
export function shortSession(id) {
  if (!id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 4) : (Array.from(id).length > 14 ? Array.from(id).slice(0, 14).join('') + '…' : id);
}

// Phase 흐름 판정. 값은 전부 원문에서 온다: 검증 기록 줄 수, git log 제목의 「<마일스톤>-P<번호>」 토큰, pin 「상태」 문장.
//  - 멈춤: 마지막 USER-INPUT 이후 FAIL이 한도 이상(헌법 7조). 다른 판정보다 먼저다.
//  - 근거 ① commit: 커밋 토큰이 있는 Phase는 완료, 토큰이 없는 첫 Phase가 현재, 그 뒤는 대기.
//  - 근거 ② pin: git을 못 읽었거나 마일스톤 번호가 없으면 pin 「상태」 문장의 Phase N이 현재, 그 앞은 완료.
//  - 근거 ③ record: 둘 다 없으면 검증 기록 줄이 있는 마지막 Phase가 현재(없으면 첫 Phase).
export function judgeFlow(items, { milestoneId = null, commits = null, pinPhase = null } = {}) {
  const token = n => new RegExp(`(^|[^0-9A-Za-z])${milestoneId}-P${n}(?![0-9])`, 'i');
  const commitOf = n => (milestoneId && commits) ? commits.find(c => token(n).test(c.subject)) || null : null;
  const withCommit = items.map(p => ({ ...p, commit: commitOf(p.num) }));
  const total = p => p.record ? p.record.pass + p.record.fail + p.record.userInput : 0;
  let basis, current = null;
  if (milestoneId && commits) { basis = 'commit'; current = withCommit.find(p => !p.commit)?.num ?? null; }
  else if (pinPhase != null && items.some(p => p.num === pinPhase)) { basis = 'pin'; current = pinPhase; }
  else { basis = 'record'; current = (withCommit.filter(p => total(p) > 0).at(-1) ?? withCommit[0])?.num ?? null; }
  const out = withCommit.map(p => ({ ...p,
    flow: p.state === 'stopped' ? 'stopped' : basis === 'commit' ? (p.commit ? 'done' : p.num === current ? 'current' : 'waiting')
      : current == null ? 'waiting' : p.num < current ? 'done' : p.num === current ? 'current' : 'waiting' }));
  return { items: out, current, basis };
}

// git status --porcelain=v1 -z
export function parseStatus(out) {
  const parts = out.split('\0'), items = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const code = p.slice(0, 2), item = { code, path: p.slice(3), from: null };
    if (/[RC]/.test(code)) item.from = parts[++i] || null;
    items.push(item);
  }
  return items;
}
