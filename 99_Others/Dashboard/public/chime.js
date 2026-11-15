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
function stripHand(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const stop = list.find(h => h.level === 'stop');
  return { level: stop ? 'stop' : 'todo', say: String((stop ?? list[0]).say ?? ''), more: list.length - 1 };
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
})();
