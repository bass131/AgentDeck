#!/usr/bin/env node
// 응답 표피 검사 훅 (Stop) — M02 Phase 4 Step 3 신설, 검수 발견 15번의 실물.
//
// 무엇을 하는가: 방금 끝난 답변의 **표피**만 기계 판정해 피드백을 남긴다. 차단하지 않는다 —
//   항상 exit 0이고 `decision` 필드를 내지 않는다 (41_line-limit의 block과 다른 축이다).
//   차단형 승격은 몇 세션 실측 뒤 별도 사용자 판정이며 M02 범위 밖이다 ([USER] 2026-08-10).
//
// 무엇을 못 하는가 (거짓 안심 방지): 응답 레지스터의 핵심 층 — 정보 밀도, 한 문장에 담긴 명제 수,
//   작업 보고와 결정 요청의 분리 — 은 기계 판정 불능이다. 이 훅이 통과를 냈다는 것은 표피 넷이
//   안 걸렸다는 뜻일 뿐, 글이 읽기 쉽다는 뜻이 아니다. 발화 문구에도 이 한계를 함께 적는다.
//
// 상수·판정 계약의 소유자는 계획이다 (M02 04_Phase_4.md Step 2, 결정 대장 [USER] 2026-08-10):
//   대상 = transcript JSONL의 마지막 assistant 메시지 text 블록을 단일 `\n` 하나로 이어 붙인 본문.
//     결합자를 `\n`으로 고정하는 이유는 문장 경계가 줄바꿈을 경계로 쓰기 때문이다 — 빈 문자열로
//     붙이면 서로 다른 블록의 괄호·화살표가 한 문장으로 합산된다.
//   제외 = 코드 펜스·백틱 스팬 내부, Markdown 링크 목적지(`](…)`의 괄호 안) — 전 표피 공통.
//   표피 넷 = 원문자 라틴 1회 이상 · 문장당 균형 괄호 2쌍 이상 · 문장당 화살표 3개 이상 · 문장 200자 초과.
//   로그 = 발화·통과·판정불가 모든 실행이 여섯 필드 한 줄 (hook·event·session·agent_id·ts·verdict).
//   입력 오류 3형 = fail-open(exit 0) + verdict `판정불가` + 사유.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');

const CIRCLED_LATIN = /[Ⓐ-ⓩ]/g; // ⓐ·Ⓐ 류 — 원 숫자(①–⑳)는 목록 관행이라 제외한다
const ARROW = '→';                   // →
const PAREN_LIMIT = 2;                    // 문장당 균형 괄호 쌍 상한 (이상이면 발화)
const ARROW_LIMIT = 3;                    // 문장당 화살표 상한 (이상이면 발화)
const LEN_LIMIT = 200;                    // 문장 길이 상한 (초과면 발화)

function ts() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

// ── 제외 구간 마스킹 ────────────────────────────────────────────────────
// 제외 문자는 통째로 버리되 줄바꿈은 남긴다 — 줄바꿈이 문장 경계라, 지우면 앞뒤 문장이 합쳐진다.
function maskExcluded(text) {
  const drop = new Array(text.length).fill(false);
  const lines = [];
  let at = 0;
  for (const l of text.split('\n')) { lines.push({ start: at, text: l }); at += l.length + 1; }
  // ① 코드 펜스 — 여는 줄부터 닫는 줄까지 (닫히지 않으면 끝까지)
  let inFence = false;
  for (const ln of lines) {
    const isFence = /^\s*(?:```|~~~)/.test(ln.text);
    if (isFence || inFence) for (let i = 0; i < ln.text.length; i++) drop[ln.start + i] = true;
    if (isFence) inFence = !inFence;
  }
  // ② 백틱 스팬 — 펜스 밖의 한 줄 안에서 같은 길이의 백틱 런끼리 짝짓는다
  for (const ln of lines) {
    if (drop[ln.start] && ln.text.length) continue; // 펜스 줄은 이미 전부 제외됐다
    const s = ln.text;
    let i = 0;
    while (i < s.length) {
      if (s[i] !== '`') { i++; continue; }
      let n = 0; while (s[i + n] === '`') n++;
      const open = i, run = '`'.repeat(n);
      const close = s.indexOf(run, open + n);
      if (close === -1) { i = open + n; continue; }
      for (let k = open; k < close + n; k++) drop[ln.start + k] = true;
      i = close + n;
    }
  }
  // ③ Markdown 링크 목적지 — `](…)`의 괄호와 그 안 (괄호 자체를 버려야 링크가 쌍으로 안 세어진다)
  const LINK = /\]\(([^()\n]*)\)/g;
  let m;
  while ((m = LINK.exec(text)) !== null) {
    const from = m.index + 1; // `]` 다음의 `(`
    for (let k = from; k < m.index + m[0].length; k++) drop[k] = true;
  }
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') out += '\n';
    else if (!drop[i]) out += text[i];
  }
  return out;
}

// ── 문장 경계 ───────────────────────────────────────────────────────────
// 닫는 자리는 셋이다 — 종결부호(.·!·?·…) 뒤 공백·줄끝, 줄바꿈, Markdown 구조 경계(목록 머리·표제·표 행).
function splitTerminators(s) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    cur += s[i];
    if ('.!?…'.indexOf(s[i]) === -1) continue;
    const next = s[i + 1];
    if (next === undefined || /\s/.test(next)) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}
function sentences(text) {
  const out = [];
  for (const line of text.split('\n')) {
    // 표 행은 셀 경계로도 닫는다 — 한 행의 두 셀에 든 괄호가 한 문장으로 합산되지 않게 한다
    const units = /^\s*\|/.test(line) ? line.split('|') : [line];
    for (const unit of units) {
      // 목록 항목 머리·표제 마커는 문장 시작 경계다 — 마커 자체는 문장 본문에서 뺀다
      const body = unit.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/, '');
      for (const piece of splitTerminators(body)) {
        const t = piece.trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}
// 균형 잡힌 쌍만 센다 — 여는 괄호 단독은 0쌍이고, 중첩 `(가 (나))`는 2쌍이다
function balancedPairs(s) {
  let depth = 0, pairs = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) { depth--; pairs++; }
  }
  return pairs;
}
function countChar(s, ch) {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

// ── transcript 판독 ─────────────────────────────────────────────────────
// 돌려주는 값은 { text } 또는 { error: { rule, reason } } 둘 중 하나다 (fail-open의 분기점).
function readLastAssistantText(tp) {
  if (!tp || typeof tp !== 'string') return { error: { rule: 'transcript-부재', reason: 'Stop 입력에 transcript_path가 없다 — 검사 대상 본문을 특정할 수 없다' } };
  let raw;
  try { raw = fs.readFileSync(tp, 'utf8'); } catch (e) {
    return { error: { rule: 'transcript-부재', reason: `transcript를 읽지 못했다 — ${String((e && e.message) || e).slice(0, 120)}` } };
  }
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  let parsed = 0, last = null;
  for (const l of lines) {
    let o;
    try { o = JSON.parse(l); } catch (e) { continue; }
    parsed++;
    if (!o || typeof o !== 'object') continue;
    const msg = o.message && typeof o.message === 'object' ? o.message : o;
    const role = msg.role || o.type;
    if (role !== 'assistant' || !Array.isArray(msg.content)) continue;
    last = msg;
  }
  if (parsed === 0) return { error: { rule: 'jsonl-파싱-실패', reason: `transcript ${lines.length}줄 가운데 JSON으로 읽히는 줄이 하나도 없다` } };
  if (!last) return { error: { rule: 'assistant-text-부재', reason: `transcript에 content 배열을 가진 assistant 메시지가 없다 (판독 줄 ${parsed}건)` } };
  const blocks = last.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string');
  if (blocks.length === 0) return { error: { rule: 'assistant-text-부재', reason: '마지막 assistant 메시지에 text 블록이 없다 (tool_use·thinking만 있다)' } };
  // 결합자는 단일 `\n` 하나다 — 계획이 고정한 상수 ([USER] 2026-08-10)
  const text = blocks.map((b) => b.text).join('\n');
  if (text.trim() === '') return { error: { rule: 'assistant-text-부재', reason: '마지막 assistant text 블록이 전부 빈 문자열이다' } };
  return { text };
}

// ── 본체 ────────────────────────────────────────────────────────────────
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음 = 아래 판정불가 */ }
const base = {
  hook: 'surface-probe',
  event: input.hook_event_name || 'Stop',
  session: input.session_id || null,
  agent_id: input.agent_id || null,
};

function emit(verdict, rule, reason, evidence) {
  const line = { ts: ts(), ...base, verdict, rule, reason };
  if (evidence) line.evidence = evidence;
  try {
    fs.mkdirSync(GATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(line) + '\n');
  } catch (e) { /* 로그 실패도 종료를 막지 않는다 — 이 훅은 차단하지 않는다 */ }
}

try {
  const read = readLastAssistantText(input.transcript_path);
  if (read.error) {
    emit('판정불가', read.error.rule, `${read.error.reason} — 검사를 열고 통과시킨다 (fail-open)`);
    process.exit(0);
  }
  const body = maskExcluded(read.text);
  const list = sentences(body);
  const circled = (body.match(CIRCLED_LATIN) || []).length;
  const parens = list.filter((s) => balancedPairs(s) >= PAREN_LIMIT);
  const arrows = list.filter((s) => countChar(s, ARROW) >= ARROW_LIMIT);
  const long = list.filter((s) => s.length > LEN_LIMIT);
  const evidence = {
    sentences: list.length, circled, parens: parens.length, arrows: arrows.length, long: long.length,
    limits: { circled: 1, parens: PAREN_LIMIT, arrows: ARROW_LIMIT, len: LEN_LIMIT },
  };
  const hits = [];
  if (circled >= 1) hits.push(`임시 기호 ${circled}건 (원문자 라틴 — 대상의 이름을 그대로 반복해 부르라)`);
  if (parens.length) hits.push(`괄호 ${PAREN_LIMIT}쌍 이상 문장 ${parens.length}건`);
  if (arrows.length) hits.push(`화살표 ${ARROW_LIMIT}개 이상 문장 ${arrows.length}건`);
  if (long.length) hits.push(`${LEN_LIMIT}자 초과 문장 ${long.length}건 (최장 ${Math.max(...long.map((s) => s.length))}자)`);

  if (hits.length === 0) {
    emit('통과', '표피-무발화', `표피 넷 무발화 — 문장 ${list.length}개, 원문자 0건`, evidence);
    process.exit(0);
  }
  const worst = (parens[0] || arrows[0] || long[0] || '').slice(0, 80);
  const reason = `표피 ${hits.length}종 발화 — ${hits.join(' · ')}`;
  evidence.sample = worst;
  emit('발화', '표피-발화', reason, evidence);
  const msg = `[표피 훅] ${reason}.${worst ? ` 예: "${worst}…"` : ''} 이 검사는 표피만 본다 — 핵심 층인 정보 밀도·한 문장의 명제 수·작업 보고와 결정 요청의 분리는 기계 판정 불능이라 이 검사가 대신하지 못한다. 차단하지 않는 피드백이니 다음 답변에서 스스로 줄여라.`;
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
} catch (e) {
  emit('판정불가', '훅-크래시', `표피 검사 중 예외 — ${String((e && e.message) || e).slice(0, 160)}`);
  process.exit(0);
}
