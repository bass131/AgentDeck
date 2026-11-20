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

// ---- 병합 카드의 화면 쪽 판단 (M07 G9). 전역 AgentDeckMerge. 시험은 test/merge-view.test.mjs, 설명은 docs/병합.md ----
// 「꼭 볼 것」 펼침 게이트는 화면 쪽이다. 주소를 직접 부르면 건너뛰므로 사람 확인 창이 같은 파일 이름을 한 번 더 보인다.

// 「내 손이 필요한 일」의 병합 대기 항목이 든 PR 번호. 서버(lib/progress.mjs judgeHand)가 goal 머리말에서 읽어 pr 칸에 싣는다. 문장에서 뽑지 않는다.
function pendingPr(hand) {
  const h = (hand || []).find(x => x && x.id === 'merge');
  return h && Number.isInteger(h.pr) && h.pr > 0 ? h.pr : null;
}
// 펼친 기록의 키: PR·머리 SHA·경로. 다른 SHA나 다른 PR에서 펼친 것은 세지 않는다.
const fileKey = (pr, sha, path) => JSON.stringify([pr, String(sha || '').toLowerCase(), path]);
// 「병합」 단추를 켤지. 서버 판정(canMerge)이 먼저고, 꼭 볼 것을 모두 펼쳐야 하고, 병합 중이거나 이미 보낸 SHA면 끈다.
function mergeGate(view, opened, { running = false, spent = false } = {}) {
  if (!view || !Array.isArray(view.mustSee)) return { ready: false, total: 0, left: 0, why: 'PR을 아직 읽지 않았어요' };
  const total = view.mustSee.length;
  const left = view.mustSee.filter(m => !(opened && opened.has(fileKey(view.number, view.headSha, m.path)))).length;
  let why = null;
  if (!view.canMerge) why = '병합 조건을 채우지 못했어요';
  else if (running) why = '병합을 진행하는 중이에요';
  else if (spent) why = '이 머리 SHA로는 이미 병합을 요청했어요. 다시 읽기를 눌러 주세요';
  else if (left) why = `꼭 볼 것 ${total}개 가운데 ${left}개를 아직 펼치지 않았어요`;
  return { ready: !why, total, left, why };
}
// diff 한 줄씩의 종류. 글은 그대로 두고 이스케이프는 페이지가 한다.
const patchRows = patch => typeof patch !== 'string' ? [] : patch.split('\n').map(text => ({
  kind: text.startsWith('@@') ? 'hunk' : text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : 'ctx', text }));
// 번호 입력: 숫자(앞의 #은 허용)만 받는다.
function parsePrInput(s) {
  const m = /^#?(\d{1,9})$/.exec(String(s ?? '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
const shortSha = sha => typeof sha === 'string' ? sha.slice(0, 7) : '';
// 필수 검사 결과 → 화면의 상태 모양(완료 초록 · 진행 파랑 · 멈춤 빨강 · 대기 회색)과 낱말
const CHECK = Object.freeze({ success: ['done', '성공'], pending: ['current', '대기 중'], failure: ['stopped', '실패'], missing: ['waiting', '결과 없음'] });
const checkState = result => { const c = CHECK[result] || ['waiting', '알 수 없음']; return { kind: c[0], word: c[1] }; };
// 병합 결과 줄: 병합됨만 초록이고, 나머지는 사용자가 볼 일(노랑)이다.
function resultLine(r) {
  if (r && r.status === 'merged') return { level: 'ok', text: `${r.message || '병합했어요'}${r.mergeSha ? ` (병합 커밋 ${shortSha(r.mergeSha)})` : ''}` };
  return { level: 'todo', text: (r && r.message) || (r && r.reason) || '결과를 읽지 못했어요. 다시 읽기로 확인해 주세요' };
}

// ── 열린 PR 목록 (M07 G11) ── 목록은 요약만 보인다. 필수 검사·「꼭 볼 것」·병합 단추는 고른 PR 하나의 카드에서만 판정한다.
// 항목이 이보다 많으면 목록이 자기 안에서 세로 스크롤한다(높이는 styles.css의 항목 3개 높이).
const LIST_SCROLL_AFTER = 3;
// 표시할 항목: 카드에 연 PR이 먼저다(목록과 카드가 어긋나지 않게). 카드가 비었으면 goal의 병합 대기 PR이 처음 고른 항목이다. 목록에 없으면 null.
function pickedPr(items, cardPr, pendingPr) {
  const nums = new Set((items || []).map(i => i && i.number));
  if (cardPr != null) return nums.has(cardPr) ? cardPr : null;
  return pendingPr != null && nums.has(pendingPr) ? pendingPr : null;
}
// 목록 HTML. 서버가 준 글(제목·브랜치·작성자)은 남이 정한 글이라 페이지의 이스케이프 함수(esc)로만 넣는다. 없으면 그리지 않는다.
// 항목은 단추라 키보드로 고를 수 있다. 고른 항목은 aria-current와 is-picked로 남는다. SHA는 짧게 보이고 전체는 title에만 둔다.
function prListHtml(items, { picked = null, esc } = {}) {
  if (typeof esc !== 'function') throw new TypeError('prListHtml needs the page escaper');
  const list = (items || []).filter(i => i && Number.isInteger(i.number));
  if (!list.length) return '<p class="send-hint mg-list-empty">열린 PR이 없어요.</p>';
  const rows = list.map(i => {
    const on = i.number === picked;
    const tip = `#${i.number} ${i.title || ''} · ${i.baseRef} ← ${i.headRef} · 머리 SHA ${i.sha}${i.author ? ` · 작성자 ${i.author}` : ''}${i.updatedAt ? ` · 갱신 ${i.updatedAt}` : ''}`;
    return `<li><button type="button" class="mg-row${on ? ' is-picked' : ''}" data-merge-pick="${esc(i.number)}"${on ? ' aria-current="true"' : ''} title="${esc(tip)}">`
      + `<span class="mg-row-top"><b class="dec-n">#${esc(i.number)}</b><span class="mg-row-t">${i.title ? esc(i.title) : '(제목 없음)'}</span>${i.draft ? '<span class="lz mg-draft">초안</span>' : ''}</span>`
      + `<span class="mg-row-meta"><code class="inline mg-row-sha">${esc(shortSha(i.sha))}</code><span class="mg-row-br"><code class="inline">${esc(i.baseRef)}</code> ← <code class="inline">${esc(i.headRef)}</code></span></span></button></li>`;
  }).join('');
  return `<ul class="mg-list${list.length > LIST_SCROLL_AFTER ? ' is-scroll' : ''}" aria-label="열린 PR 목록">${rows}</ul>`;
}

// ── 닫힌 PR 정리 (M07 G15) ── 카드는 loadMerge에서만 새로 읽혀, 다른 곳에서 병합된 PR이 옛 카드로 남았다.
// 'drop': 자동으로 연 카드인데 goal이 더는 그 PR을 기다리지 않는다. 'reread': 열린 카드인데 새로 읽은 온전한 목록에 없다(다른 곳에서 병합·닫힘일 수 있다).
// 사람이 번호로 연 카드는 내리지 않는다. 확인 창이 떠 있는 동안은 아무것도 바꾸지 않는다.
function cardFate({ cardPr = null, manual = false, pending = null, running = false, list = null, open = true } = {}) {
  if (cardPr == null || running) return 'keep';
  if (!manual && pending !== cardPr) return 'drop';
  if (open && list && list.ok && !list.more && !(list.items || []).some(i => i && i.number === cardPr)) return 'reread';
  return 'keep';
}
// 닫힌 PR 카드의 한 줄. 열린 PR이면 null.
function closedLine(view) {
  if (!view || view.state === 'open') return null;
  return `#${view.number} PR은 ${view.merged ? '병합됐어요' : '병합 없이 닫혔어요'}. 할 일이 없어 카드를 줄였어요.`;
}

// 「내 손이 필요한 일」의 병합 대기 줄을 병합 카드가 GitHub에서 읽은 같은 PR에 맞춘다(M05 Backlog 61). goal 문서 머리말은 늦게 바뀐다.
// 병합됐거나 닫혔으면 줄을 빼고 note 한 줄만 남기고(알림음·배지에서도 빠진다), 필수 검사 hard-gates가 실패면 빨강의 새 사실로 바꾼다.
const REQUIRED_CHECK = 'hard-gates';
function mergeHand(hand, view) {
  const list = (hand || []).filter(Boolean), pr = pendingPr(list);
  if (!pr || !view || view.number !== pr) return { hand: list, note: null };
  if (view.state !== 'open') {
    const note = view.merged ? `PR ${pr}은 병합됐어요. goal 문서 갱신만 남았어요.` : `PR ${pr}은 병합 없이 닫혔어요. goal 문서의 「병합 대기」를 고쳐야 해요.`;
    return { hand: list.filter(h => h.id !== 'merge'), note };
  }
  const red = (view.checks || []).some(c => c && c.name === REQUIRED_CHECK && c.result === 'failure');
  if (!red) return { hand: list, note: null };
  return { hand: list.map(h => h.id !== 'merge' ? h : { ...h, level: 'stop', key: `${h.key}:ci-red`,
    say: `PR ${pr}의 필수 검사 ${REQUIRED_CHECK}가 실패했어요 — 병합할 수 없어요. 고친 커밋을 올려야 해요.` }), note: null };
}

globalThis.AgentDeckMerge = Object.freeze({ pendingPr, fileKey, mergeGate, patchRows, parsePrInput, shortSha, checkState, resultLine, LIST_SCROLL_AFTER, pickedPr, prListHtml, cardFate, closedLine, mergeHand });
})();
