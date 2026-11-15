// 「내 손이 필요한 일」 알림의 판단. app.js 「알림」 절이 쓰고, 설명은 docs/알림.md에 있다.
// 맨 끝 절은 화면 모양의 판단(전역 AgentDeckView, M05 H6)이다. 같은 이유(정적 파일 목록을 늘리지 않음)로 이 파일에 둔다.
// 화면 요소와 소리가 없는 순수 함수라서 Node 시험(test/chime.test.mjs)이 그대로 불러 쓴다.
// 본보기는 C:\Dev\DawnHolder_Dashboard 의 web/public/decision-sound.js 다.
// app.js가 classic script라서 이 파일도 import·export 없이 전역 AgentDeckChime 하나에만 붙는다.
//
// 울림: 지금 보이는 hand 항목(fresh 필터 뒤)의 키 가운데 기억에 없는 키만 울린다. 한 키는 한 번만 울린다.
// 기억: 페이지 저장소(app.js가 넘긴 localStorage)의 ad-dash-chimed 에 최근 200개. 새로고침해도 다시 울리지 않는다.
// 저장소가 없거나 막히면 열려 있는 동안만 기억한다. 기억이 전혀 없을 때(첫 방문) 첫 스냅샷에 이미 있던 항목은 울리지 않는다.
(() => {
'use strict';
const RUNG_KEY = 'ad-dash-chimed';
const RUNG_MAX = 200;
const QUIET_AFTER_MIN = 5;
const newest = ids => ids.slice(-RUNG_MAX);

// 보이는 항목의 알림 키. 키가 없는 항목은 울림 대상이 아니다.
const handKeys = items => [...new Set((items || []).map(h => h && h.key).filter(k => typeof k === 'string' && k))];

// 스냅샷 한 번의 걸음. rung은 기억한 키(기억이 없으면 null), shown은 지금 보이는 키. 지금 울릴 키와 기억할 키를 준다.
function chimeStep(rung, shown) {
  const keys = [...new Set(shown || [])];
  if (rung == null) return { ring: [], rung: newest(keys) };
  const known = new Set(rung);
  const ring = keys.filter(k => !known.has(k));
  return { ring, rung: ring.length ? newest([...rung, ...ring]) : rung };
}

// 저장소에 기억한 키. 없거나 읽을 수 없거나 키 목록이 아니면 null이다.
function readRung(storage) {
  try {
    const raw = storage?.getItem(RUNG_KEY);
    if (raw == null) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : null;
  } catch { return null; }
}
function writeRung(storage, ids) { try { storage?.setItem(RUNG_KEY, JSON.stringify(ids)); } catch {} }

// 페이지의 기억. see(keys)가 지금 울릴 키를 준다. 저장소는 매번 다시 읽어, 같은 현황판의 다른 탭이 울린 키도 울린 것으로 친다.
// 빈 목록도 기억으로 남긴다. 그래야 빈 첫 스냅샷 뒤의 첫 항목이 「첫 스냅샷」으로 잘못 묻히지 않는다.
function createChimeMemory(storage) {
  let mine = null;
  return {
    see(keys) {
      const stored = readRung(storage);
      const rung = mine == null && stored == null ? null : [...new Set([...(stored ?? []), ...(mine ?? [])])];
      const step = chimeStep(rung, keys);
      if (rung == null || step.ring.length) writeRung(storage, step.rung);
      mine = step.rung;
      return step.ring;
    },
  };
}

// 탭 제목 배지. 보이는 항목이 N개면 「(N) 」, 그중 멈춤(level stop)이 있으면 「(!N) 」, 없으면 원래 제목이다.
function badgeTitle(base, items) {
  const n = (items || []).length;
  if (!n) return base;
  return `(${items.some(h => h && h.level === 'stop') ? '!' : ''}${n}) ${base}`;
}

// 응답 마침 뒤 조용한 분 수. quiet는 서버의 summary.activity.quiet({ at, after })다.
// after분(기본 5분)을 넘게 지났을 때만 지난 분 수를 준다. 꼭 after분이거나 그 전이면 null이다.
function quietMinutes(quiet, now) {
  const t = Date.parse(quiet?.at ?? '');
  if (!Number.isFinite(t)) return null;
  const after = Number.isFinite(quiet.after) ? quiet.after : QUIET_AFTER_MIN, gone = now - t;
  return gone > after * 60000 ? Math.floor(gone / 60000) : null;
}

// 알림음 상태 하나(on 재생됨 · blocked 막힘 · pending 판정 중 · unsupported Web Audio 없음)가 두 곳을 정한다.
// soundMark는 관찰 표지 data-chime-blocked 값이고(H4와 같은 뜻), soundBadge는 「내 손이 필요한 일」 머리 아래 작은 표시다.
// pending이나 모르는 값이면 soundBadge는 null이다. 화면은 보이던 표시를 그대로 두어, 깜빡이지 않고 확인 전에 「켜짐」이라 쓰지 않는다.
const SOUND_MARK = Object.freeze({ on: '0', blocked: '1', pending: 'pending', unsupported: 'unsupported' });
const SOUND_BADGE = Object.freeze({
  on: Object.freeze({ state: 'on', text: '알림음 켜짐', title: '새 항목이 들어오면 알림음이 한 번 나요' }),
  blocked: Object.freeze({ state: 'blocked', text: '알림음 막힘', title: '브라우저가 소리를 막았어요. 누르면 소리를 켜고 한 번 들려줘요' }),
  unsupported: Object.freeze({ state: 'unsupported', text: '알림음 없음', title: '이 브라우저는 Web Audio가 없어 소리 없이 지나가요. 탭 제목 배지는 그대로예요' }),
});
const soundMark = state => SOUND_MARK[state] ?? null;
const soundBadge = state => (SOUND_BADGE[state] ? { ...SOUND_BADGE[state] } : null);

// 상단 띠의 손 줄: 보이는 항목 가운데 멈춤(stop)이 있으면 그 첫 항목, 없으면 첫 항목의 문장과 나머지 수.
// to는 누르면 갈 곳이다 — 결정 항목은 「결정 요청」 카드(#decide), 나머지는 「내 손」 목록(#brief)이다(H8).
function stripHand(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const stop = list.find(h => h.level === 'stop'), pick = stop ?? list[0];
  const to = typeof pick.key === 'string' && pick.key.startsWith('decision:') ? '#decide' : '#brief';
  return { level: stop ? 'stop' : 'todo', say: String(pick.say ?? ''), more: list.length - 1, to };
}

globalThis.AgentDeckChime = Object.freeze({ RUNG_KEY, RUNG_MAX, QUIET_AFTER_MIN, handKeys, chimeStep, readRung, writeRung, createChimeMemory, badgeTitle, quietMinutes, soundMark, soundBadge, stripHand });

// ---- 화면 모양의 판단 (M05 H6). 알림과 따로 전역 AgentDeckView에 붙는다. 시험은 test/view.test.mjs ----
// 새 사실을 만들지 않는다. 서버가 이미 정한 손 수준(stop·todo·ok)과 단계 판정(stage·flow)을 색 하나로 모을 뿐이다.

// 「지금 하는 일」 카드의 상태. 멈춤 → 내 손 필요 → 완료 → 진행 중 순서이고, 시작 전·단계 사이는 회색 대기, 정할 수 없으면 확인 안 됨이다.
// 낱말은 화면에 이미 있는 것(단계 상태·띠의 손 줄)만 쓰고, glyph는 app.js의 모양 이름이다.
const TONE = Object.freeze({
  stop: { word: '멈춤', glyph: 'stopped' }, todo: { word: '내 손 필요', glyph: 'note' }, done: { word: '완료', glyph: 'done' },
  live: { word: '진행 중', glyph: 'current' }, rest: { word: '대기', glyph: 'waiting' }, unknown: { word: '확인 안 됨', glyph: 'unknown' },
});
function toneOf(phases) {
  const P = phases;
  if (!P || P.status !== 'ok' || !(P.items || []).length) return 'unknown';
  const flows = P.items.map(p => p && p.flow);
  if (flows.includes('stopped')) return 'stop';
  if (P.format === 'goal') {
    const stage = P.goal && P.goal.stage;
    return stage === 'stopped' ? 'stop' : stage === 'closed' || stage === 'all-done' ? 'done' : stage === 'running' ? 'live' : stage === 'empty' ? 'unknown' : 'rest';
  }
  return flows.includes('current') ? 'live' : flows.every(f => f === 'done') ? 'done' : 'rest';
}
function doingTone({ hand, phases } = {}) {
  const fromSteps = toneOf(phases);
  const tone = hand === 'stop' || fromSteps === 'stop' ? 'stop' : hand === 'todo' ? 'todo' : fromSteps;
  return { tone, ...TONE[tone] };
}

// 지금 goal의 단계 진척 링. 완료 몫과 지금 단계 하나의 몫을 원의 백분율(소수 한 자리)로 준다. 못 읽었거나 단계가 없으면 null(화면은 빗금).
const pct = (n, total) => Math.round((n / total) * 1000) / 10;
function stepRing(phases) {
  const items = phases && phases.status === 'ok' ? (phases.items || []).filter(Boolean) : [];
  if (!items.length) return null;
  const done = items.filter(p => p.flow === 'done').length, cur = items.find(p => p.flow === 'current' || p.flow === 'stopped');
  const now = cur ? 1 : 0;
  return { total: items.length, done, now, stopped: !!cur && cur.flow === 'stopped', donePct: pct(done, items.length), nowPct: pct(now, items.length) };
}

// 등장 동작 대상. entries는 [키, 상태] 목록이고 seen은 지난번에 기억한 Map(처음이면 null)이다.
// 처음 보는 키와 상태가 바뀐 키만 enter로 준다. 같은 스냅샷이 다시 와도(SSE 갱신) 아무것도 움직이지 않는다. 사라진 키는 잊는다.
function enterKeys(seen, entries) {
  const next = new Map(), enter = [];
  for (const [key, state] of entries || []) {
    if (!seen || !seen.has(key) || seen.get(key) !== state) enter.push(key);
    next.set(key, state);
  }
  return { enter, seen: next };
}

globalThis.AgentDeckView = Object.freeze({ doingTone, stepRing, enterKeys });

// ---- 결정 응답의 화면 쪽 판단 (M05 H7). 전역 AgentDeckDecide. 시험은 test/decide-view.test.mjs, 설명은 docs/결정-응답.md ----
// 문장은 짓지 않는다. 문장은 서버(lib/decisions.mjs composeAnswer)만 만들고, 페이지는 id와 키를 보내 받은 문장을 보이기만 한다.

// 기다리는 결정 하나가 「내 손이 필요한 일」 항목 하나다. 키는 decision:<id>라서 H4 알림 판단(새 키만 한 번, 첫 스냅샷 무음)과
// 탭 제목 배지에 그대로 얹힌다. 보드가 반쯤 쓰여 직전 목록을 쥐고 있을 때(failed + kept)도 그 목록을 센다.
function decisionHand(decisions) {
  const D = decisions;
  if (!D || !(D.status === 'ok' || (D.status === 'failed' && D.kept))) return [];
  return (D.items || []).filter(d => d && typeof d.id === 'string').map(d => ({
    key: 'decision:' + d.id, level: 'todo', id: d.id, say: `결정이 답을 기다려요: ${d.title}`, source: '결정 보드(결정 요청 카드에서 골라요)',
    ref: D.path ? { path: D.path } : null,
  }));
}
// 「내 손이 필요한 일」 목록에 보일 것(M05 H8, Backlog 70). 결정 항목(decision:)은 바로 위 결정 요청 카드가 보이므로 목록에서 빼고 수만 남긴다.
// 표시만 가른다 — 알림음·탭 제목 배지·띠의 손 줄·카드 색은 지금처럼 결정까지 센 전체 목록(handNow)을 쓴다.
// 결정만 있을 때 초록 「없음」이 나오지 않도록, 결정 요청을 가리키는 문장(note)을 여기서 정한다.
function handShown(items) {
  const list = (items || []).filter(Boolean);
  const facts = list.filter(h => !(typeof h.key === 'string' && h.key.startsWith('decision:')));
  const decisions = list.length - facts.length;
  const note = !decisions ? null : facts.length ? `그 밖에 결정 요청 ${decisions}건은 위 카드에서 골라요.` : `결정 요청 ${decisions}건이 답을 기다려요. 위 카드에서 골라요.`;
  return { facts, decisions, note };
}
// 서버 pickKeys와 같은 규칙: 선택지가 있으면 그 키들, 언제나 C(코멘트).
const pickable = d => [...((d && d.options) || []).map(o => o.key), 'C'];
// 새 목록에 맞춰 고른 답을 정리한다. 목록에서 빠진 결정의 고름과 코멘트는 버리고, 남은 결정에서 사라진 키는 이름을 남긴다(dropped).
// prev(앞 목록)를 주면, 같은 키라도 고른 선택지의 이름이나 효과 글이 바뀐 고름도 버리고 이름을 남긴다(changed).
// 사용자는 바뀌기 전의 글을 보고 골랐다. C(코멘트)는 선택지 글과 무관해 그대로 둔다.
// 받은 Map은 바꾸지 않는다. 서버는 이런 고름을 거절하므로, 몰래 두면 넣기가 화면과 다르게 실패한다.
function reconcilePicks(items, picks, comments, prev) {
  const byId = new Map((items || []).map(d => [d.id, d])), before = new Map((prev || []).map(d => [d && d.id, d]));
  const optionOf = (d, key) => ((d && d.options) || []).find(o => o.key === key);
  const nextPicks = new Map(), nextComments = new Map(), dropped = [], changed = [];
  for (const [id, key] of picks || []) {
    const d = byId.get(id);
    if (!d) continue;
    if (!pickable(d).includes(key)) { dropped.push(`${d.title} ${key}`); continue; }
    const was = key === 'C' ? null : optionOf(before.get(id), key), now = optionOf(d, key);
    if (was && now && (was.label !== now.label || (was.effect ?? '') !== (now.effect ?? ''))) { changed.push(`${d.title} ${key}`); continue; }
    nextPicks.set(id, key);
  }
  for (const [id, t] of comments || []) if (byId.has(id)) nextComments.set(id, t);
  return { picks: nextPicks, comments: nextComments, dropped, changed };
}
// 결정 카드를 다시 칠할지 정하는 키. 서명·읽기 상태·고름에 더해 상세 글과 보드 경고의 글까지 넣는다 —
// 상세 글이나 경고 글만 고쳐져도 화면이 옛 글을 보이지 않게 한다. 같은 목록과 고름이면 같은 키라서 입력 중인 칸을 건드리지 않는다.
const cardsKey = (D, picks) => JSON.stringify([D && D.sig, D && D.status, D && D.kept,
  ((D && D.warnings) || []).map(w => [w && w.where, w && w.what]), ((D && D.items) || []).map(d => [d && d.id, (d && d.detail) || []]), [...(picks || [])]]);
// 요청 본문: 페이지가 그린 목록의 서명과 id별 키·코멘트다. 문장은 서버가 만든다.
// send만 「보낼 문장」 칸에 보인 문장을 expect로 붙인다 — 서버는 그것을 넣지 않고 자기 문장과 같은지만 본다.
const answerBody = (sig, picks, comments, expect) => ({ sig, picks: Object.fromEntries(picks || []), comments: Object.fromEntries(comments || []), ...(typeof expect === 'string' ? { expect } : {}) });

globalThis.AgentDeckDecide = Object.freeze({ decisionHand, handShown, pickable, reconcilePicks, cardsKey, answerBody });
})();
