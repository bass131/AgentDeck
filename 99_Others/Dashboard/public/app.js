(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCHEMA = 'ad-dashboard/1', DAY = 864e5, KST = 9 * 36e5, WD = ['일', '월', '화', '수', '목', '금', '토'];
const BOOT = JSON.parse($('#bootstrap').textContent);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const EASE1 = getComputedStyle(document.documentElement).getPropertyValue('--ease-pop1').trim() || 'cubic-bezier(.85,.14,.29,.99)';
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- 움직임: 실제 사건(연결 신호·스냅샷 변경·사용자 조작)에만 묶는다 ---------- */
const moving = () => !reduceMotion.matches && !document.hidden;
const play = (el, frames, opts) => el && moving() && el.animate ? el.animate(frames, opts) : null;
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const num = (key, v) => `<span class="num" data-num="${esc(key)}">${esc(v)}</span>`;
const numsOf = root => new Map($$('[data-num]', root).map(e => [e.dataset.num, e.textContent]));
/* 같은 내용이면 다시 쓰지 않는다. 훅 기록이 초마다 들어와도 바뀌지 않은 영역은 깜빡이지 않고, 진행 중인 강조도 끊기지 않는다 */
const painted = new WeakMap();
function paint(el, html) {
  if (!el || painted.get(el) === html) return false;
  const prev = numsOf(el); el.innerHTML = html; painted.set(el, html);
  for (const e of $$('[data-num]', el)) {
    const p = prev.get(e.dataset.num);
    if (p != null && p !== e.textContent) play(e, [{ transform: 'translateY(-45%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: EASE1 });
  }
  return true;
}

const st = { vm: BOOT.vm, prevSig: null, changedUntil: new Map(), pending: new Set(), conn: 'connecting', attempt: 0,
  lostAt: Date.now(), lastPushAt: 0, lastChange: null, open: new Set(store.get('ad-dash-open', [])), renderedAt: 0,
  sess: null, onlyNotable: false, heroGone: false };

/* ---------- 시간 (KST) ---------- */
const kDay = ms => Math.floor((ms + KST) / DAY);
const kp = ms => { const t = new Date(ms + KST); return { mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(), wd: t.getUTCDay() }; };
const pad = n => String(n).padStart(2, '0');
const fDate = ms => { const p = kp(ms); return `${p.mo}월 ${p.d}일 (${WD[p.wd]})`; };
const fHM = ms => { const p = kp(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const fHMS = ms => { const p = kp(ms); return `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`; };
const fWhen = (ms, now) => { if (kDay(ms) === kDay(now)) return fHMS(ms); const p = kp(ms); return `${p.mo}/${p.d} ${fHM(ms)}`; };
const parseAt = s => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
function rel(ms, now) {
  const s = Math.round((now - ms) / 1000);
  if (s < 0) return '미래 시각';
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  const dd = kDay(now) - kDay(ms);
  if (dd <= 0) return `${Math.floor(s / 3600)}시간 전`;
  return dd === 1 ? '어제' : `${dd}일 전`;
}
/* 상대 시각은 빈 칸으로 그리고 시계가 채운다. 그래야 초마다 영역 전체를 다시 쓰지 않는다 */
const relSpan = ms => `<span class="rel" data-rel="${ms}"></span>`;
function fillRel(now) { for (const el of $$('[data-rel]')) { const t = rel(+el.dataset.rel, now); if (el.textContent !== t) el.textContent = t; } }

/* ---------- 모양: 상태는 색과 모양과 글자를 함께 쓴다 ---------- */
const svg = (body, cls = '') => `<svg class="g ${cls}" viewBox="0 0 16 16" fill="none" aria-hidden="true">${body}</svg>`;
const G = {
  ok: svg('<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.6 8.3 2.3 2.3 4.6-5" stroke="var(--g-ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'g-ok'),
  note: svg('<path d="M8 1.4 15.2 14H.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6v3.6M8 11.8v.1" stroke="var(--g-ink)" stroke-width="1.8" stroke-linecap="round"/>', 'g-note'),
  block: svg('<rect x="1.2" y="1.2" width="13.6" height="13.6" rx="2" fill="currentColor"/><path d="m5 5 6 6M11 5l-6 6" stroke="var(--g-ink)" stroke-width="1.8" stroke-linecap="round"/>', 'g-block'),
  quiet: svg('<circle cx="8" cy="8" r="2.6" fill="currentColor"/>', 'g-quiet'),
  unknown: svg('<circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 2.2"/><path d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.7c-.5.3-.8.6-.8 1.2M8 11.6v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>', 'g-unknown'),
  done: svg('<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.6 8.3 2.3 2.3 4.6-5" stroke="var(--g-ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'g-done'),
  current: svg('<circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3" fill="currentColor"/>', 'g-current'),
  waiting: svg('<circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2.4"/>', 'g-waiting'),
  stopped: svg('<rect x="1.2" y="1.2" width="13.6" height="13.6" rx="2" fill="currentColor"/><path d="M6 5v6M10 5v6" stroke="var(--g-ink)" stroke-width="2" stroke-linecap="round"/>', 'g-stopped'),
};
/* 조용함 줄의 시계. 회색(쉼)이라 할 일·주의의 노랑 세모와 섞이지 않는다 */
const CLOCK = svg('<circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.4 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 'g-clock');
const FLOW = { done: '완료', current: '진행 중', waiting: '대기', stopped: '멈춤' };
const WARN_ICON = '<svg class="warn" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 1.4 11 10.3H1z" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 4.7v2.6M6 8.7v.05" stroke-width="1.4" stroke-linecap="round"/></svg>';
const tag = (label, cls) => `<span class="tag ${cls}">${cls === 'tag-broken' ? WARN_ICON : ''}${esc(label)}</span>`;
const state = (kind, label) => `<span class="state state-${kind}">${G[kind]}<b>${esc(label)}</b></span>`;
/* 원문 글은 이스케이프한 뒤 굵게(**)와 인라인 코드(`)만 살린다 */
const md = s => String(s ?? '').split(/(`[^`]+`)/).map(part => part.length > 1 && part.startsWith('`') && part.endsWith('`')
  ? `<code class="inline">${esc(part.slice(1, -1))}</code>` : esc(part).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')).join('');
const refText = ref => ref.path + (ref.line ? `:${ref.line}` : '');
function cite(ref) {
  const i = ref.path.lastIndexOf('/'), dir = i >= 0 ? ref.path.slice(0, i + 1) : '', file = ref.path.slice(i + 1);
  return `<span class="cite">${esc(dir).replace(/\//g, '/<wbr>')}<b>${esc(file)}</b>${ref.line ? `:${ref.line}` : ''}</span>`;
}
const COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5"/></svg>';
const srcLink = ref => ref?.path ? `<span class="src">${cite(ref)}<button type="button" class="copy" data-copy="${esc(refText(ref))}" aria-label="경로 복사: ${esc(refText(ref))}" title="경로 복사">${COPY_ICON}</button></span>` : '';
const srcOf = id => st.vm.sources.find(s => s.id === id);
const isOpen = id => st.open.has(id) ? ' open' : '';
const fold = (id, summary, body, cls = '') => `<details class="fold ${cls}" data-id="${esc(id)}"${isOpen(id)}><summary><span class="chev" aria-hidden="true"></span>${summary}</summary><div class="fold-body">${body}</div></details>`;
const failedBlock = (b, title, note) => `<div class="unknown-block"${fxAttr(b.sourceId + '-status')}><p><strong>${title}</strong> ${esc(srcOf(b.sourceId)?.error || '')}</p><p>${note}</p></div>`;
/* 긴 문단은 문장 단위 목록으로 보인다(수집기가 나눈 조각 그대로) */
const sents = (parts, cls = '') => parts?.length ? `<ul class="sents ${cls}">${parts.map(p => `<li>${md(p)}</li>`).join('')}</ul>` : '';

/* ---------- 바뀐 항목: 직전 스냅샷과 키별 값을 비교한다 ---------- */
const fxAttr = k => ` data-fx="${esc(k)}"`;
/* 바뀐 항목은 왼쪽 파랑 선(data-fx)으로만 알린다. 글자 배지는 두지 않는다 */
const freshTag = () => '';
const aiKey = a => 'ai:' + a.file + ':' + a.text.slice(0, 60);
function sigMap(vm) {
  const m = new Map(), J = JSON.stringify;
  m.set('milestone', J([vm.milestone.status, vm.milestone.title, vm.milestone.statusText, vm.voice?.milestone, vm.voice?.status]));
  m.set('focus', J([vm.focus?.current, vm.focus?.basis, vm.focus?.nextPhase, vm.summary?.doing, vm.summary?.activity?.kind, vm.summary?.activity?.actor]));
  m.set('hand', J([vm.summary?.hand, vm.summary?.chores]));
  m.set('goals', J([vm.goals?.status, (vm.goals?.items || []).map(g => [g.id, g.state, g.pr])]));
  m.set('next', J([vm.focus?.nextPhase, vm.focus?.pinNext?.text]));
  m.set('pin-sum', J([vm.pin.status, vm.pin.summary]));
  for (const it of vm.pin.coord?.items || []) m.set('coord:' + (it.label || it.line), J(it.text));
  m.set('phases-status', vm.phases.status);
  m.set('phases-rec', J([vm.phases.goal, vm.phases.record && [vm.phases.record.pass, vm.phases.record.fail, vm.phases.record.userInput, vm.phases.record.failSinceUserInput, vm.phases.record.last]]));
  for (const p of vm.phases.items || []) m.set('phase:' + p.num, J([p.name, p.goal, p.state, p.flow, p.commit?.hash, vm.voice?.phases?.[p.num], p.record && [p.record.pass, p.record.fail, p.record.userInput, p.record.failSinceUserInput, p.record.last]]));
  m.set('ledger', J([vm.ledger.status, vm.ledger.tally, vm.ledger.gate]));
  for (const a of vm.ledger.aiLines || []) m.set(aiKey(a), J([a.tag, a.text]));
  m.set('tree-head', J([vm.worktree.status, vm.worktree.branch, vm.worktree.head]));
  m.set('tree-sync', J([vm.worktree.compare || null]));
  m.set('tree-changes', J(vm.worktree.changes || null));
  m.set('hooks-status', vm.hooks.status);
  for (const h of vm.hooks.entries || []) m.set('hook:' + h.key, '1');
  for (const s of vm.backlog.sections || []) for (const it of s.items) m.set(`bl:${s.name}:${it.num}`, it.title);
  for (const ms of vm.milestones.items || []) m.set('ms:' + ms.name, J([ms.state, ms.title, ms.statusText, ms.current]));
  for (const s of vm.sources) m.set('src:' + s.id, J([s.status, s.error, s.target]));
  return m;
}
/* 바뀐 키가 속한 영역. 그 영역의 머리 선이 한 번 파랗게 지나간다 */
const AREA_OF = k => /^(milestone|focus|next|hand|goals)$/.test(k) ? 'now' : k.startsWith('phase') ? 'phases' : k.startsWith('hook') ? 'hooks' : k.startsWith('tree') ? 'tree'
  : /^(pin-sum|coord:)/.test(k) ? 'pin' : /^(ledger|ai:)/.test(k) ? 'ledger' : k.startsWith('bl:') ? 'backlog' : k.startsWith('ms:') ? 'milestones' : k.startsWith('src:') ? 'sources' : null;

/* ---------- 사람 문장: 원문 파일의 문장 → 계획 문서 「사람용 개요」 → 원문 그대로 ---------- */
/* goal 한 장 형식이면 단계는 「진척 단계」 항목이다. 항목 글이 곧 사람이 쓴 문장이다 */
const isGoal = () => st.vm.phases.status === 'ok' && st.vm.phases.format === 'goal';
const nOf = p => p.label ?? p.num;
const clipText = (s, n) => { const a = Array.from(String(s ?? '')); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
function phaseVoice(p) {
  if (isGoal()) return { v: null, name: p.name, named: true, goal: null, doing: null, done: null, need: null };
  const v = st.vm.voice?.phases?.[p.num] || null;
  return { v, name: v?.name?.text || p.name, named: !!v?.name, goal: v?.goal?.text || null, doing: v?.doing?.text || null, done: v?.done?.text || null, need: v?.need?.text || null };
}
const phaseOf = n => n == null || st.vm.phases.status !== 'ok' ? null : st.vm.phases.items.find(p => p.num === n) || null;

/* ---------- 맨 위 세 질문: 지금 무슨 일 · 내 손이 필요한 일 · 전체 중 어디쯤 ----------
   판정은 서버(lib/progress.mjs)의 고정 규칙이다. 화면은 시간에 묶인 것(최근 10분)만 시계로 다시 본다 */
const FRESH_MIN = 10;
const SUM = () => st.vm.summary || { doing: { text: null }, activity: null, hand: [], chores: [] };
const isFresh = (at, now, min = FRESH_MIN) => { const t = parseAt(at); return t != null && now - t >= 0 && now - t < min * 60000; };
function handNow(now) { return (SUM().hand || []).filter(h => !h.fresh || isFresh(h.at, now, h.fresh)); }
/* 알림 판단 모듈(chime.js, classic script). 없으면(옛 서버가 내준 페이지) 알림만 빠지고 화면은 그대로다 */
const CH = globalThis.AgentDeckChime || null;
/* 응답을 마치고 조용한 분 수: 사실은 서버(summary.activity.quiet), 5분 넘게인지는 화면 시계로 chime.js가 정한다 */
const quietNow = now => CH ? CH.quietMinutes(SUM().activity?.quiet, now) : null;
/* 참고할 것: 멈춤은 아니지만 알아 두면 좋은 사실. 「내 손」 아래 작은 줄로만 둔다.
   줄마다 { kind, html }이다. note는 노랑 세모(주의), quiet는 회색 시계와 점선 알약(쉼 — 할 일이 아니다) */
function notesNow(now) {
  const vm = st.vm, P = vm.phases, H = vm.hooks, R = vm.rules, out = [];
  if (P.status === 'ok') {
    const rec = P.format === 'goal' ? P.record : phaseOf(vm.focus?.current)?.record;
    const stopped = P.items.some(p => p.flow === 'stopped'), closed = P.format === 'goal' && P.goal.closed;
    if (!stopped && !closed && rec?.failSinceUserInput > 0) out.push(`검증 기록에 실패가 ${num('n-fail', rec.failSinceUserInput)}번 있어요. ${R.failLimit}번이 되면 멈춰요.`);
    if (P.format === 'goal' && !closed && P.record && !P.record.section) out.push('goal 문서에 「검증 기록」 줄이 없어요. 계획 검사가 이 계획을 막을 수 있어요.');
    if (P.format === 'goal' && P.goal.currentCount > 1) out.push(`진행 중 표시가 ${P.goal.currentCount}개예요. 첫 번째를 지금 단계로 봐요.`);
    if (P.pinDisagrees) out.push(`인수인계 메모는 ${P.pinPhase}단계라고 쓰지만 커밋 기록으로는 ${P.current}단계예요. 커밋 기준으로 보여요.`);
  }
  if (H.status === 'ok') {
    const last = H.entries.filter(e => e.deny).at(-1);
    if (last && isFresh(last.at, now)) out.push(`${relSpan(parseAt(last.at))} 자동 검사가 작업 하나를 막았어요. <a href="#hooks">${esc(last.say || `${last.hook} ${last.verdict}`)}</a>`);
  }
  const failedSrc = vm.sources.filter(s => s.status === 'failed').length;
  if (failedSrc) out.push(`원문 ${failedSrc}개를 읽지 못했어요. <a href="#sources" data-open="sources">어떤 원문인지 보기</a>`);
  const notes = out.map(html => ({ kind: 'note', html }));
  /* 조용함은 맨 끝에 회색으로 둔다. 할 일이 아니라 지금 상태라서 주의 줄들과 섞지 않는다 */
  const quiet = quietNow(now);
  if (quiet != null) notes.push({ kind: 'quiet', html: `응답을 마치고 <b>${esc(quiet)}분째</b> 조용해요 <small>답을 기다리거나 배경 작업 중일 수 있어요.</small>` });
  return notes;
}
const handLevel = now => { const h = handNow(now); return h.some(x => x.level === 'stop') ? 'stop' : h.length ? 'todo' : 'ok'; };
const HAND_G = { stop: 'block', todo: 'note', ok: 'ok' };
/* 「지금」 영역 가운데 시간이 지나기만 해도 바뀌는 것(fresh 만료, 조용함 분 수). 시계가 이것이 바뀔 때만 영역을 다시 그린다 */
const nowSig = now => JSON.stringify([handNow(now).map(h => h.key ?? h.id), quietNow(now)]);

/* ---------- 알림: 알림음과 탭 제목 배지 (판단은 chime.js, 설명은 docs/알림.md) ----------
   보이는 「내 손이 필요한 일」 항목(fresh 필터 뒤)의 키 가운데 새로 들어온 키만 한 번 울린다. 조용함 줄은 대상이 아니다.
   소리는 Web Audio로 합성한 두 음(약 0.6초)이고 「동작 줄이기」 설정과 무관하다. 브라우저가 자동 재생을 막으면
   「소리 켜기」 칩이 「내 손이 필요한 일」 안에 나온다. 페이지의 첫 클릭·키 입력 때 허용을 미리 받아 둔다.
   관찰 표지(<html>의 data-*): chime-count는 울려야 했던 순간의 수(막혀도 센다), chime-last는 그때의 키(JSON),
   chime-blocked는 마지막 시도 뒤 소리가 막혀 있는지(1 막힘 · 0 재생됨 · pending 판정 중 · unsupported Web Audio 없음) */
const BASE_TITLE = document.title;
const pageStorage = () => { try { return localStorage; } catch { return null; } };
const chimeMemory = CH ? CH.createChimeMemory(pageStorage()) : null;
/* 알림음 상태는 sound.state 하나다(on · blocked · pending · unsupported). setSound만 바꾸고, 관찰 표지(chime-blocked)와
   「내 손이 필요한 일」 머리 아래 작은 표시(sound.badge)를 같은 값으로 맞춘다. 페이지를 열 때 한 번 재 본다(probeSound) */
const HAS_AUDIO = !!(globalThis.AudioContext || globalThis.webkitAudioContext);
const sound = { ctx: null, state: HAS_AUDIO ? 'pending' : 'unsupported', badge: CH && !HAS_AUDIO ? CH.soundBadge('unsupported') : null };
function setSound(state) {
  if (!CH) return;
  const d = document.documentElement.dataset, mark = CH.soundMark(state);
  if (d.chimeCount && mark) d.chimeBlocked = mark;
  const badge = CH.soundBadge(state) || sound.badge, changed = state !== sound.state || badge?.state !== sound.badge?.state;
  sound.state = state; sound.badge = badge;
  if (changed) { const now = Date.now(); renderNow(now); fillRel(now); }
}
const soundBlocked = () => sound.badge?.state === 'blocked';
let chimeSig = null;
function notify(now) {
  if (!CH) return;
  const hand = handNow(now), title = CH.badgeTitle(BASE_TITLE, hand);
  if (document.title !== title) document.title = title;
  const keys = CH.handKeys(hand), sig = JSON.stringify(keys);
  if (sig === chimeSig) return;
  chimeSig = sig;
  const ring = chimeMemory.see(keys);
  if (ring.length) chime(ring);
}
function chime(keys) {
  const d = document.documentElement.dataset;
  d.chimeCount = String((Number(d.chimeCount) || 0) + 1);
  d.chimeLast = JSON.stringify(keys);
  setSound('pending');
  playChime().catch(() => setSound('unsupported'));
}
function audioCtx() {
  if (sound.ctx) return sound.ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { sound.ctx = new AC(); } catch { return null; }
  return sound.ctx;
}
/* resume()은 자동 재생 정책에 막혀도 거절하지 않고 기다리기만 할 수 있다. 그래서 기다리지 않고 상태(state)로 판정한다 */
function running(ctx, ms = 300) {
  if (ctx.state === 'running') return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const onState = () => { if (ctx.state === 'running') finish(); };
    const timer = setTimeout(() => finish(), ms);
    function finish() { if (done) return; done = true; clearTimeout(timer); ctx.removeEventListener?.('statechange', onState); resolve(ctx.state === 'running'); }
    ctx.addEventListener?.('statechange', onState);
    try { ctx.resume().then(finish, finish); } catch { finish(); }
  });
}
/* 두 음: G5(784Hz) 0.26초, 0.2초 뒤 D6(1175Hz) 0.4초. 컨텍스트가 돌고 있을 때만 예약한다(멈춘 채 예약하면 나중에 몰아서 난다) */
function tones(ctx) {
  const t0 = ctx.currentTime + 0.02;
  for (const [freq, at, len] of [[784, 0, 0.26], [1175, 0.2, 0.4]]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), t = t0 + at;
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + len + 0.03);
  }
}
async function playChime() {
  const ctx = audioCtx();
  if (!ctx) { setSound('unsupported'); return 'unsupported'; }
  if (!(await running(ctx))) { setSound('blocked'); return 'blocked'; }
  tones(ctx); setSound('on');
  return 'played';
}
/* 페이지를 열 때 한 번 재 본다. 자동 재생이 막힌 브라우저면 알림이 오기 전에도 작은 표시가 「막힘」이 된다 */
function probeSound() {
  if (!CH) return;
  const ctx = audioCtx();
  if (!ctx) { setSound('unsupported'); return; }
  running(ctx).then(ok => { if (sound.state === 'pending') setSound(ok ? 'on' : 'blocked'); });
}
/* 「소리 켜기」: 누르는 것이 사용자 조작이라 resume이 허용된다. 켜지면 한 번 울리고 칩이 사라진다 */
function soundOn() {
  const ctx = audioCtx();
  if (!ctx) return;
  running(ctx, 1500).then(ok => { if (!ok) return; tones(ctx); setSound('on'); });
}
/* 첫 클릭·키 입력 때 허용을 미리 받는다. 칩을 누른 것은 칩 쪽(soundOn)에 맡긴다 */
function primeSound(e) {
  if (e.target?.closest?.('[data-sound-on]')) return;
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === 'running') { if (sound.state !== 'on') setSound('on'); return; }
  running(ctx, 1000).then(ok => { if (ok) setSound('on'); });
}
document.addEventListener('click', e => { if (e.target?.closest?.('[data-sound-on]')) { e.preventDefault(); soundOn(); } else primeSound(e); }, true);
document.addEventListener('keydown', primeSound, true);
/* 「소리 켜기」 칩: 알림음이 실제로 막혔을 때(울려야 했던 순간이 있었을 때) 「내 손이 필요한 일」 안에 나온다. 노랑 테두리 알약이라 빨강 멈춤과 다르다 */
const SPEAKER = (waves = true) => `<svg class="g g-speaker" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.2 6h2.6l3.6-3v10L4.8 10H2.2z" fill="currentColor"/>${waves ? '<path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' : '<path d="m11 6 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'}</svg>`;
const soundChip = () => soundBlocked() && document.documentElement.dataset.chimeCount ? `<p class="q-sub sound-line">${G.note}<span>브라우저가 알림음을 막았어요.</span><button type="button" class="sound-chip" data-sound-on title="누르면 소리를 켜고 알림음을 한 번 들려줘요">${SPEAKER()}소리 켜기</button></p>` : '';
/* 알림 상태 작은 표시: 「내 손이 필요한 일」 머리 아래. 막혔으면 눌러서 켤 수 있다 */
function soundState() {
  const b = sound.badge;
  if (!CH || !b) return '';
  const inner = `${SPEAKER(b.state === 'on')}<span>${esc(b.text)}</span>`;
  return b.state === 'blocked' ? `<button type="button" class="sound-state is-blocked" data-sound-on title="${esc(b.title)}">${inner}<b>켜기</b></button>`
    : `<p class="sound-state is-${esc(b.state)}" title="${esc(b.title)}">${inner}</p>`;
}

/* ---------- 상단 띠 ---------- */
const SLOTS = ['conn', 'collected', 'mini', 'failed'], slotHtml = new Map();
function stripSlot(name, html) {
  const box = $('#strip-status');
  if (!box.querySelector('[data-slot]')) { slotHtml.clear(); box.innerHTML = SLOTS.map(s => `<span class="slot" data-slot="${s}"></span>`).join(''); }
  if (slotHtml.get(name) === html) return null;
  const el = box.querySelector(`[data-slot="${name}"]`);
  slotHtml.set(name, html); el.innerHTML = html;
  return el;
}
function renderStrip(now) {
  const vm = st.vm, at = Date.parse(vm.collectedAt);
  const conn = { connecting: ['is-reconnecting', '연결하는 중'], connected: ['is-connected', '실시간'],
    reconnecting: ['is-reconnecting', `다시 연결하는 중${st.attempt ? ` (${st.attempt}번째)` : ''}`], disconnected: ['is-disconnected', '연결 끊김'] }[st.conn];
  stripSlot('conn', `<span class="conn ${conn[0]}"><i aria-hidden="true"></i>${conn[1]}</span>`);
  const collected = stripSlot('collected', `<span class="collected${st.conn === 'disconnected' ? ' is-stale' : ''}" title="저장소 원문을 마지막으로 읽은 시각"><time datetime="${esc(vm.collectedAt)}">${fHMS(at)}</time>에 읽음</span>`);
  if (collected && st.shownCollected && st.shownCollected !== vm.collectedAt) play(collected.querySelector('time'), [{ opacity: 0, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE1 });
  st.shownCollected = vm.collectedAt;
  /* 머리가 화면 밖으로 나가면 띠에 「지금 하는 일」 한 줄을 고정한다.
     「내 손이 필요한 일」이 있으면 그 첫 항목(멈춤 먼저)을 바로 옆 강조 줄로 둔다. 할 일은 노랑, 멈춤은 빨강 면이다 */
  let mini = '';
  if (st.heroGone) {
    const lv = handLevel(now), d = SUM().doing, h = CH?.stripHand(handNow(now)) ?? null;
    mini = `<a class="mini" href="#now">${h ? G.quiet : G[HAND_G[lv]]}<span>${d?.text ? md(d.text) : '지금 하는 일 확인 안 됨'}</span>${!h && lv !== 'ok' ? `<b>${lv === 'stop' ? '멈춤' : '할 일 있음'}</b>` : ''}</a>`;
    if (h) mini += `<a class="mini-hand is-${h.level}" href="#now" title="${esc(h.say)}">${G[HAND_G[h.level]]}<b>${h.level === 'stop' ? '멈춤' : '내 손 필요'}</b><span>${esc(h.say)}</span>${h.more ? `<small>외 ${esc(h.more)}건</small>` : ''}</a>`;
  }
  stripSlot('mini', mini);
  const failed = vm.sources.filter(s => s.status === 'failed').length;
  stripSlot('failed', failed ? `<a class="tag tag-broken" href="#sources" data-open="sources">${WARN_ICON}읽지 못한 원문 ${failed}</a>` : '');
}
function pulseConn() { const dot = $('.conn.is-connected i'); if (dot && moving()) restart(dot, 'is-beat'); }
let bannerState = null;
function renderBanner() {
  const b = $('#banner'), at = Date.parse(st.vm.collectedAt);
  let html = '', cls = 'banner';
  if (st.conn === 'disconnected') {
    cls += ' is-disconnected';
    html = `<div class="wrap"><p><strong>${WARN_ICON}실시간 연결이 끊겼어요.</strong> ${fHMS(st.lostAt)}부터 서버 응답이 없어요. 화면은 ${fHMS(at)}에 읽은 내용이고, 저장소 파일이 바뀌어도 반영되지 않아요.</p><button type="button" class="btn" id="reconnect">다시 연결</button></div>`;
  } else if (st.conn === 'reconnecting') {
    cls += ' is-reconnecting';
    html = `<div class="wrap"><p><strong>다시 연결하는 중이에요${st.attempt ? ` (${st.attempt}번째 시도)` : ''}.</strong> 그동안 화면은 ${fHMS(at)}에 읽은 내용이에요.</p></div>`;
  }
  b.className = cls;
  if (painted.get(b) !== html) { b.innerHTML = html; painted.set(b, html); }
  if (bannerState != null && bannerState !== st.conn && b.firstElementChild) play(b.firstElementChild, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE1 });
  bannerState = st.conn;
}

/* ---------- 지금: 세 질문에 한 줄씩 ---------- */
const KIND_WORD = { read: '코드 읽기', test: '테스트', edit: '파일 수정', build: '빌드·검사', commit: '커밋', push: '원격·PR', orca: 'Orca 창 관리', run: '기타 명령', stop: '응답 마침' };
function doingBlock(now) {
  const S = SUM(), d = S.doing || {}, a = S.activity, P = st.vm.phases;
  const line = d.text ? md(d.text) : '지금 하는 일을 원문으로 정하지 못했어요';
  let act;
  if (!a) act = `<p class="q-sub is-quiet">${G.quiet}<span>자동 검사 기록에 최근 활동이 없어요.</span></p>`;
  else {
    const at = parseAt(a.at), live = isFresh(a.at, now);
    act = `<p class="q-sub${live ? ' is-live' : ' is-quiet'}">${live ? '<i class="pulse" aria-hidden="true"></i>' : G.quiet}<span>${live ? esc(a.say) : `마지막 활동은 ${relSpan(at)}이에요. ${esc(a.sayPast)}`}${live ? ` <small>${relSpan(at)}</small>` : ''}</span></p>`;
  }
  const src = [P.status === 'ok' ? (P.format === 'goal' ? 'goal 문서의 진척 단계 표시' : '계획 문서와 커밋 기록') : null,
    a ? (a.of > 1 ? `자동 검사 기록 최근 ${a.of}건 중 ${a.count}건이 ${KIND_WORD[a.kind] || a.kind}` : `자동 검사 기록의 마지막 기록(${KIND_WORD[a.kind] || a.kind})`) : null].filter(Boolean);
  const why = !d.text && d.why ? `<p class="q-sub is-quiet">${G.unknown}<span>${esc(d.why)}</span></p>` : '';
  const raw = a?.detail ? fold('raw-activity', '근거 원문', `<p class="raw-h">가장 최근 ${esc(KIND_WORD[a.kind] || '')} 기록</p><p class="rawtext mono">${esc(a.detail)}</p>${srcLink({ path: st.vm.hooks.path })}`, 'raw') : '';
  return `<div class="q q-doing"${fxAttr('focus')}><h2 class="q-k">지금 하는 일</h2><div class="q-a"><p class="q-line">${line}</p>${why}${act}
    <p class="q-src">근거: ${src.map(esc).join(' · ') || '없음'}</p>${raw}</div></div>`;
}
function handBlock(now) {
  const S = SUM(), hand = handNow(now), notes = notesNow(now), lv = handLevel(now);
  const items = hand.length ? `<ul class="hand-list">${hand.map(h => `<li class="is-${h.level}">${G[HAND_G[h.level]]}<div><p>${esc(h.say)}</p>${h.quote ? `<p class="rawtext">「${md(clipText(h.quote, 160))}」</p>` : ''}<p class="q-src">근거: ${esc(h.source)}${h.ref ? ' ' + srcLink(h.ref) : ''}</p></div></li>`).join('')}</ul>`
    : `<p class="q-line is-none">${G.ok}<span>없음</span></p>`;
  const chores = S.chores?.length ? fold('chores', `급하지 않은 정리 일 ${S.chores.length}개 <small>인수인계 메모에 「사용자 몫」으로 적힌 문장</small>`, sents(S.chores) + (S.choresRef ? srcLink(S.choresRef) : ''), 'raw') : '';
  const noteHtml = notes.length ? `<ul class="q-notes">${notes.map(n => `<li class="is-${n.kind}">${n.kind === 'quiet' ? CLOCK : G.note}<span>${n.html}</span></li>`).join('')}</ul>` : '';
  st.nowSig = nowSig(now);
  return `<div class="q q-hand is-${lv}"${fxAttr('hand')}><div class="q-head"><h2 class="q-k">내 손이 필요한 일</h2>${soundState()}</div><div class="q-a">${items}${soundChip()}${noteHtml}${chores}</div></div>`;
}
const GOAL_WORD = { done: '완료', current: '진행 중', draft: '초안', left: '남음', unknown: '상태 미확인' };
function whereBlock() {
  const vm = st.vm, Gs = vm.goals, P = vm.phases;
  if (Gs?.status === 'ok' && Gs.items.length) {
    const cur = Gs.items.find(g => g.current);
    const say = `goal ${Gs.total}개 중 ${Gs.done}개 완료${Gs.doing ? `, 지금 ${cur ? cur.id : Gs.doing + '개'}` : ''}, 남은 goal ${Gs.left}개${Gs.unknown ? ` (상태를 읽지 못한 goal ${Gs.unknown}개)` : ''}`;
    const chip = g => `<li class="tk is-${g.state}${g.current ? ' is-here' : ''}" title="${esc(`${g.id} ${g.name} — ${GOAL_WORD[g.state]}${g.pr ? ` (PR ${g.pr})` : ''}`)}"><span class="tk-mark" aria-hidden="true">${G[{ done: 'done', current: 'current', draft: 'current', left: 'waiting', unknown: 'unknown' }[g.state]]}</span><span class="tk-id">${esc(g.id)}</span><span class="tk-sub">${g.current ? '지금' : g.pr ? `PR ${esc(g.pr)}` : g.state === 'left' ? '남음' : esc(GOAL_WORD[g.state])}</span>${g.current || g.pr ? `<span class="sr">${esc(GOAL_WORD[g.state])}</span>` : ''}</li>`;
    const list = fold('goal-list', 'goal 이름 모두 보기', `<ol class="goal-names">${Gs.items.map(g => `<li class="is-${g.state}">${G[{ done: 'done', current: 'current', draft: 'current', left: 'waiting', unknown: 'unknown' }[g.state]]}<b>${esc(g.id)}</b><span>${md(g.name)}</span><small>${g.current ? '지금' : esc(GOAL_WORD[g.state])}${g.pr ? ` · PR ${esc(g.pr)}` : ''}</small></li>`).join('')}</ol>
      <p class="q-src">근거: ${esc(P.planPath ? P.planPath.slice(0, P.planPath.lastIndexOf('/') + 1) : '')} 의 goal 문서 머리말 「상태:」, 아직 파일이 없는 goal은 계획 문서의 goal 목록</p>`, 'raw');
    return `<div class="q q-where"${fxAttr('goals')}><h2 class="q-k">전체 중 어디쯤</h2><div class="q-a"><p class="q-line">${md(Gs.milestoneName || vm.milestone.title || '')}</p>
      <p class="q-sub">${esc(say)}</p><ol class="track" aria-label="마일스톤 안 goal 진행">${Gs.items.map(chip).join('')}</ol>${list}</div></div>`;
  }
  /* 다중 파일 형식이거나 goal 목록을 못 읽었을 때: 단계 수로만 말한다 */
  const n = P.status === 'ok' ? P.items.length : null, done = P.status === 'ok' ? P.items.filter(p => p.flow === 'done').length : null;
  return `<div class="q q-where"${fxAttr('goals')}><h2 class="q-k">전체 중 어디쯤</h2><div class="q-a"><p class="q-line">${vm.milestone.status === 'ok' ? md(vm.milestone.title) : '마일스톤을 읽지 못했어요'}</p>
    <p class="q-sub">${n != null ? `단계 ${n}개 중 ${done}개 완료` : esc(srcOf('phases')?.error || '단계 정보를 읽지 못했어요.')}${Gs?.status === 'failed' ? ` · goal 목록을 읽지 못했어요: ${esc(srcOf('goals')?.error || '')}` : ''}</p></div></div>`;
}
function renderNow(now) {
  paint($('#now'), doingBlock(now) + handBlock(now) + whereBlock());
}

/* ---------- 이 goal의 단계 ---------- */
const markerWord = m => m === 'PASS' ? '통과' : m === 'FAIL' ? '실패' : m === 'USER-INPUT' ? '사용자 입력' : m;
const RAW_STATE = { 'no-record-section': '검증 기록 절이 없어요', 'no-section': '계획 문서에 이 단계의 절이 없어요' };
const STEP_WORD = { done: '완료', current: '진행 중', waiting: '남음', stopped: '멈춤' };
/* 짧은 이름(short)은 서버가 lib/progress.mjs shortName 규칙으로 붙여 보낸다. 없으면 원문 그대로다 */
const shortOf = p => p.short || p.name;
/* 검증 기록 한 줄: 이 화면에서 기록 수는 여기에만 있다 */
function recordLine(r, now) {
  if (!r?.section) return tag('검증 기록 절이 없어요', 'tag-broken');
  const total = r.pass + r.fail + r.userInput;
  if (!total) return '검증 기록은 아직 없어요.';
  const at = r.last && parseAt(r.last.at);
  return `검증 기록: 통과 ${num('g-pass', r.pass)} · 실패 ${num('g-fail', r.fail)} · 사용자 입력 ${num('g-ui', r.userInput)}${r.last ? `. 마지막은 ${at ? relSpan(at) + ' ' : ''}${esc(markerWord(r.last.marker))}` : ''}`;
}
function goalStepRow(p, P) {
  const k = 'phase:' + p.num, here = p.num === P.current, nextUp = !P.current && p.num === P.next;
  const raw = `<p class="rawtext"><code class="inline">- [${esc(p.mark)}]${p.label ? ' ' + esc(p.label) + '.' : ''}</code> ${md(p.name)}${p.odd ? ' ' + tag('알 수 없는 표시라 남음으로 봄', 'tag-candidate') : ''}</p>${srcLink(p.ref)}`;
  const title = `<span class="step-n">${esc(nOf(p))}</span><span class="step-name">${md(shortOf(p))}</span><span class="step-word">${here ? '지금' : nextUp ? '다음' : STEP_WORD[p.flow]}</span>`;
  return `<li class="step is-${p.flow}${here ? ' is-here' : ''}" id="phase-${p.num}"${fxAttr(k)}>
    <span class="step-mark" aria-hidden="true">${G[p.flow]}</span>
    ${fold('raw-phase-' + p.num, title, raw, 'step-fold')}
    ${p.flow === 'stopped' ? `<p class="step-say">실패가 ${esc(P.record.failSinceUserInput)}번 쌓여 멈췄어요. 사용자의 판단을 기다려요.</p>` : ''}</li>`;
}
function phaseRow(p, now, limit) {
  const k = 'phase:' + p.num, r = p.record, pv = phaseVoice(p);
  const sentence = p.flow === 'stopped' ? `실패 ${r.failSinceUserInput}번으로 멈췄어요. 사용자의 판단을 기다려요.` : p.flow === 'done' ? pv.done : p.flow === 'current' ? pv.doing : null;
  const aux = [];
  if (r?.section) { aux.push(`검증 통과 ${num(k + ':p', r.pass)}`); aux.push(`<span class="${r.fail ? 'is-fail' : ''}">실패 ${num(k + ':f', r.fail)}</span>`); }
  else if (RAW_STATE[p.state]) aux.push(tag(RAW_STATE[p.state], 'tag-broken'));
  if (p.commit) aux.push(`마감 커밋 <span class="mono">${esc(p.commit.hash)}</span>`);
  let raw = `<dl class="rawkv"><dt>계획 문서의 이름</dt><dd>${md(p.name)} ${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join(' ')}${p.inTable ? '' : ' ' + tag('「Phase 흐름」 표에 없음', 'tag-candidate')}${p.duplicate ? ' ' + tag('같은 번호의 절이 둘 이상', 'tag-candidate') : ''}</dd>
    ${p.goal ? `<dt>계획 문서의 목표</dt><dd>${md(p.goal)}</dd>` : ''}
    ${r?.section ? `<dt>검증 기록</dt><dd>PASS ${r.pass} · FAIL ${r.fail} · USER-INPUT ${r.userInput} · 마지막 USER-INPUT 이후 FAIL ${r.failSinceUserInput}/${limit}</dd>` : ''}
    ${p.commit ? `<dt>마감 커밋</dt><dd><span class="mono">${esc(p.commit.hash)}</span> ${esc(p.commit.subject)}</dd>` : ''}</dl>`;
  if (r?.last) {
    const at = parseAt(r.last.at);
    raw += `<p class="raw-h">마지막 기록 줄 <span class="chip">${esc(markerWord(r.last.marker))}</span>${at ? ` <time datetime="${esc(r.last.at)}">${fWhen(at, now)}</time>` : ''}</p><p class="rawtext">${md(r.last.text)}</p>${srcLink({ path: r.last.file, line: r.last.line })}`;
  } else raw += srcLink(p.ref || p.tableRef);
  return `<li class="step is-${p.flow}${p.flow === 'current' ? ' is-here' : ''}" id="phase-${p.num}"${fxAttr(k)}>
    <span class="step-mark" aria-hidden="true">${G[p.flow]}</span>
    ${fold('raw-phase-' + p.num, `<span class="step-n">${p.num}</span><span class="step-name">${md(pv.named && pv.v ? pv.name : shortOf(p))}</span><span class="step-word">${p.flow === 'current' ? '지금' : STEP_WORD[p.flow]}</span>`, raw, 'step-fold')}
    ${sentence ? `<p class="step-say">${md(sentence)}</p>` : ''}
    ${pv.need && (p.flow === 'waiting' || (p.flow === 'current' && r && r.pass + r.fail + r.userInput === 0)) ? `<p class="need">${tag('시작 전에 사용자가 할 일', 'tag-todo')}<span>${md(pv.need)}</span></p>` : ''}
    ${aux.length ? `<p class="step-aux">${aux.map(a => `<span>${a}</span>`).join('')}</p>` : ''}</li>`;
}
function renderPhases(now) {
  const el = $('#phases'), P = st.vm.phases, Gs = st.vm.goals, limit = st.vm.rules.failLimit, cur = Gs?.current;
  const title = cur ? `${esc(cur.id)}의 단계` : '이 계획의 단계';
  const head = sum => `<header class="area-head"><h2 id="phases-h">${title}</h2><div class="area-sum">${sum}</div></header>`;
  if (P.status !== 'ok') { paint(el, head(tag('읽지 못함', 'tag-broken')) + failedBlock(P, '단계와 검증 기록을 읽지 못했어요.', '단계 수와 기록 수는 미확인이고, 0이라는 뜻이 아니에요.')); return; }
  const done = P.items.filter(p => p.flow === 'done').length, sum = `<span>${P.items.length}단계 중 ${num('ph-done', done)}개 완료</span>`;
  let intro = '';
  if (P.format === 'goal') {
    const r = P.record, aim = Gs?.aim, at = r?.last && parseAt(r.last.at);
    const rawRec = r?.last ? `<p class="raw-h">마지막 기록 줄 <span class="chip">${esc(markerWord(r.last.marker))}</span>${at ? ` <time datetime="${esc(r.last.at)}">${fWhen(at, now)}</time>` : ''}</p><p class="rawtext">${md(r.last.text)}</p>${srcLink({ path: r.last.file, line: r.last.line })}` : srcLink(r?.ref || P.goal.ref);
    intro = `<div class="goal-intro">${cur ? `<p class="goal-name">${md(cur.name)}</p>` : ''}
      ${aim ? fold('goal-aim', '이 goal의 목표 원문', sents(aim.sentences) + srcLink({ path: aim.path, line: aim.line }), 'raw') : ''}
      <p class="goal-rec"${fxAttr('phases-rec')}>${recordLine(r, now)}${P.goal.status ? ` <small>머리말 상태: ${md(P.goal.status)}</small>` : ''}</p>${fold('raw-goal-rec', '마지막 검증 기록 원문', rawRec, 'raw')}</div>`;
  }
  const rows = P.items.map(p => P.format === 'goal' ? goalStepRow(p, P) : phaseRow(p, now, limit)).join('');
  const basis = P.format === 'goal' ? 'goal 문서 「진척 단계」의 표시를 그대로 읽어요. [x]는 완료, [&gt;]는 진행 중, [ ]는 남음이에요. 단계 이름은 줄표 앞부분만 보이고, 눌러서 원문을 펼쳐요.'
    : { commit: `커밋 제목에 <code class="inline">${esc(P.milestoneId)}-P번호</code>가 있는 단계를 완료로, 그런 커밋이 없는 첫 단계를 진행 중으로 봐요.`, pin: '커밋 기록을 읽지 못해, 인수인계 메모의 「상태」 문장에 적힌 단계를 진행 중으로 봐요.', record: '커밋 기록과 인수인계 메모로 정하지 못해, 검증 기록이 있는 마지막 단계를 진행 중으로 봐요.' }[P.basis] || '';
  paint(el, head(sum) + intro + (P.items.length ? `<ol class="steps" data-list="phases">${rows}</ol>` : '<p class="empty">단계 목록이 비어 있어요.</p>')
    + `<p class="area-foot">${basis} 실패가 ${limit}번 쌓이면 멈춰요.</p>`);
}

/* ---------- 검사 활동(훅) ---------- */
const hue = id => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const sessTag = e => e.session ? `<span class="sess" style="--h:${hue(e.session)}" title="세션 ${esc(e.session)}">${esc(e.sessionShort)}${e.sub ? '<small>하위</small>' : ''}</span>` : '<span class="sess is-none">세션 없음</span>';
const hookSay = e => e.say ? esc(e.say) : `<span class="rawline">${esc(e.hook || '훅 이름 없음')} · ${esc(e.verdict || '판정 없음')}${e.rule ? ` · ${esc(e.rule)}` : ''}</span>`;
const hookId = e => `${esc(e.hook || '')}${e.verdict ? ` · ${esc(e.verdict)}` : ''}${e.rule ? ` · ${esc(e.rule)}` : ''}`;
const levelOf = e => e.deny ? 'block' : e.level || 'unknown';
function renderHooks(now) {
  const el = $('#hooks'), H = st.vm.hooks, R = st.vm.rules;
  const head = sum => `<header class="area-head"><h2 id="hooks-h">자동 검사 기록</h2><div class="area-sum">${sum}</div></header>`;
  if (H.status !== 'ok') { paint(el, head(tag('읽지 못함', 'tag-broken')) + failedBlock(H, '검사 기록을 읽지 못했어요.', '막은 횟수는 미확인이고, 0건이라는 뜻이 아니에요.')); return; }
  const all = H.entries.slice().reverse(), denies = all.filter(e => e.deny);
  if (st.sess !== null && !H.sessions.some(s => (s.id ?? '') === st.sess)) st.sess = null;
  /* 막은 검사: 이유를 문장으로, 원문 이유는 접어서 */
  const denyCard = e => { const at = parseAt(e.at), k = 'hook:' + e.key; return `<li class="deny"${fxAttr(k)}>
    <p class="deny-say">${G.block}<b>${hookSay(e)}</b>${freshTag(k)}</p>
    <p class="deny-meta">${at ? `<time datetime="${esc(e.at)}">${fWhen(at, now)}</time>${relSpan(at)}` : '시각 없음'}${sessTag(e)}${e.detail ? `<span class="deny-target" title="${esc(e.detail)}">대상 <span class="mono">${esc(e.detail)}</span></span>` : ''}</p>
    ${fold('raw-deny-' + e.key, '원문 보기', `<p class="rawtext">${esc(e.reason || '이유가 기록되지 않았어요.')}</p><p class="rawid">${hookId(e)}${e.tool ? ` · ${esc(e.tool)}` : ''}</p>`, 'raw')}</li>`; };
  const denyHtml = denies.length ? `<ol class="denies" data-list="deny">${denies.slice(0, 5).map(denyCard).join('')}</ol>${denies.length > 5 ? fold('deny-more', `이전에 막은 ${denies.length - 5}건 더 보기`, `<ol class="denies">${denies.slice(5).map(denyCard).join('')}</ol>`) : ''}`
    : `<p class="calm">${G.ok}<span>최근 기록 ${H.lines}줄 안에 검사가 막은 작업이 없습니다.</span></p>`;
  /* 세션 고르기 */
  const chip = (id, label, extra, on) => `<button type="button" class="pick" data-sess="${esc(id)}" aria-pressed="${on}">${label}${extra}</button>`;
  const picks = `<div class="picks" role="group" aria-label="세션 고르기">${chip('', '모든 세션', ` <small>${H.entries.length}줄</small>`, st.sess === null)}${H.sessions.map(s => {
    const at = parseAt(s.lastAt);
    return chip(s.id ?? '', sessTag({ session: s.id, sessionShort: s.short }), ` <small>${s.lines}줄${s.deny ? ` · 막음 ${s.deny}` : ''}${at ? ` · ${fHM(at)}` : ''}</small>`, st.sess === (s.id ?? ''));
  }).join('')}<button type="button" class="pick pick-toggle" data-notable aria-pressed="${st.onlyNotable}">통과는 숨기기</button></div>`;
  /* 흐름: 최신이 위. 같은 세션의 같은 판정이 이어지면 한 줄로 묶는다 */
  let list = all.slice(0, R.hookRecent * 3);
  if (st.sess !== null) list = list.filter(e => (e.session ?? '') === st.sess);
  if (st.onlyNotable) list = list.filter(e => !['ok', 'quiet'].includes(levelOf(e)));
  const groups = [];
  for (const e of list) {
    /* 통과는 세션별로 이어진 것끼리 한 줄로 묶고, 알림·막음·사전에 없는 판정은 한 줄씩 둔다 */
    const lv = levelOf(e), g = groups.at(-1), sig = lv === 'ok' ? `${e.session}|ok` : [e.session, e.hook, e.verdict, e.rule].join('|');
    if (g && g.sig === sig && !e.deny) { g.n++; g.names.set(e.hookName || e.hook, (g.names.get(e.hookName || e.hook) || 0) + 1); }
    else groups.push({ sig, e, n: 1, lv, names: new Map([[e.hookName || e.hook, 1]]) });
  }
  const bundle = g => g.lv === 'ok' && g.n > 1;
  const row = g => { const e = g.e, at = parseAt(e.at), k = 'hook:' + e.key, lv = levelOf(e);
    return `<li class="act is-${lv}"${fxAttr(k)}><time${at ? ` datetime="${esc(e.at)}"` : ''}>${at ? fWhen(at, now) : '시각 없음'}</time>${sessTag(e)}
      <span class="act-say">${G[lv] || G.unknown}<span>${bundle(g) ? `검사 ${g.n}건을 통과했습니다.` : `${hookSay(e)}${g.n > 1 ? ` <b class="times">${g.n}번 연속</b>` : ''}`}</span>${freshTag(k)}</span>
      <span class="act-id">${bundle(g) ? [...g.names].map(([n, c]) => `${esc(n)} ${c}`).join(' · ') : `${e.say ? hookId(e) : ''}${e.detail && g.n === 1 ? `${e.say ? ' · ' : ''}<span class="mono" title="${esc(e.detail)}">${esc(e.detail)}</span>` : ''}`}</span></li>`; };
  const SHOW = 10;
  const flow = groups.length ? `<ol class="acts" data-list="hooks">${groups.slice(0, SHOW).map(row).join('')}</ol>${groups.length > SHOW ? fold('hooks-more', `이전 기록 ${groups.length - SHOW}묶음 더 보기`, `<ol class="acts">${groups.slice(SHOW).map(row).join('')}</ol>`) : ''}`
    : '<p class="empty">고른 조건에 맞는 기록이 없어요.</p>';
  const sum = [`<span>세션 ${num('hk-sess', H.sessions.length)}개</span>`, H.bad ? tag(`읽지 못한 줄 ${H.bad}`, 'tag-candidate') : ''].filter(Boolean).join('');
  paint(el, head(sum) + `<h3 class="sub-h">검사가 막은 작업 <span>${denies.length ? denies.length + '건' : '없음'}</span></h3>${denyHtml}
    <h3 class="sub-h">최근 흐름 <span>최신이 위</span></h3>${picks}${flow}
    <p class="area-foot">자동 검사(훅)가 남긴 기록의 마지막 ${H.lines}줄을 읽습니다${H.truncated ? '(파일 앞부분은 읽지 않음)' : ''}. 문장은 고정 사전에서 오고, 사전에 없는 판정은 기록된 글자 그대로 보입니다. ${srcLink({ path: H.path })}</p>`);
}

/* ---------- 커밋하지 않은 변경(작업 사본) ---------- */
const CHANGE = c => c === '??' ? '새 파일' : /U|AA|DD/.test(c) ? '충돌' : c.includes('R') ? '이름 바꿈' : c.includes('A') ? '추가' : c.includes('D') ? '삭제' : c.includes('M') ? '수정' : c.includes('T') ? '형식 바뀜' : c.includes('C') ? '복사' : c.trim();
const SHOW_CHANGES = 200;
function renderTree(now) {
  const el = $('#tree'), W = st.vm.worktree;
  const head = sum => `<header class="area-head"><h2 id="tree-h">브랜치와 커밋</h2><div class="area-sum">${sum}</div></header>`;
  if (W.status !== 'ok') { paint(el, head(tag('읽지 못함', 'tag-broken')) + failedBlock(W, '작업 사본을 읽지 못했어요.', '브랜치와 변경 파일 수는 미확인이고, 변경이 없다는 뜻이 아니에요.')); return; }
  const C = W.compare, headAt = parseAt(W.head.committedAt), fetched = parseAt(W.fetchedAt), n = W.changes.length;
  const kinds = new Map(); for (const c of W.changes) kinds.set(CHANGE(c.code), (kinds.get(CHANGE(c.code)) || 0) + 1);
  const say = n ? `커밋하지 않은 파일이 <b>${num('tr-n', n)}개</b> 있어요.` : '커밋하지 않은 파일이 없어요.';
  const kindLine = n ? `<p class="tree-kinds">${[...kinds].map(([k, v]) => `<span class="chip">${esc(k)} ${v}</span>`).join('')}</p>` : '';
  const sync = !C ? `<li>${G.unknown}<span>원격과 비교할 기준을 찾지 못했습니다.</span></li>`
    : `<li>${G.quiet}<span>원격(<span class="mono">${esc(C.ref)}</span>)보다 커밋 ${num('tr-ahead', C.ahead)}개 앞서 있고, ${C.behind ? `${num('tr-behind', C.behind)}개 뒤처져 있습니다` : '뒤처진 커밋은 없습니다'}.
        <small>${C.kind === 'default' ? '원격에 이 브랜치가 없어 기본 브랜치와 비교했습니다. ' : ''}원격을 마지막으로 확인한 때는 ${fetched ? `${fDate(fetched)} ${fHM(fetched)}` : '기록이 없습니다'}. 이 화면은 원격을 확인하지 않습니다.</small></span></li>`;
  /* 폴더별로 묶어 훑기 쉽게 한다 */
  const byDir = new Map();
  for (const c of W.changes.slice(0, SHOW_CHANGES)) { const i = c.path.lastIndexOf('/'), d = i >= 0 ? c.path.slice(0, i + 1) : './'; (byDir.get(d) || byDir.set(d, []).get(d)).push({ ...c, file: c.path.slice(i + 1) }); }
  const files = [...byDir].map(([d, items]) => `<li class="dir"><p class="dir-name">${esc(d).replace(/\//g, '/<wbr>')}</p><ul>${items.map(c => `<li class="chg${c.code === '??' ? ' is-new' : ''}"><span class="chg-k">${esc(CHANGE(c.code))}</span><span class="chg-p">${esc(c.from ? `${c.from} → ${c.file}` : c.file)}</span></li>`).join('')}</ul></li>`).join('');
  paint(el, head(`<span class="mono">${esc(W.branch)}</span>`)
    + `<ul class="facts">
      <li${fxAttr('tree-head')}>${G.quiet}<span>AgentDeck 저장소는 <span class="mono">${esc(W.branch)}</span> 브랜치에 있어요.${W.detached ? ' ' + tag('분리된 HEAD', 'tag-candidate') : ''} ${freshTag('tree-head')}</span></li>
      <li>${G.quiet}<span>최근 커밋 <b class="tree-commit">${esc(W.head.subject)}</b><small><span class="mono">${esc(W.head.hash)}</span> · ${headAt ? relSpan(headAt) : '시각 미확인'}</small></span></li>
      ${sync.replace('<li>', `<li${fxAttr('tree-sync')}>`)}
    </ul>
    <p class="tree-say"${fxAttr('tree-changes')}>${say}</p>${kindLine}
    ${n ? fold('tree-files', `바뀐 파일 목록 <small>${n}개</small>`, `<ul class="dirs">${files}</ul>${n > SHOW_CHANGES ? `<p class="empty">그 밖에 ${n - SHOW_CHANGES}개가 더 있어요.</p>` : ''}`) : ''}`);
}

/* ---------- 원문과 참고: 인수인계 메모(work-pin) ---------- */
const panel = (id, title, summary, body, forceOpen = false) => `<details class="pan" data-id="${esc(id)}"${forceOpen ? ' open' : isOpen(id)}><summary><span class="chev" aria-hidden="true"></span><span class="pan-t">${title}</span><span class="pan-s">${summary}</span></summary><div class="pan-body">${body}</div></details>`;
function renderPin() {
  const el = $('#pin'), pin = st.vm.pin, ptr = st.vm.pointer, M = st.vm.milestone;
  if (pin.status !== 'ok') { paint(el, panel('pin', '인수인계 메모', tag('읽지 못함', 'tag-broken'), failedBlock(pin, '인수인계 메모(work-pin)를 읽지 못했어요.', '마감 요약과 좌표는 미확인이에요. 없다는 뜻이 아니에요.'), true)); return; }
  const S = pin.summary, at = S?.stamp ? parseAt(S.stamp.text) : null;
  const field = (label, f) => `<div class="memo"><h4>${label}</h4>${f ? sents(f.parts?.length ? f.parts : [f.text]) : `<p>${tag('줄 없음', 'tag-candidate')}</p>`}</div>`;
  const sumHtml = S ? `<div${fxAttr('pin-sum')}><h3 class="pan-h">마지막 세션의 마감 요약 ${S.stamp ? `<time>${esc(S.stamp.text)}</time>` : tag('스탬프 없음', 'tag-candidate')} ${freshTag('pin-sum')}</h3>
      ${field('바뀐 것', S.changed)}${field('내린 결정', S.decided)}${field('봐야 할 것', S.watch)}${srcLink({ path: pin.path, line: S.line })}</div>`
    : `<p class="empty">${tag('절 없음', 'tag-broken')} 인수인계 메모에 「마감 요약」 절이 없어요.</p>`;
  const coord = pin.coord ? `<h3 class="pan-h">좌표 <small>항목 ${pin.coord.items.length}개</small></h3><ul class="coords" data-list="coord">${pin.coord.items.map(it => { const k = 'coord:' + (it.label || it.line), parts = it.parts?.length ? it.parts : [it.text];
      return `<li${fxAttr(k)}>${fold('coord-' + (it.label || it.line), `<b>${esc(it.label || '항목')}</b><span class="lead">${md(parts[0])}</span>${parts.length > 1 ? `<small>+${parts.length - 1}문장</small>` : ''}${freshTag(k)}`, sents(parts), 'coord')}</li>`; }).join('')}</ul>${srcLink({ path: pin.path, line: pin.coord.line })}`
    : `<p class="empty">${tag('절 없음', 'tag-broken')} 인수인계 메모에 「좌표」 절이 없어요.</p>`;
  const dir = p => p ? p.slice(0, p.lastIndexOf('/')) : null, split = ptr.status === 'ok' && dir(ptr.planPath) !== dir(ptr.workPinPath);
  const plan = `<h3 class="pan-h">계획 문서</h3><dl class="rawkv"><dt>제목</dt><dd>${M.status === 'ok' ? md(M.title) : tag('읽지 못함', 'tag-broken')}</dd><dt>상태 줄</dt><dd>${M.statusText ? md(M.statusText) : tag('상태 줄 없음', 'tag-candidate')}</dd>
    ${ptr.status === 'ok' ? `<dt>계획 위치</dt><dd>${srcLink({ path: ptr.planPath })}</dd><dt>메모 위치</dt><dd>${srcLink({ path: ptr.workPinPath })}${split ? tag('계획과 메모가 다른 폴더예요', 'tag-candidate') : ''}</dd>` : `<dt>위치</dt><dd>${esc(srcOf('pointer')?.error || '')}</dd>`}</dl>`;
  paint(el, panel('pin', '인수인계 메모', at ? `마지막 마감 요약 ${relSpan(at)}` : '세션이 다음 세션에 남긴 글', sumHtml + coord + plan));
}

/* ---------- 결정 기록(결정 대장) ---------- */
function renderLedger() {
  const el = $('#ledger'), L = st.vm.ledger;
  if (L.status !== 'ok') { paint(el, panel('ledger', '결정 기록', tag('읽지 못함', 'tag-broken'), failedBlock(L, '결정 기록을 읽지 못했어요.', '건수는 미확인이고, 0건이라는 뜻이 아니에요.'), true)); return; }
  const T = L.tally, ai = T.AI + T['AI·비가역'];
  const gate = L.gate === 'immediate' ? `${state('stopped', '막힘')}<span>되돌리기 어려운 결정을 AI가 혼자 내린 기록이 ${T['AI·비가역']}건 있어 새 워커를 띄울 수 없습니다.</span>`
    : L.gate === 'ask' ? `${state('stopped', '막힘')}<span>AI가 혼자 내린 결정(${T.AI}건)이 사용자 결정(${L.userSide}건)보다 많아 새 워커를 띄울 수 없습니다.</span>`
    : `${state('done', '정상')}<span>AI가 혼자 내린 결정(${T.AI}건)이 사용자 결정(${L.userSide}건)보다 많지 않아, 새 워커를 띄우는 데 걸림이 없습니다.</span>`;
  const cell = (label, raw, v, cls = '') => `<div class="${cls}"><dt>${label}<small>[${raw}]</small></dt><dd>${num('lg:' + raw, v)}</dd></div>`;
  const line = a => `<li class="ai-line"${fxAttr(aiKey(a))}><span class="chip">${esc(a.tag)}</span><div><p class="rawtext">${md(a.text)} ${freshTag(aiKey(a))}</p>${srcLink({ path: a.file, line: a.line })}</div></li>`;
  paint(el, panel('ledger', '결정 기록', L.gate !== 'clear' ? tag('새 워커를 띄울 수 없음', 'tag-todo') : '새 워커를 띄우는 데 걸림 없음',
    `<p class="gate"${fxAttr('ledger')}>${gate} ${freshTag('ledger')}</p>
    <dl class="tally">${cell('사용자 결정', 'USER', T.USER)}${cell('사용자 위임', 'USER·위임', T['USER·위임'])}${cell('AI 판단', 'AI', T.AI, T.AI ? 'is-ai' : '')}${cell('AI 판단 · 되돌리기 어려움', 'AI·비가역', T['AI·비가역'], T['AI·비가역'] ? 'is-ai' : '')}</dl>
    ${L.aiLines.length ? `<h3 class="pan-h">AI가 혼자 내린 결정 <small>원문 ${L.aiLines.length}줄</small></h3><ol class="list" data-list="ai">${L.aiLines.map(line).join('')}</ol>` : '<p class="empty">AI가 혼자 내린 결정이 없어요.</p>'}
    ${srcLink(L.ref)}`, L.gate !== 'clear'));
}

/* ---------- 미룬 일(Backlog) ---------- */
function renderBacklog() {
  const el = $('#backlog'), B = st.vm.backlog;
  if (B.status === 'absent') { paint(el, panel('backlog', '미룬 일', tag('없음', 'tag-rest'), `<p class="empty">${esc(srcOf('backlog')?.error || '현재 마일스톤 폴더에 Backlog 파일이 없어요.')}</p>`)); return; }
  if (B.status !== 'ok') { paint(el, panel('backlog', '미룬 일', tag('읽지 못함', 'tag-broken'), failedBlock(B, '미룬 일 목록을 읽지 못했어요.', '항목 수는 미확인이고, 0건이라는 뜻이 아니에요.'), true)); return; }
  const list = s => `<ol class="list" data-list="bl">${s.items.map(it => { const k = `bl:${s.name}:${it.num}`; return `<li class="row"${fxAttr(k)}><span class="row-num">${esc(it.num)}</span><div class="row-body"><span class="row-title">${md(it.title)}</span> ${freshTag(k)}${srcLink({ path: B.path, line: it.line })}</div></li>`; }).join('')}</ol>`;
  const body = B.sections.map(s => `<h3 class="pan-h">${esc(s.name)} <small>${s.items.length}건</small></h3>${list(s)}`).join('');
  const waiting = B.sections.filter(s => !/처리|완료/.test(s.name)).reduce((n, s) => n + s.items.length, 0);
  paint(el, panel('backlog', '미룬 일', `기다리는 항목 ${num('bl-n', waiting)}건 · 전체 ${B.count}건`, B.count ? body : '<p class="empty">번호 항목이 없어요.</p>'));
}

/* ---------- 마일스톤 ---------- */
function renderMilestones() {
  const el = $('#milestones'), M = st.vm.milestones;
  if (M.status !== 'ok') { paint(el, panel('milestones', '마일스톤 목록', tag('읽지 못함', 'tag-broken'), failedBlock(M, '마일스톤 목록을 읽지 못했어요.', '마일스톤 수는 미확인이에요.'), true)); return; }
  const row = m => `<li class="row ms-row${m.current ? ' is-current' : ''}"${fxAttr('ms:' + m.name)}><div class="row-body"><span class="row-title">${md(m.title || m.name)}</span> ${m.current ? state('current', '지금') : ''}${m.state === 'missing' ? tag('계획 문서 없음', 'tag-candidate') : m.state === 'failed' ? tag('읽기 실패', 'tag-broken') : ''} ${freshTag('ms:' + m.name)}
    <span class="row-sub">${m.statusText ? `계획 문서의 상태 줄: ${md(m.statusText)}` : m.error ? esc(m.error) : '상태 줄이 없어요.'}</span>${srcLink({ path: m.path, line: m.line })}</div></li>`;
  const cur = M.items.find(m => m.current);
  paint(el, panel('milestones', '마일스톤 목록', `${num('ms-n', M.items.length)}개${cur ? ` · 지금은 ${esc((cur.title || cur.name).split(/\s+[—·-]\s+/)[0])}` : ''}`,
    (M.items.length ? `<ol class="list" data-list="ms">${M.items.map(row).join('')}</ol>` : '<p class="empty">01_Milestones 아래에 폴더가 없어요.</p>')
    + '<p class="area-foot">상태 줄은 각 계획 문서에 적힌 글자 그대로이고, 이 화면이 해석하지 않습니다.</p>'));
}

/* ---------- 원문을 읽은 상태 ---------- */
function renderSources() {
  const vm = st.vm, failed = vm.sources.filter(s => s.status === 'failed').length;
  const status = s => s.status === 'ok' ? state('done', '읽음') : s.status === 'failed' ? tag('읽지 못함', 'tag-broken') : tag('없음', 'tag-rest');
  const rows = vm.sources.map(s => `<li class="srcrow${s.status === 'failed' ? ' is-failed' : ''}"${fxAttr('src:' + s.id)}><p><b>${esc(s.label)}</b>${status(s)}${s.collectedAt ? `<time>${fHMS(Date.parse(s.collectedAt))}</time>` : ''}</p>
    <p class="srcrow-t">${esc(s.target || '')}</p>${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}</li>`).join('');
  paint($('#sources'), panel('sources', '원문을 읽은 상태', `원문 ${num('src-n', vm.sources.length)}개${failed ? ` · ${tag(`읽지 못함 ${failed}`, 'tag-broken')}` : ' · 모두 읽음'}`,
    `<ul class="list">${rows}</ul><p class="area-foot">저장소 ${esc(vm.repo.path)} · 보기 모델 ${esc(vm.schema)} 개정 ${esc(vm.revision)} · 읽기 전용 화면이라 저장소에 쓰지 않습니다.</p>`, failed > 0));
}

/* ---------- 그리기와 시계 ---------- */
function render() {
  const now = Date.now();
  st.renderedAt = now;
  for (const fn of [renderStrip, renderBanner, renderNow, renderPhases, renderHooks, renderTree, renderPin, renderLedger, renderBacklog, renderMilestones, renderSources]) {
    try { fn(now); } catch (error) { console.error('[AgentDeck 현황판] 그리기 실패', fn.name, error); }
  }
  fillRel(now);
  /* 알림은 스냅샷마다 판정한다. 탭이 숨어 있어도 스냅샷은 그리므로 여기서 울린다 */
  try { notify(now); } catch (error) { console.error('[AgentDeck 현황판] 알림 실패', error); }
}
function markFresh(keys) {
  const areas = new Set();
  for (const k of keys) { for (const el of $$(`[data-fx="${CSS.escape(k)}"]`)) restart(el, 'is-fresh'); const a = AREA_OF(k); if (a) areas.add(a); }
  /* 바뀐 영역의 머리 선이 한 번 파랗게 지나간다 */
  for (const id of areas) { const el = document.getElementById(id); if (el) restart(el, 'is-touched'); }
}
function applySnapshot(next) {
  const before = st.prevSig || sigMap(st.vm), after = sigMap(next), now = Date.now();
  const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
  const counted = changed.filter(k => !k.startsWith('src:') && !k.startsWith('hook:'));
  const removed = [...before.keys()].filter(k => !after.has(k) && !k.startsWith('hook:') && !k.startsWith('src:')).length;
  const prevFlow = new Map((st.vm.phases.items || []).map(p => [p.num, p.flow]));
  for (const k of changed) st.changedUntil.set(k, now + 60000);
  const fresh = changed.length || removed || next.revision !== st.vm.revision;
  st.vm = next; st.prevSig = after; st.lastPushAt = now;
  if (fresh) st.lastChange = { count: counted.length + removed, hooks: changed.filter(k => k.startsWith('hook:')).length, at: now };
  render();
  try {
    if (document.hidden) for (const k of changed) st.pending.add(k); else markFresh(changed);
    /* 단계의 상태가 실제로 바뀌었을 때만 그 단계 표시가 한 번 튄다 */
    for (const p of next.phases.items || []) if (prevFlow.has(p.num) && prevFlow.get(p.num) !== p.flow) for (const el of $$(`#phase-${p.num} .step-mark, .rail-n.is-${p.flow}`)) play(el, [{ transform: 'scale(.4)', opacity: .2 }, { transform: 'scale(1.25)', opacity: 1, offset: .6 }, { transform: 'none' }], { duration: 620, easing: EASE1 });
  } catch {}
}
let beatTimer = null;
function beat() {
  clearTimeout(beatTimer); beatTimer = null;
  if (document.hidden) return;
  watchStream();
  const now = Date.now();
  /* 푸시가 없으면 1분마다 전체를 다시 그린다(시간에 묶인 판정의 안전망). 같은 내용이면 화면은 그대로다 */
  if (now - st.renderedAt >= 60000 && now - st.lastPushAt > 8000) render();
  else {
    renderStrip(now);
    /* fresh 만료와 조용함 분 수는 시간만 지나도 바뀐다. 바뀌었을 때만 「지금」을 다시 그리고, 탭 제목 배지도 함께 맞춘다.
       여기서 던지면 다음 박자 예약이 빠져 시계와 연결 감시가 멈추므로 감싼다 */
    try { const sig = nowSig(now); if (sig !== st.nowSig) { st.nowSig = sig; renderNow(now); } } catch (error) { console.error('[AgentDeck 현황판] 그리기 실패', 'renderNow', error); }
    fillRel(now);
    try { notify(now); } catch (error) { console.error('[AgentDeck 현황판] 알림 실패', error); }
  }
  beatTimer = setTimeout(beat, 1000 - Date.now() % 1000 + 10);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(beatTimer); beatTimer = null; return; }
  beat();
  if (st.pending.size) { markFresh([...st.pending]); st.pending.clear(); }
});

/* ---------- SSE 연결: 15초 ping, 45초 무응답·오류면 다시 연결, 30초 또는 5회 실패면 끊김 ---------- */
let stream = null, retryTimer = null, lastSeen = Date.now(), outage = Date.now();
function received() { lastSeen = Date.now(); outage = null; st.conn = 'connected'; st.attempt = 0; renderStrip(Date.now()); renderBanner(); pulseConn(); }
function failed() {
  stream?.close(); stream = null;
  if (outage == null) { outage = Date.now(); st.lostAt = lastSeen; }
  st.attempt++;
  st.conn = Date.now() - outage >= 30000 || st.attempt >= 5 ? 'disconnected' : 'reconnecting';
  renderStrip(Date.now()); renderBanner();
  clearTimeout(retryTimer); retryTimer = setTimeout(connect, 3000);
}
function connect() {
  clearTimeout(retryTimer); stream?.close();
  stream = new EventSource('/events');
  stream.addEventListener('snapshot', e => {
    let next;
    try { next = JSON.parse(e.data); if (next.schema !== SCHEMA) throw new Error('schema'); } catch { failed(); return; }
    received(); applySnapshot(next);
  });
  stream.addEventListener('ping', received);
  stream.onerror = failed;
}
function reconnect() { outage = Date.now(); st.attempt = 0; st.conn = 'reconnecting'; render(); connect(); }
function watchStream() {
  if (stream && Date.now() - lastSeen >= 45000) { lastSeen = Date.now(); failed(); }
  if (outage != null && Date.now() - outage >= 30000 && st.conn !== 'disconnected' && st.conn !== 'connecting') { st.conn = 'disconnected'; renderStrip(Date.now()); renderBanner(); }
}
addEventListener('pagehide', () => { clearTimeout(retryTimer); stream?.close(); });
addEventListener('pageshow', e => { if (e.persisted) reconnect(); });

/* ---------- 입력: 경로 복사, 다시 연결, 테마, 접기 상태, 세션 고르기, 자판 ---------- */
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 4200); }
function copyText(text) {
  const legacy = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; };
  return navigator.clipboard?.writeText ? navigator.clipboard.writeText(text).then(() => true, legacy) : Promise.resolve(legacy());
}
const saveOpen = () => store.set('ad-dash-open', [...st.open].slice(-200));
function openById(id) { st.open.add(id); saveOpen(); const d = $(`details[data-id="${CSS.escape(id)}"]`); if (d) d.open = true; }
const PANELS = ['pin', 'ledger', 'backlog', 'milestones', 'sources'];
function toggleAll() {
  const allOpen = PANELS.every(id => st.open.has(id));
  for (const id of PANELS) { allOpen ? st.open.delete(id) : st.open.add(id); const d = $(`details[data-id="${id}"]`); if (d) d.open = !allOpen; }
  saveOpen(); syncToggleAll();
}
function syncToggleAll() { const b = $('#toggle-all'), allOpen = PANELS.every(id => st.open.has(id)); b.textContent = allOpen ? '모두 접기' : '모두 펼치기'; b.setAttribute('aria-pressed', String(allOpen)); }
document.addEventListener('click', e => {
  const copy = e.target.closest('[data-copy]');
  if (copy) { e.preventDefault(); const text = copy.dataset.copy; copyText(text).then(ok => toast(ok ? `경로를 복사했어요: ${text}` : `복사하지 못했어요. 경로: ${text}`)); return; }
  if (e.target.closest('#reconnect')) { reconnect(); return; }
  if (e.target.closest('#toggle-all')) { toggleAll(); return; }
  const pick = e.target.closest('[data-sess]');
  if (pick) { st.sess = pick.dataset.sess === '' && !pick.querySelector('.sess') ? null : pick.dataset.sess; renderHooks(Date.now()); fillRel(Date.now()); return; }
  if (e.target.closest('[data-notable]')) { st.onlyNotable = !st.onlyNotable; renderHooks(Date.now()); fillRel(Date.now()); return; }
  const openLink = e.target.closest('[data-open]');
  if (openLink) { openById(openLink.dataset.open); syncToggleAll(); }
  const th = e.target.closest('[data-theme-set]');
  if (th) setTheme(th.dataset.themeSet);
});
document.addEventListener('toggle', e => {
  const id = e.target.dataset?.id; if (!id) return;
  e.target.open ? st.open.add(id) : st.open.delete(id); saveOpen();
  /* 다시 그릴 때 같은 내용으로 판정되도록, 접기 상태가 바뀐 영역의 기억을 지운다 */
  const host = e.target.closest('section'); if (host) painted.delete(host);
  if (PANELS.includes(id)) syncToggleAll();
  /* 펼친 내용이 살짝 내려앉는다(사용자 조작에 대한 응답) */
  if (e.target.open) play(e.target.querySelector(':scope > .fold-body, :scope > .pan-body'), [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
}, true);
const THEMES = ['system', 'light', 'dark'];
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); for (const b of $$('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)); }
function setTheme(t) { applyTheme(t); try { localStorage.setItem('ad-dash-theme', t); } catch {} }
let savedTheme = null;
try { savedTheme = localStorage.getItem('ad-dash-theme'); } catch {}
applyTheme(THEMES.includes(savedTheme) ? savedTheme : 'dark');
/* 자판: 1~5 영역 이동, t 테마, o 원문 모두 펼치기·접기. 글 입력 중이거나 보조 키와 함께면 무시한다 */
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const jump = $(`[data-jump="${CSS.escape(e.key)}"]`);
  if (jump) { e.preventDefault(); const target = $(jump.getAttribute('href')); target?.scrollIntoView({ behavior: moving() ? 'smooth' : 'auto', block: 'start' }); return; }
  if (e.key === 't') { const cur = document.documentElement.getAttribute('data-theme'); setTheme(cur === 'dark' ? 'light' : 'dark'); }
  else if (e.key === 'o') toggleAll();
});
$('#keys').innerHTML = '자판 <kbd>1</kbd>~<kbd>5</kbd> 영역 이동, <kbd>t</kbd> 밝기 바꾸기, <kbd>o</kbd> 원문 모두 펼치기';
/* 머리가 화면 밖으로 나가면 상단 띠에 한 줄 요약을 고정한다 */
if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { st.heroGone = !en.isIntersecting; renderStrip(Date.now()); }, { rootMargin: '-56px 0px 0px 0px' }).observe($('#now'));

/* ---------- 시작: 처음 열 때 한 번만 영역이 우선순위 순서로 들어온다 ---------- */
if (moving()) {
  const html = document.documentElement;
  html.classList.add('is-intro');
  setTimeout(() => html.classList.remove('is-intro'), 1400);
}
render();
syncToggleAll();
probeSound();
connect();
beat();
})();
