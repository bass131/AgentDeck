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
  if (s < 0) return '방금';
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
  m.set('decisions', J([vm.decisions?.status, vm.decisions?.sig, vm.decisions?.kept, vm.decisions?.warnings?.length]));
  return m;
}
/* 바뀐 키가 속한 영역. 그 영역의 머리 선이 한 번 파랗게 지나간다 */
const AREA_OF = k => k === 'decisions' ? 'decide' : k === 'hand' || k === 'goals' ? 'brief' : /^(milestone|focus|next)$/.test(k) ? 'now' : k.startsWith('phase') ? 'phases' : k.startsWith('hook') ? 'hooks' : k.startsWith('tree') ? 'tree'
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
/* 화면 시계가 훅 기록보다 이만큼까지 늦은 것은 지금으로 본다. 더 앞선 시각은 「시계가 어긋남」이다 */
const SKEW_MS = 5 * 60000;
const isFresh = (at, now, min = FRESH_MIN) => { const t = parseAt(at); return t != null && now - t >= -SKEW_MS && now - t < min * 60000; };
/* 기다리는 결정(결정 보드)도 「내 손이 필요한 일」 항목이다. 그래서 알림음·탭 제목 배지·띠의 손 줄·카드 색이 그대로 따라온다.
   병합 대기 줄은 병합 카드가 GitHub에서 읽은 같은 PR에 맞춘다 — 병합·닫힘이면 빠지고, 필수 검사 실패면 빨강이다(chime.js mergeHand) */
function handNow(now) {
  const base = [...(SUM().hand || []).filter(h => !h.fresh || isFresh(h.at, now, h.fresh)), ...(DEC ? DEC.decisionHand(st.vm.decisions) : [])];
  return MRG ? MRG.mergeHand(base, mg.view).hand : base;
}
const mergeNote = () => MRG ? MRG.mergeHand(SUM().hand, mg.view).note : null;
/* 병합 카드가 같은 PR을 열린 채로 보이고 있으면, 「내 손」은 사실 줄 대신 카드를 가리키는 한 줄만 둔다. 셈(배지·알림음)은 그대로다 */
const mergeFolded = () => !!(MRG && mg.view && mg.view.state === 'open' && !mg.error && mg.view.number === MRG.pendingPr(SUM().hand));
/* 알림 판단 모듈(chime.js, classic script). 없으면(옛 서버가 내준 페이지) 알림만 빠지고 화면은 그대로다 */
const CH = globalThis.AgentDeckChime || null;
/* 결정 응답의 화면 쪽 판단(같은 chime.js의 전역 AgentDeckDecide). 없으면 결정 카드를 그리지 않는다 */
const DEC = globalThis.AgentDeckDecide || null;
/* 화면 모양의 판단(같은 chime.js의 전역 AgentDeckView): 큰 카드 상태, 진척 링, 등장 대상. 없으면 예전 모양으로 그린다 */
const VIEW = globalThis.AgentDeckView || null;
/* 병합 카드의 화면 쪽 판단(같은 chime.js의 전역 AgentDeckMerge). 없으면 병합 카드를 그리지 않는다 */
const MRG = globalThis.AgentDeckMerge || null;
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
    /* 진척 낡음: 사실만 말한다. goal 문서의 [>]가 그대로인데 그 문서의 마지막 커밋 뒤에 커밋이 더 있다 */
    const sl = P.format === 'goal' ? P.goal.stale : null;
    if (sl) out.push(`진척 표시가 낡았을 수 있어요 — goal 문서의 마지막 커밋 <code class="inline">${esc(sl.commit)}</code> 뒤에 이 브랜치 커밋이 ${num('n-stale', sl.after)}개 더 있는데, 진행 중 표시는 그대로예요.`);
  }
  if (H.status === 'ok') {
    const last = H.entries.filter(e => e.deny).at(-1);
    if (last && isFresh(last.at, now)) out.push(`${relSpan(parseAt(last.at))} 자동 검사가 작업 하나를 막았어요. <a href="#hooks">${esc(last.say || `${last.hook} ${last.verdict}`)}</a>`);
  }
  const notes = out.map(html => ({ kind: 'note', html }));
  /* 읽지 못한 원문은 할 일(노랑)이 아니라 깨짐(빨강 네모)이다. 손 수준은 바꾸지 않는다 */
  const failedSrc = vm.sources.filter(s => s.status === 'failed').length;
  if (failedSrc) notes.push({ kind: 'broken', html: `원문 ${failedSrc}개를 읽지 못했어요. <a href="#sources" data-open="sources">어떤 원문인지 보기</a>` });
  /* 조용함은 맨 끝에 회색으로 둔다. 할 일이 아니라 지금 상태라서 주의 줄들과 섞지 않는다 */
  const quiet = quietNow(now);
  if (quiet != null) notes.push({ kind: 'quiet', html: `응답을 마치고 <b>${esc(quiet)}분째</b> 조용해요 <small>답을 기다리거나 배경 작업 중일 수 있어요.</small>` });
  return notes;
}
const handLevel = now => { const h = handNow(now); return h.some(x => x.level === 'stop') ? 'stop' : h.length ? 'todo' : 'ok'; };
const HAND_G = { stop: 'block', todo: 'note', ok: 'ok' };
/* 「지금」 영역 가운데 시간이 지나기만 해도 바뀌는 것(fresh 만료, 조용함 분 수). 시계가 이것이 바뀔 때만 영역을 다시 그린다 */
const nowSig = now => JSON.stringify([handNow(now).map(h => h.key ?? h.id), quietNow(now), MRG ? [mergeFolded(), mergeNote()] : null]);

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
  /* 읽은 시각은 스냅샷마다 바뀐다. 투명에서 다시 나타나면 시각이 자주 비어 보이므로, 살짝 흐려졌다 돌아오기만 한다 */
  if (collected && st.shownCollected && st.shownCollected !== vm.collectedAt) play(collected.querySelector('time'), [{ opacity: 0.55, transform: 'translateY(-30%)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE1 });
  st.shownCollected = vm.collectedAt;
  /* 머리가 화면 밖으로 나가면 띠에 「지금 하는 일」 한 줄을 고정한다.
     「내 손이 필요한 일」이 있으면 그 첫 항목(멈춤 먼저)을 바로 옆 강조 줄로 둔다. 할 일은 노랑, 멈춤은 빨강 면이다 */
  let mini = '';
  if (st.heroGone) {
    const lv = handLevel(now), d = SUM().doing, h = CH?.stripHand(handNow(now)) ?? null;
    mini = `<a class="mini" href="#now">${h ? G.quiet : G[HAND_G[lv]]}<span>${d?.text ? md(d.text) : '지금 하는 일 확인 안 됨'}</span>${!h && lv !== 'ok' ? `<b>${lv === 'stop' ? '멈춤' : '할 일 있음'}</b>` : ''}</a>`;
    if (h) mini += `<a class="mini-hand is-${h.level}" href="${h.to}" title="${esc(h.say)}">${G[HAND_G[h.level]]}<b>${h.level === 'stop' ? '멈춤' : '내 손 필요'}</b><span>${esc(h.say)}</span>${h.more ? `<small>외 ${esc(h.more)}건</small>` : ''}</a>`;
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
    const at = parseAt(a.at), live = isFresh(a.at, now), ahead = at != null && at - now > SKEW_MS;
    const past = ahead ? `마지막 활동 시각이 이 화면의 시계보다 앞서요(${esc(fWhen(at, now))}). ${esc(a.sayPast)}` : `마지막 활동은 ${relSpan(at)}이에요. ${esc(a.sayPast)}`;
    act = `<p class="q-sub${live ? ' is-live' : ' is-quiet'}">${live ? '<i class="pulse" aria-hidden="true"></i>' : G.quiet}<span>${live ? esc(a.say) : past}${live ? ` <small>${relSpan(at)}</small>` : ''}</span></p>`;
  }
  const src = [P.status === 'ok' ? (P.format === 'goal' ? 'goal 문서의 진척 단계 표시' : '계획 문서와 커밋 기록') : null,
    a ? (a.of > 1 ? `자동 검사 기록 최근 ${a.of}건 중 ${a.count}건이 ${KIND_WORD[a.kind] || a.kind}` : `자동 검사 기록의 마지막 기록(${KIND_WORD[a.kind] || a.kind})`) : null].filter(Boolean);
  const why = !d.text && d.why ? `<p class="q-sub is-quiet">${G.unknown}<span>${esc(d.why)}</span></p>` : '';
  const raw = a?.detail ? fold('raw-activity', '근거 원문', `<p class="raw-h">가장 최근 ${esc(KIND_WORD[a.kind] || '')} 기록</p><p class="rawtext mono">${esc(a.detail)}</p>${srcLink({ path: st.vm.hooks.path })}`, 'raw') : '';
  /* 큰 카드: 상태(멈춤 → 내 손 필요 → 완료 → 진행 중, 그 밖은 회색)가 옅은 면·테두리·모양·낱말 알약으로 보인다. 판단은 chime.js doingTone.
     모양은 머리말 줄 안에 두어 카드 제목과 아래 글이 같은 왼쪽 끝에서 시작한다(H8 체크리스트 7) */
  const t = VIEW ? VIEW.doingTone({ hand: handLevel(now), phases: P }) : null;
  const tone = t ? ` tone-${t.tone}` : '', enterAt = t ? ` data-enter="doing" data-state="${esc(t.tone)}"` : '';
  return `<div class="q q-doing doing-card${tone}"${fxAttr('focus')}${enterAt}>
    <div class="doing-head">${t ? `<span class="doing-glyph" aria-hidden="true">${G[t.glyph]}</span>` : ''}<h2 class="q-k">지금 하는 일</h2>${t ? `<span class="lz doing-word">${esc(t.word)}</span>` : ''}</div>
    <div class="q-a"><p class="q-line">${line}</p>${why}${act}
    <p class="q-src">근거: ${src.map(esc).join(' · ') || '없음'}</p>${raw}</div>${ringBlock(P)}</div>`;
}
/* 지금 goal의 단계 진척 링: 초록은 완료 몫, 파랑(멈춤이면 빨강)은 지금 단계 하나. 못 읽었으면 0이 아니라 빗금이다 */
function ringBlock(P) {
  if (!VIEW) return '';
  const r = VIEW.stepRing(P);
  if (!r) return `<div class="doing-ring"><figure class="ring is-unknown" aria-hidden="true"><figcaption><b>?</b></figcaption></figure><p class="ring-cap">단계 미확인</p></div>`;
  const arc = (cls, len, at) => `<circle class="${cls}" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${len} 100" stroke-dashoffset="${-at}"/>`;
  return `<div class="doing-ring" data-enter="ring" data-state="${r.done}/${r.total}/${r.now}"><figure class="ring${r.stopped ? ' is-stopped' : ''}" role="img" aria-label="${r.total}단계 중 ${r.done}개 완료">
    <svg viewBox="0 0 64 64" aria-hidden="true">${arc('ring-track', 100, 0)}${r.donePct ? arc('ring-done', r.donePct, 0) : ''}${r.nowPct ? arc('ring-now', r.nowPct, r.donePct) : ''}</svg>
    <figcaption aria-hidden="true">${num('rg-done', r.done)}<small>/ ${esc(r.total)}</small></figcaption></figure></div>`;
}
/* Orca 워커 보고 소식: 서버가 설정 inboxHandle의 우편함을 읽기만 해 싣는다. 할 일이 아니라 알림음·배지 대상이 아니다 */
const INBOX_WORD = { worker_done: '워커 완료', escalation: '에스컬레이션', question: '질문' };
function inboxBlock(now) {
  const I = st.vm.inbox;
  if (!I) return '';
  if (I.status !== 'ok') return `<div class="inbox"><h3 class="sub-h">Orca 워커 소식</h3><p class="q-sub is-quiet">${G.quiet}<span>워커 소식을 읽지 못했어요. orca와 config.local.json의 inboxHandle을 확인해 주세요.</span></p></div>`;
  if (!I.items?.length) return '';
  const at = m => { const t = parseAt(m.at); return t ? ` <time datetime="${esc(m.at)}">${esc(fWhen(t, now))}</time>` : ''; };
  return `<div class="inbox"><h3 class="sub-h">Orca 워커 소식 <span>최근 ${esc(I.items.length)}개 · 읽기만 해요</span></h3><ul>${I.items.map(m => `<li class="is-${esc(m.type)}${m.unread ? ' is-unread' : ''}"><span class="lz">${esc(INBOX_WORD[m.type] || m.type)}</span><span>${esc(m.subject)}</span>${at(m)}</li>`).join('')}</ul></div>`;
}
const NOTE_G = { quiet: () => CLOCK, broken: () => G.block, note: () => G.note };
function handBlock(now) {
  const S = SUM(), hand = handNow(now), notes = notesNow(now), lv = handLevel(now);
  /* 결정 보드 항목은 바로 위 「결정 요청」 카드가 보이므로 목록에서 빼고 그 카드를 가리키는 한 줄만 둔다(chime.js handShown).
     머리 색(lv)과 알림음·탭 제목 배지·띠의 손 줄은 결정까지 센 전체 목록(handNow) 그대로다 */
  const shown = DEC ? DEC.handShown(hand) : { facts: hand, decisions: 0, note: null };
  const toDecide = shown.note ? `<a href="#decide">${esc(shown.note)}</a>` : '';
  /* 병합 대기 항목은 바로 위 병합 카드(#merge)를 가리킨다. 카드가 같은 PR을 보이고 있으면 사실 줄을 카드 하나로 합친다 */
  /* 필수 검사가 실패한 빨강 줄은 합치지 않는다 — 멈춤 사실은 「내 손」에 그대로 보인다 */
  const folded = mergeFolded(), mergeItem = folded ? shown.facts.find(h => h.id === 'merge' && h.level !== 'stop') : null;
  const facts = mergeItem ? shown.facts.filter(h => h !== mergeItem) : shown.facts;
  const toMerge = mergeItem ? `<a href="#merge">PR ${esc(mergeItem.pr)} 병합은 위 병합 카드에서 해요</a>` : '';
  const pointers = [toMerge, toDecide].filter(Boolean), mergedNote = mergeNote();
  const more = [...pointers.map(a => `<p class="hand-more">${a}</p>`), mergedNote && facts.length ? `<p class="hand-more is-ok">${G.ok}<span>${esc(mergedNote)}</span></p>` : ''].join('');
  const items = facts.length ? `<ul class="hand-list">${facts.map(h => `<li class="is-${h.level}">${G[HAND_G[h.level]]}<div><p>${esc(h.say)}${h.id === 'merge' && MRG ? ' <a href="#merge">현황판 병합 카드</a>' : ''}</p>${h.quote ? `<p class="rawtext">「${md(clipText(h.quote, 160))}」</p>` : ''}<p class="q-src">근거: ${esc(h.source)}${h.ref ? ' ' + srcLink(h.ref) : ''}</p></div></li>`).join('')}</ul>${more}`
    : pointers.length ? `<p class="q-line is-defer">${G.note}${pointers.join(' · ')}</p>${mergedNote ? `<p class="hand-more is-ok">${G.ok}<span>${esc(mergedNote)}</span></p>` : ''}`
    : `<p class="q-line is-none">${G.ok}<span>${mergedNote ? esc(mergedNote) : '없음'}</span></p>`;
  const chores = S.chores?.length ? fold('chores', `급하지 않은 정리 일 ${S.chores.length}개 <small>인수인계 메모에 「사용자 몫」으로 적힌 문장</small>`, sents(S.chores) + (S.choresRef ? srcLink(S.choresRef) : ''), 'raw') : '';
  const noteHtml = notes.length ? `<ul class="q-notes">${notes.map(n => `<li class="is-${n.kind}">${(NOTE_G[n.kind] || NOTE_G.note)()}<span>${n.html}</span></li>`).join('')}</ul>` : '';
  st.nowSig = nowSig(now);
  return `<div class="q q-hand is-${lv}"${fxAttr('hand')}><div class="q-head"><h2 class="q-k">내 손이 필요한 일</h2>${soundState()}</div><div class="q-a">${items}${soundChip()}${noteHtml}${inboxBlock(now)}${chores}</div></div>`;
}
const GOAL_WORD = { done: '완료', current: '진행 중', draft: '초안', left: '남음', unknown: '상태 미확인' };
function whereBlock() {
  const vm = st.vm, Gs = vm.goals, P = vm.phases;
  if (Gs?.status === 'ok' && Gs.items.length) {
    const cur = Gs.items.find(g => g.current);
    const say = `goal ${Gs.total}개 중 ${Gs.done}개 완료${Gs.doing ? `, 지금 ${cur ? cur.id : Gs.doing + '개'}` : ''}, 남은 goal ${Gs.left}개${Gs.unknown ? ` (상태를 읽지 못한 goal ${Gs.unknown}개)` : ''}`;
    /* 진척 띠: 칸 하나가 goal 하나다. 숫자는 위 문장 한 곳에만 있고, 칸 이름과 PR은 title과 아래 접힘에 있다.
       지금 칸 아래에는 「… 지금」 글을 둬서 색만으로 말하지 않는다. 칸마다 화면 읽기용 상태 글이 있다 */
    const n = Gs.items.length, at = cur ? Gs.items.indexOf(cur) : -1;
    const cell = g => `<li class="bc is-${g.state}${g.current ? ' is-here' : ''}" data-enter="${esc(g.id)}" data-state="${esc(g.state)}${g.current ? '-here' : ''}" title="${esc(`${g.id} ${g.name} — ${GOAL_WORD[g.state]}${g.pr ? ` (PR ${g.pr})` : ''}`)}"><span class="sr">${esc(g.id)} ${esc(GOAL_WORD[g.state])}</span></li>`;
    const here = cur ? `<li class="bc-say ${at < n / 2 ? 'is-start' : 'is-end'}" style="grid-column:${at + 1}" aria-hidden="true">${esc(cur.id)} 지금</li>` : '';
    /* 이름 목록: 이웃과 상태가 같은 완료 줄은 모양을 빼고, 상태가 다른 줄에만 모양을 남긴다 */
    const list = fold('goal-list', 'goal 이름 모두 보기', `<ol class="goal-names">${Gs.items.map(g => `<li class="is-${g.state}">${g.state === 'done' ? '<span aria-hidden="true"></span>' : G[{ current: 'current', draft: 'current', left: 'waiting', unknown: 'unknown' }[g.state]]}<b>${esc(g.id)}</b><span>${md(g.name)}</span><small>${g.current ? '지금' : esc(GOAL_WORD[g.state])}${g.pr ? ` · PR ${esc(g.pr)}` : ''}</small></li>`).join('')}</ol>
      <p class="q-src">근거: ${esc(P.planPath ? P.planPath.slice(0, P.planPath.lastIndexOf('/') + 1) : '')} 의 goal 문서 머리말 「상태:」, 아직 파일이 없는 goal은 계획 문서의 goal 목록</p>`, 'raw');
    return `<div class="q q-where"${fxAttr('goals')}><h2 class="q-k">전체 중 어디쯤</h2><div class="q-a"><p class="band-head"><b>${md(Gs.milestoneName || vm.milestone.title || '')}</b><span>${esc(say)}</span></p>
      <ol class="band" style="--n:${n}" aria-label="마일스톤 안 goal 진행">${Gs.items.map(cell).join('')}${here}</ol>${list}</div></div>`;
  }
  /* 다중 파일 형식이거나 goal 목록을 못 읽었을 때: 단계 수로만 말한다 */
  const n = P.status === 'ok' ? P.items.length : null, done = P.status === 'ok' ? P.items.filter(p => p.flow === 'done').length : null;
  return `<div class="q q-where"${fxAttr('goals')}><h2 class="q-k">전체 중 어디쯤</h2><div class="q-a"><p class="q-line">${vm.milestone.status === 'ok' ? md(vm.milestone.title) : '마일스톤을 읽지 못했어요'}</p>
    <p class="q-sub">${n != null ? `단계 ${n}개 중 ${done}개 완료` : esc(srcOf('phases')?.error || '단계 정보를 읽지 못했어요.')}${Gs?.status === 'failed' ? ` · goal 목록을 읽지 못했어요: ${esc(srcOf('goals')?.error || '')}` : ''}</p></div></div>`;
}
/* 「지금 하는 일」 카드만 #now에 칠하고, 「내 손」과 「어디쯤」은 결정 요청 밑의 #brief에 칠한다.
   결정 영역(#decide)은 두 영역 사이에 있지만 여기서 칠하지 않는다 — 초 단위 다시 칠하기가 입력 중인 코멘트를 건드리지 않게 하려는 것이다.
   서버를 다시 켜기 전(시작할 때 읽은 옛 index.html)에도 보이도록, #brief가 없으면 결정 영역 뒤에 만든다 */
function briefBox() {
  let el = $('#brief');
  if (!el) { el = document.createElement('section'); el.className = 'brief'; el.id = 'brief'; el.setAttribute('aria-label', '내 손이 필요한 일과 전체 중 어디쯤'); ($('#decide') || $('#now')).after(el); }
  return el;
}
function renderNow(now) {
  paint($('#now'), doingBlock(now));
  paint(briefBox(), handBlock(now) + whereBlock());
  enter();
}
/* 등장 동작: 큰 카드·진척 링·goal 칩이 처음 보일 때와 상태가 바뀔 때만 한 번 움직인다.
   paint()는 글자 하나만 달라도 「지금」을 새로 쓰므로 CSS animation이 아니라, 기억한 [키, 상태]와 비교해(chime.js enterKeys) play()로 건다.
   play()는 동작 줄이기와 숨은 탭에서 아무것도 하지 않는다 */
let enterSeen = null;
function enter() {
  if (!VIEW) return;
  const els = new Map($$('#now [data-enter], #brief [data-enter]').map(el => [el.dataset.enter, el]));
  const r = VIEW.enterKeys(enterSeen, [...els].map(([k, el]) => [k, el.dataset.state || '']));
  enterSeen = r.seen;
  let i = 0;
  for (const k of r.enter) {
    const el = els.get(k);
    if (k === 'doing') play(el, [{ transform: 'scale(.98)', opacity: .55 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: EASE1 });
    else if (k === 'ring') for (const arc of $$('.ring-done, .ring-now', el)) play(arc, [{ strokeDasharray: '0 100' }, { strokeDasharray: arc.getAttribute('stroke-dasharray') }], { duration: 820, easing: EASE1 });
    else play(el, el.classList.contains('is-here') ? [{ transform: 'translateY(8px) scale(.85)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: .65 }, { transform: 'none' }]
      : [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: Math.min(i++, 20) * 28, easing: EASE1, fill: 'backwards' });
  }
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
  /* 숫자 카드: 통과는 초록, 실패는 빨강(0이면 둘 다 회색), 사용자 입력은 회색(질문일 수도 받은 답일 수도 있다) */
  const stat = (cls, label, v) => `<div class="stat ${cls}"><dt>${label}</dt><dd>${v}</dd></div>`;
  return `<span class="rec-h">검증 기록</span><dl class="stats is-rec">${stat(r.pass ? 'is-pass' : 'is-zero', '통과', num('g-pass', r.pass))}${stat(r.fail ? 'is-fail' : 'is-zero', '실패', num('g-fail', r.fail))}${stat('is-zero', '사용자 입력', num('g-ui', r.userInput))}</dl>`
    + (r.last ? `<span class="rec-last">마지막은 ${at ? relSpan(at) + ' ' : ''}${esc(markerWord(r.last.marker))}</span>` : '');
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
      <div class="goal-rec"${fxAttr('phases-rec')}>${recordLine(r, now)}${P.goal.status ? ` <small>머리말 상태: ${md(P.goal.status)}</small>` : ''}</div>${fold('raw-goal-rec', '마지막 검증 기록 원문', rawRec, 'raw')}</div>`;
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
    <p class="empty">${L.spec ? `goal 대장과 같은 폴더 마일스톤 스펙 대장의 합계예요 — 판정 장치와 같은 셈이에요. ${srcLink({ path: L.spec.file, line: L.spec.line })}` : 'goal 대장만 셌어요 — 같은 폴더에 마일스톤 스펙 대장이 없어요.'}</p>
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
  /* 첫머리 문서가 없고 goal 문서만 있는 폴더는 머리말 「상태:」가 종결인 goal 수를 보인다(collector.mjs HEAD_FILES) */
  const sub = m => m.state === 'goals' && m.goals ? `goal 문서 ${esc(m.goals.total)}개 중 ${esc(m.goals.closed)}개 종결 (첫머리 문서 없음)`
    : m.statusText ? `계획 문서의 상태 줄: ${md(m.statusText)}` : m.error ? esc(m.error) : '상태 줄이 없어요.';
  const row = m => `<li class="row ms-row${m.current ? ' is-current' : ''}"${fxAttr('ms:' + m.name)}><div class="row-body"><span class="row-title">${md(m.title || m.name)}</span> ${m.current ? state('current', '지금') : ''}${m.state === 'missing' ? tag('계획 문서 없음', 'tag-candidate') : m.state === 'failed' ? tag('읽기 실패', 'tag-broken') : ''} ${freshTag('ms:' + m.name)}
    <span class="row-sub">${sub(m)}</span>${srcLink({ path: m.path, line: m.line })}</div></li>`;
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
    `<ul class="list">${rows}</ul><p class="area-foot">저장소 ${esc(vm.repo.path)} · 보기 모델 ${esc(vm.schema)} 개정 ${esc(vm.revision)} · 이 화면은 저장소에 쓰지 않습니다. 쓰기는 결정 응답(메인 입력창에 글 넣기)과 병합 카드(확인 창을 거친 PR 병합)뿐입니다.</p>`, failed > 0));
}

/* ---------- 결정이 필요한 일: 결정 카드와 보낼 문장 (docs/결정-응답.md) ----------
   문장은 서버가 id와 키로 만든다(POST /api/answer/preview). 페이지는 받은 문장을 보이기만 하고, 「넣기」는 서버가 메인 입력창에 글만 넣는다.
   Enter는 누르지 않는다. 카드는 「지금」 밖의 자기 영역(#decide)에만 칠한다. 「지금」의 초 단위 다시 칠하기가 입력 중인 코멘트를 건드리지 않게 하려는 것이다.
   카드 목록은 다시 칠하기 키(listKey = chime.js cardsKey: 목록 서명·읽기 상태·고름·상세 글·경고 글)가 바뀔 때만 다시 칠하고,
   그때도 입력 중인 칸과 커서를 되돌린다. 코멘트를 치는 동안에는 「보낼 문장」 칸만 바뀐다 */
const dec = { picks: new Map(), comments: new Map(), preview: null, result: null, seq: 0, timer: null, listKey: null };
const decList = () => { const D = st.vm.decisions; return D && Array.isArray(D.items) ? D : { status: 'absent', items: [], sig: null, warnings: [] }; };
const CHECK = svg('<path d="m3.5 8.4 3 3 6-6.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 'g-check');
/* 상세 글: `## 제목`, `- 목록`, 빈 줄, 일반 문단만 읽는다. 글은 이스케이프하고 굵게와 인라인 코드만 살린다 */
function detailHtml(lines) {
  let html = '', list = false;
  const close = () => { if (list) { html += '</ul>'; list = false; } };
  for (const l of lines) {
    const t = String(l).trim();
    if (!t) { close(); continue; }
    if (t.startsWith('## ')) { close(); html += `<h4>${md(t.slice(3))}</h4>`; continue; }
    if (t.startsWith('- ')) { if (!list) { html += '<ul class="dec-points">'; list = true; } html += `<li>${md(t.slice(2))}</li>`; continue; }
    close(); html += `<p>${md(t)}</p>`;
  }
  close();
  return html;
}
function decisionCard(d, i) {
  const pick = dec.picks.get(d.id) ?? null, commentOn = pick === 'C';
  const opt = (key, label, effect, rec) => `<button type="button" class="dec-opt${key === 'C' ? ' dec-opt-c' : ''}" data-pick="${esc(d.id)}" data-key="${esc(key)}" aria-pressed="${pick === key}">
    <span class="dec-key">${pick === key ? CHECK : esc(key)}</span><span class="dec-body"><span class="dec-label">${esc(label)}${rec ? '<span class="dec-rec">추천</span>' : ''}</span>${effect ? `<span class="dec-effect">${esc(effect)}</span>` : ''}</span></button>`;
  const opts = (d.options || []).map(o => opt(o.key, o.label, o.effect, d.recommended === o.key)).join('') + opt('C', '코멘트', '직접 쓴 글을 이 결정의 답으로 보낸다.', false);
  const editor = commentOn ? `<label class="dec-comment"><span>C 코멘트 <small>300자까지, 줄바꿈은 공백이 돼요</small></span><input type="text" maxlength="300" data-comment="${esc(d.id)}" value="${esc(dec.comments.get(d.id) ?? '')}" placeholder="이 결정에 보낼 말" autocomplete="off"></label>` : '';
  const detail = d.detail?.length ? fold('dec-detail-' + d.id, '상세 글 — 무엇을, 왜, 어떻게, 추천', `<div class="dec-detail-body">${detailHtml(d.detail)}</div>`, 'raw dec-detail') : '';
  return `<article class="dec${pick ? ' is-picked' : ''}" id="dec-${esc(d.id)}">
    <header class="dec-head"><span class="dec-n">${i + 1}</span><h3>${esc(d.title)}</h3>${d.recommended ? `<span class="dec-rec-head">추천 ${esc(d.recommended)}</span>` : ''}</header>
    ${d.pr ? `<p class="q-src">관련 PR ${esc(d.pr)}</p>` : ''}
    <div class="dec-opts" role="group" aria-label="${esc(d.title)} 선택지">${opts}</div>
    ${editor}${pick ? `<button type="button" class="ghost dec-clear" data-dec-clear="${esc(d.id)}">선택 지우기</button>` : ''}${detail}</article>`;
}
function sendBox() {
  const p = dec.preview, canType = !!st.vm.answer?.canType, picked = dec.picks.size > 0, res = dec.result;
  let line;
  if (!picked) line = '<p class="send-hint">선택지를 누르면 여기에 보낼 문장이 나와요.</p>';
  else if (!p || p.pending) line = '<p class="send-hint">문장을 만드는 중이에요…</p>';
  else if (p.refusal) line = `<p class="send-refusal">${G.note}<span>${esc(p.refusal)}</span></p>`;
  else line = `<p class="send-line">${esc(p.text)}</p>`;
  const ready = !!(p && !p.pending && p.text && !p.refusal);
  const result = !res ? '' : res.phase === 'sending' ? '<p class="send-result">넣는 중이에요…</p>'
    : res.phase === 'inserted' ? `<p class="send-result is-done">${G.ok}<span>메인 입력창${res.terminal ? `(「${esc(res.terminal)}」)` : ''}에 넣었어요. 메인 pane에서 Enter를 눌러야 전달돼요.${res.note ? ' ' + esc(res.note) : ''}</span></p>`
    : res.phase === 'clipboard' ? `<p class="send-result is-todo">${G.note}<span>${res.reason ? esc(res.reason) + ' ' : ''}문장을 복사했어요. 메인 입력창에 붙여 넣고 Enter를 눌러 주세요.</span></p>`
    : res.phase === 'manual' ? `<p class="send-result is-todo">${G.note}<span>${res.reason ? esc(res.reason) + ' ' : ''}복사하지 못했어요. 아래 글을 직접 복사해 주세요.</span></p><textarea class="send-manual" readonly rows="2">${esc(res.line)}</textarea>`
    : `<p class="send-result is-todo">${G.note}<span>${esc(res.reason)}</span></p>`;
  return `<h3 class="sub-h">보낼 문장</h3>${line}
    <div class="send-actions">${canType ? `<button type="button" class="btn" data-dec-send${ready && res?.phase !== 'sending' ? '' : ' disabled'}>메인 입력창에 넣기</button>` : ''}<button type="button" class="ghost" data-dec-copy${ready ? '' : ' disabled'}>복사</button>${picked || dec.comments.size ? '<button type="button" class="ghost" data-dec-clear-all>모두 지우기</button>' : ''}</div>
    <p class="send-note">${canType ? '넣기는 메인 입력창에 글만 넣어요. 전달은 메인 pane에서 Enter를 눌러야 해요.' : '설정에 메인 handle이 없어 넣기 대신 복사만 할 수 있어요. 복사한 문장을 메인 입력창에 붙여 넣어 주세요.'}</p>${result}`;
}
function restoreFocus(id, sel) {
  if (id == null) return;
  const input = $(`[data-comment="${CSS.escape(id)}"]`);
  if (!input) return;
  input.focus();
  try { input.setSelectionRange(sel[0], sel[1]); } catch {}
}
function renderDecide() {
  const box = $('#decide');
  if (!box) return;
  const D = decList(), items = D.items;
  /* 결정 요청은 「지금 하는 일」 바로 밑 자리에 늘 있다. 기다리는 결정이 없으면 머리말 한 줄(is-empty)로 조용히 둔다 */
  box.hidden = !DEC;
  if (!DEC) { dec.listKey = null; return; }
  const empty = !(items.length > 0 || D.status === 'failed' || (D.warnings || []).length > 0 || !!dec.result);
  box.classList.toggle('is-empty', empty);
  paint($('#decide-sum'), `<span>${items.length ? `${num('dec-n', items.length)}건이 답을 기다려요` : '기다리는 결정이 없어요'}</span>${D.status === 'failed' ? tag(D.kept ? '보드를 읽지 못해 직전 목록이에요' : '보드를 읽지 못했어요', 'tag-broken') : ''}`);
  const listKey = DEC.cardsKey(D, dec.picks);
  if (listKey !== dec.listKey) {
    const active = document.activeElement, focusId = active?.dataset?.comment ?? null, sel = focusId != null ? [active.selectionStart, active.selectionEnd] : null;
    const failed = D.status === 'failed' ? `<p class="dec-warn">${G.block}<span>${esc(srcOf('decisions')?.error || '결정 보드를 읽지 못했어요.')}${D.kept ? ' 화면은 직전에 읽은 목록이에요.' : ''}</span></p>` : '';
    const warn = D.warnings?.length ? fold('dec-warn', `보드 경고 ${D.warnings.length}개 <small>모양이 틀려 빼거나 고쳐 읽은 칸</small>`, `<ul class="sents">${D.warnings.map(w => `<li><b>${esc(w.where)}</b> ${esc(w.what)}</li>`).join('')}</ul>${srcLink({ path: D.path })}`, 'raw') : '';
    paint($('#decide-list'), failed + (items.length ? `<div class="dec-list">${items.map(decisionCard).join('')}</div>` : '') + warn);
    dec.listKey = listKey;
    restoreFocus(focusId, sel);
  }
  paint($('#decide-send'), items.length || dec.result ? sendBox() : '');
}
async function postAnswer(kind, expect) {
  const D = decList();
  const r = await fetch('/api/answer/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dashboard-Token': BOOT.token }, body: JSON.stringify(DEC.answerBody(D.sig, dec.picks, dec.comments, expect)) });
  try { return await r.json(); } catch { return { ok: false, reason: `서버가 읽을 수 없는 답을 줬어요 (${r.status}).` }; }
}
/* 고름이나 코멘트가 바뀌면 150ms 뒤 서버에 문장을 묻는다. 늦게 온 앞 답은 버린다(seq) */
function schedulePreview() {
  clearTimeout(dec.timer);
  dec.preview = dec.picks.size ? { pending: true } : null;
  renderDecide();
  if (!dec.picks.size) return;
  const seq = ++dec.seq;
  dec.timer = setTimeout(async () => {
    let r;
    try { r = await postAnswer('preview'); } catch { r = { ok: false, reason: '서버에 닿지 못했어요. 연결을 확인해 주세요.' }; }
    if (seq !== dec.seq) return;
    dec.preview = r.ok ? { text: r.line } : { refusal: r.reason || '문장을 만들지 못했어요.', stale: !!r.stale };
    renderDecide();
  }, 150);
}
/* 넣기: 서버가 넣지 못했거나(handle 없음) 넣기가 실패하면 받은 문장을 복사로 넘긴다. 서버는 다시 시도하지 않는다 */
async function sendLine() {
  // 「보낼 문장」 칸에 보인 문장만 보낸다. 미리보기가 없거나 기다리는 중이면 아무것도 하지 않는다(서버도 expect가 다르면 409)
  if (!dec.preview || dec.preview.pending || !dec.preview.text) return;
  const shown = dec.preview.text, ids = [...dec.picks.keys()], pending = { phase: 'sending', ids };
  dec.result = pending; renderDecide();
  let r;
  try { r = await postAnswer('send', shown); } catch { r = { ok: false, copy: true, line: dec.preview?.text ?? '', reason: '서버에 닿지 못했어요. 메인 입력창을 먼저 확인해 주세요.' }; }
  if (dec.result !== pending) return;
  /* 서버가 고쳐 고름 표지를 붙여 넣었으면(corrected) note가 앞 문장이 입력창에 남아 있을 수 있다고 알린다 */
  if (r.ok) dec.result = { phase: 'inserted', line: r.line, note: r.note || '', terminal: typeof r.terminal === 'string' ? r.terminal : '', ids };
  else if (r.copy && r.line) {
    const ok = await copyText(r.line);
    if (dec.result !== pending) return;
    dec.result = { phase: ok ? 'clipboard' : 'manual', line: r.line, reason: r.reason, ids };
  } else dec.result = { phase: 'refused', reason: r.reason || '이유를 모르는 거절이에요.', ids };
  if (r.stale) schedulePreview();
  renderDecide();
  if (dec.result?.phase === 'manual') $('#decide .send-manual')?.select();
}
/* 새 목록에 고른 답을 맞춘다. prev는 바뀌기 전 목록이다 — 같은 키라도 선택지 글이 바뀐 고름을 버린다.
   답한 결정이 모두 목록에서 빠지면 결과 줄도 지운다 */
function decReconcile(prev) {
  if (!DEC) return;
  const items = decList().items, r = DEC.reconcilePicks(items, dec.picks, dec.comments, prev);
  dec.picks = r.picks; dec.comments = r.comments;
  if (dec.result && dec.result.phase !== 'sending' && !dec.result.ids.some(id => items.some(d => d.id === id))) { dec.result = null; toast('답한 결정이 목록에서 정리됐어요.'); }
  /* 토스트는 앞 것을 덮으므로 두 알림을 한 번에 보인다 */
  const notes = [r.dropped.length ? `지금 고를 수 없게 된 선택을 지웠어요: ${r.dropped.join(', ')}` : '',
    r.changed.length ? `선택지 글이 바뀌어 고른 것을 지웠어요. 바뀐 글을 읽고 다시 골라 주세요: ${r.changed.join(', ')}` : ''].filter(Boolean);
  if (notes.length) toast(notes.join(' · '));
  if (!dec.picks.size) dec.preview = null;
}

/* ---------- 병합 카드 (docs/병합.md) ----------
   「내 손이 필요한 일」의 병합 대기 PR(judgeHand의 pr 칸)을 번호가 바뀔 때 한 번 불러오고, 다른 PR은 번호 칸으로 불러온다.
   카드는 머리 SHA·필수 검사·막는 이유·「꼭 볼 것」(파일마다 접힌 diff)을 보인다. 꼭 볼 것을 모두 펼친 뒤에만 「병합」이 켜진다.
   펼친 기록은 메모리에만 둔다(PR·머리 SHA·경로 — chime.js fileKey). 접기 상태 저장(fold·data-id·localStorage)을 타지 않는다.
   「병합」은 서버에 PR 번호와 보인 머리 SHA만 보낸다. 서버가 띄우는 Windows 확인 창에서 사람이 「병합」을 눌러야 병합이 나간다.
   카드는 자기 영역(#merge)에만, 내용이 바뀔 때만 칠한다(cardKey). 「지금」의 초 단위 다시 칠하기가 펼친 diff를 접지 않게 하려는 것이다 */
/* 열린 PR 목록은 카드 위에 있다. 요약만 보이고, 항목을 누르면 번호 칸과 같은 길(loadMerge)로 카드가 그 PR을 읽는다.
   목록은 처음 그릴 때, 「목록 새로 읽기」, 병합 결과 뒤에만 읽는다(스냅샷마다 gh를 부르지 않는다). 목록의 SHA는 보이기만 하고 병합에 쓰지 않는다 */
const mg = { pr: null, view: null, loading: false, error: null, running: false, spent: false, result: null, opened: new Set(), expanded: new Set(), autoFor: null, manual: false, cardKey: null, seq: 0,
  list: null, listSeq: 0, listAsked: false, listLoading: false };
const MERGE_SKELETON = `<header class="decide-head merge-head"><h2 class="q-k" id="merge-h">병합</h2><div class="area-sum" id="merge-sum"></div>
  <label class="mg-load"><span>목록에 없는 PR</span><input type="text" inputmode="numeric" maxlength="10" placeholder="번호" data-merge-num autocomplete="off"><button type="button" class="ghost" data-merge-load>불러오기</button></label></header>
  <div class="mg-list-box" id="merge-list"></div><div id="merge-card"></div><div class="mg-act" id="merge-act" aria-live="polite"></div>`;
function mergeBox() {
  let el = $('#merge');
  if (!el) { el = document.createElement('section'); el.className = 'merge'; el.id = 'merge'; el.setAttribute('aria-labelledby', 'merge-h'); ($('#decide') || $('#now')).after(el); }
  if (!el.querySelector('#merge-card') || !el.querySelector('#merge-list')) el.innerHTML = MERGE_SKELETON;
  return el;
}
async function postMerge(kind, body) {
  const r = await fetch('/api/merge/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dashboard-Token': BOOT.token }, body: JSON.stringify(body) });
  try { return await r.json(); } catch { return { ok: false, reason: `서버가 읽을 수 없는 답을 줬어요 (${r.status}).` }; }
}
const mergeKey = (v, path) => MRG.fileKey(v.number, v.headSha, path);
function mergeFiles(v) {
  if (!v.mustSee.length) return `<p class="q-sub">${G.ok}<span>꼭 볼 것 경로(.claude/·헌법·게이트 상태·CI 작업 흐름·package.json scripts)를 건드리지 않았어요.</span></p>`;
  return `<h3 class="sub-h">꼭 볼 것 ${esc(v.mustSee.length)}개 <span>모두 펼쳐 본 뒤에 「병합」이 켜져요</span></h3><ul class="mg-files">${v.mustSee.map(m => {
    const k = mergeKey(v, m.path), seen = mg.opened.has(k);
    const inner = m.patch != null
      ? `<pre class="mg-patch">${MRG.patchRows(m.patch).map(row => `<span class="mg-l is-${row.kind}">${esc(row.text) || ' '}</span>`).join('')}</pre>`
      : `<p class="q-sub">${G.note}<span>diff가 크거나 이름만 바뀌어 GitHub가 내용을 주지 않았어요. <a href="${esc(m.diffUrl)}" target="_blank" rel="noopener noreferrer" data-merge-link="${esc(m.path)}">GitHub에서 이 파일의 diff 열기</a>를 누르면 본 것으로 쳐요.</span></p>`;
    return `<li><details class="fold raw mg-file${seen ? ' is-seen' : ''}" data-merge-file="${esc(m.path)}"${mg.expanded.has(k) ? ' open' : ''}><summary><span class="chev" aria-hidden="true"></span>${seen ? G.ok : G.note}<code class="inline">${esc(m.path)}</code>${m.previousPath ? `<small>옛 경로 ${esc(m.previousPath)}</small>` : ''}<small>${esc(m.why)}${seen ? ' · 봤음' : ''}</small></summary><div class="fold-body">${inner}</div></details></li>`;
  }).join('')}</ul>`;
}
function mergeCard() {
  if (mg.error) return `<p class="send-refusal">${G.note}<span>${esc(mg.error)}</span></p>`;
  const v = mg.view;
  if (!v) return mg.loading ? `<p class="send-hint">PR #${esc(mg.pr)}을 읽는 중이에요…</p>` : '';
  /* 닫힌 PR은 한 줄과 「카드 닫기」만 — diff·필수 검사가 병합 영역을 차지하지 않게 */
  if (v.state !== 'open') return `<p class="q-sub is-quiet">${G.quiet}<span>${esc(MRG.closedLine(v))}</span> <button type="button" class="ghost" data-merge-close>카드 닫기</button></p>`;
  const link = /^https:\/\/github\.com\//.test(v.url || '') ? ` <a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">GitHub에서 보기</a>` : '';
  const checks = v.checks?.length ? `<ul class="mg-checks">${v.checks.map(c => { const s = MRG.checkState(c.result); return `<li>${state(s.kind, s.word)}<code class="inline">${esc(c.name)}</code></li>`; }).join('')}</ul>` : '';
  const reasons = v.reasons?.length ? `<ul class="mg-reasons">${v.reasons.map(r => `<li>${G.note}<span>${esc(r)}</span></li>`).join('')}</ul>` : '';
  const notes = (v.notes || []).map(n => `<p class="q-sub is-quiet">${G.quiet}<span>${esc(n)}</span></p>`).join('');
  return `<article class="mg${v.canMerge ? ' is-ready' : ''}">
    <header class="dec-head"><span class="dec-n">#${esc(v.number)}</span><h3>${esc(v.title)}</h3>${link}</header>
    <p class="mg-meta"><code class="inline">${esc(v.baseRef)}</code> ← <code class="inline">${esc(v.headRef)}</code> · 머리 SHA <code class="inline" title="${esc(v.headSha)}">${esc(MRG.shortSha(v.headSha))}</code> · 바뀐 파일 ${esc(v.files)}개${mg.loading ? ' · 다시 읽는 중…' : ''}</p>
    <h3 class="sub-h">필수 검사</h3>${checks}${notes}${reasons}${mergeFiles(v)}</article>`;
}
function mergeAction() {
  const v = mg.view;
  /* 읽기에 실패해도(카드 없음) 번호가 있으면 「다시 읽기」를 남긴다 — 자동 불러오기는 번호가 바뀔 때만 다시 돈다 */
  if (!mg.pr) return '';
  if (v && v.state !== 'open') return '';
  const gate = MRG.mergeGate(v, mg.opened, { running: mg.running, spent: mg.spent });
  const wait = mg.running ? `<p class="send-result is-todo">${G.note}<span>바탕화면의 확인 창에서 병합을 눌러 주세요. 창에 보이는 머리 SHA와 꼭 볼 것 파일이 이 카드와 같은지 확인하세요. 고르지 않으면 창이 저절로 닫히고 병합하지 않아요.</span></p>` : '';
  const r = mg.result ? MRG.resultLine(mg.result) : null;
  const res = r ? `<p class="send-result is-${r.level === 'ok' ? 'done' : 'todo'}">${r.level === 'ok' ? G.ok : G.note}<span>${esc(r.text)}</span></p>` : '';
  /* 「다시 읽기」는 읽는 동안 끄지 않고 aria-disabled로만 알린다 — 꺼지면 키보드 초점이 페이지로 떨어진다. 누름은 클릭 처리에서 거른다.
     보낸 뒤의 결과 줄이 있으면 「이미 요청했어요」 이유 줄은 같은 뜻이라 빼고 한 줄만 둔다 */
  const reloadOff = !(mg.pr && !mg.loading && !mg.running);
  const why = v && gate.why && !mg.running && !(mg.spent && r) ? `<p class="send-note">${esc(gate.why)}</p>` : '';
  return `<div class="send-actions">${v ? `<button type="button" class="btn" data-merge-run${gate.ready ? '' : ' disabled'}>병합</button>` : ''}<button type="button" class="ghost" data-merge-reload aria-disabled="${reloadOff}">다시 읽기</button></div>
    ${why}${wait}${res}
    <p class="send-note">병합은 서버가 띄우는 Windows 확인 창에서 「병합」을 눌러야 나가요. 이 화면의 단추만으로는 병합하지 않아요.</p>`;
}
function renderMerge() {
  const old = $('#merge');
  if (!MRG) { if (old) old.hidden = true; return; }
  const box = mergeBox();
  /* 병합 대기 PR이 새로 보이면 한 번 불러온다. 사용자가 번호로 다른 PR을 불렀으면 덮지 않는다 */
  const want = MRG.pendingPr(SUM().hand);
  /* 번호가 바뀌면 목록도 다시 읽는다 — 새 PR이 목록에 이미 있어도 목록의 SHA·제목이 낡았을 수 있다 */
  if (want !== mg.autoFor) {
    mg.autoFor = want;
    if (want && !mg.manual && !mg.running && mg.pr !== want) void loadMerge(want, false);
    if (mg.listAsked && !mg.listLoading) void loadPrList();
  }
  /* 다른 곳에서 병합·닫힌 PR의 카드를 내리거나 다시 읽는다(chime.js cardFate) */
  const fate = MRG.cardFate({ cardPr: mg.pr, manual: mg.manual, pending: want, running: mg.running, list: mg.list, open: !mg.view || mg.view.state === 'open' });
  if (fate === 'drop') dropCard();
  else if (fate === 'reread' && !mg.loading && mg.rereadFor !== `${mg.pr}:${mg.listSeq}`) { mg.rereadFor = `${mg.pr}:${mg.listSeq}`; void loadMerge(mg.pr, mg.manual); }
  box.classList.toggle('is-empty', !mg.view && !mg.loading && !mg.error && !mg.result);
  /* 목록은 처음 그릴 때 한 번 읽는다. 그 뒤는 「목록 새로 읽기」와 병합 결과 뒤에만 */
  if (!mg.listAsked) { mg.listAsked = true; void loadPrList(); }
  /* 병합 대기 PR이 목록에 없으면(목록을 읽은 뒤 새 PR이 생김) 그 번호에 한 번 다시 읽는다 */
  else if (want && mg.list?.ok && !mg.list.items.some(i => i.number === want) && mg.listMissFor !== want && !mg.listLoading) { mg.listMissFor = want; void loadPrList(); }
  renderPrList();
  paint($('#merge-sum'), mg.view ? `<span>PR ${esc(mg.view.number)} · ${mg.view.state !== 'open' ? (mg.view.merged ? '병합됐어요' : '병합 없이 닫혔어요') : mg.view.canMerge ? '병합 조건을 채웠어요' : '병합 조건을 채우지 못했어요'}</span>`
    : `<span>${want ? `병합 대기 PR ${esc(want)}` : '병합을 기다리는 PR이 없어요. 목록에서 고르거나 번호로 불러올 수 있어요'}</span>`);
  const v = mg.view, key = JSON.stringify([mg.pr, v, mg.loading, mg.error, v ? v.mustSee.filter(m => mg.opened.has(mergeKey(v, m.path))).map(m => m.path) : []]);
  if (key !== mg.cardKey) { paint($('#merge-card'), mergeCard()); mg.cardKey = key; }
  const act = $('#merge-act'), f = document.activeElement && act.contains(document.activeElement) ? document.activeElement : null;
  const fSel = f?.matches?.('[data-merge-reload]') ? '[data-merge-reload]' : f?.matches?.('[data-merge-run]') ? '[data-merge-run]' : null;
  if (paint(act, mergeAction()) && fSel) act.querySelector(fSel)?.focus({ preventScroll: true });
  /* 카드가 읽은 PR이 「내 손」의 병합 대기 줄을 바꾼다(mergeHand·mergeFolded). 바뀌었을 때만 「지금」과 배지를 다시 맞춘다 */
  const now = Date.now();
  if (nowSig(now) !== st.nowSig) { renderNow(now); renderStrip(now); notify(now); }
}
/* 카드를 내린다. 늦게 온 읽기가 내린 카드를 되살리지 않게 순번을 올린다 */
function dropCard() {
  mg.seq++;
  Object.assign(mg, { pr: null, view: null, loading: false, error: null, result: null, spent: false, manual: false });
}
async function loadMerge(n, manual) {
  const seq = ++mg.seq;
  if (mg.view && mg.view.number !== n) mg.view = null;
  Object.assign(mg, { pr: n, manual, loading: true, error: null, result: null });
  renderMerge();
  let r;
  try { r = await postMerge('read', { pr: n }); } catch { r = { ok: false, reason: '서버에 닿지 못했어요. 연결을 확인해 주세요.' }; }
  if (seq !== mg.seq) return;
  mg.loading = false;
  /* 읽기에 실패하면 옛 카드를 남기지 않는다(옛 머리 SHA로 단추가 켜져 있지 않게) */
  if (r?.ok && r.pr && Array.isArray(r.pr.mustSee)) {
    mg.view = r.pr; mg.spent = false;
    /* 목록 행의 SHA가 카드와 다르면(그 사이 push) 목록이 낡은 것이다 — 다시 읽어 나란히 다른 값이 보이지 않게 한다 */
    const row = mg.list?.ok ? mg.list.items.find(i => i.number === r.pr.number) : null;
    if (row && row.sha !== r.pr.headSha && !mg.listLoading) void loadPrList();
  }
  else { mg.view = null; mg.error = r?.reason || 'PR을 읽지 못했어요.'; }
  renderMerge();
}
function loadFromInput() {
  const n = MRG.parsePrInput($('[data-merge-num]')?.value);
  if (!n) { toast('PR 번호를 숫자로 넣어 주세요.'); return; }
  if (!mg.running) void loadMerge(n, true);
}
/* 목록 항목: 번호 칸과 같은 길로 부른다. 확인 창이 떠 있는 동안(running)은 카드를 바꾸지 않는다 */
function pickFromList(btn) {
  const n = MRG.parsePrInput(btn?.dataset.mergePick);
  if (!n) return;
  if (mg.running) { toast('확인 창을 먼저 닫아 주세요.'); return; }
  void loadMerge(n, true);
}
async function loadPrList() {
  const seq = ++mg.listSeq;
  mg.listLoading = true;
  renderPrList();
  let r;
  try { r = await postMerge('list', {}); } catch { r = { ok: false, reason: '서버에 닿지 못했어요. 연결을 확인해 주세요.' }; }
  if (seq !== mg.listSeq) return;
  mg.listLoading = false;
  mg.list = r?.ok && Array.isArray(r.items) ? { ok: true, items: r.items, more: r.more === true, dropped: Number(r.dropped) || 0 }
    : { ok: false, reason: r?.reason || '열린 PR 목록을 읽지 못했어요.' };
  renderPrList();
}
/* 고른 항목은 카드에 연 PR에서 정한다(chime.js pickedPr). paint는 innerHTML을 바꾸므로, 목록의 스크롤 자리와 누른 단추의 초점을 되살린다 */
function renderPrList() {
  const box = $('#merge-list');
  if (!box) return;
  const L = mg.list, ok = !!L?.ok, n = ok ? L.items.length : 0;
  const say = mg.listLoading ? '읽는 중…' : !ok || !n ? '' : `먼저 연 PR부터 · ${n > MRG.LIST_SCROLL_AFTER ? '목록 안에서 스크롤해요 · ' : ''}고르면 아래 카드가 그 PR을 읽어요`;
  const head = `<div class="mg-list-head"><h3 class="sub-h">열린 PR${ok ? ` ${esc(n)}개${L.more ? ' 넘게' : ''}` : ''} <span>${esc(say)}</span></h3><button type="button" class="ghost" data-merge-list-reload aria-disabled="${mg.listLoading}">목록 새로 읽기</button></div>`;
  let body = '';
  if (ok) {
    body = MRG.prListHtml(L.items, { esc, picked: MRG.pickedPr(L.items, mg.pr, MRG.pendingPr(SUM().hand)) });
    if (L.more) body += `<p class="send-note">열린 PR이 50개보다 많아요. 50개까지만 보여요 — 나머지는 번호로 불러오세요.</p>`;
    if (L.dropped) body += `<p class="send-note">꼴이 맞지 않는 PR ${esc(L.dropped)}개는 목록에서 뺐어요.</p>`;
  } else if (L) body = `<p class="send-refusal">${G.note}<span>${esc(L.reason)} 번호로는 그대로 불러올 수 있어요.</span></p>`;
  else if (mg.listLoading) body = '<p class="send-hint">열린 PR 목록을 읽는 중이에요…</p>';
  const ul = box.querySelector('.mg-list'), top = ul ? ul.scrollTop : 0;
  const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
  const fSel = f?.dataset?.mergePick ? `[data-merge-pick="${f.dataset.mergePick}"]` : f?.matches?.('[data-merge-list-reload]') ? '[data-merge-list-reload]' : null;
  if (!paint(box, head + body)) return;
  const nu = box.querySelector('.mg-list');
  if (nu) nu.scrollTop = top;
  if (fSel) box.querySelector(fSel)?.focus({ preventScroll: true });
}
/* 펼친 기록: patch가 있는 파일은 접힘을 펼칠 때, patch가 없는 파일은 GitHub diff 링크를 누를 때 본 것으로 친다 */
function markOpened(path) {
  if (!mg.view || !mg.view.mustSee.some(m => m.path === path)) return;
  mg.opened.add(MRG.fileKey(mg.view.number, mg.view.headSha, path));
  renderMerge();
}
function mergeToggled(det) {
  const v = mg.view, path = det.dataset.mergeFile, m = v?.mustSee.find(x => x.path === path);
  if (!m) return;
  const k = mergeKey(v, path);
  if (det.open) mg.expanded.add(k); else mg.expanded.delete(k);
  if (det.open && m.patch != null) markOpened(path);
}
async function runMerge() {
  const v = mg.view;
  if (!v || !MRG.mergeGate(v, mg.opened, { running: mg.running, spent: mg.spent }).ready) return;
  mg.running = true; mg.result = null; renderMerge();
  let r;
  try { r = await postMerge('run', { pr: v.number, sha: v.headSha }); } catch { r = { ok: false, status: 'unknown', message: '서버에 닿지 못했어요. 결과를 모르니 다시 읽기로 확인해 주세요.' }; }
  mg.running = false; mg.spent = true; mg.result = r;
  renderMerge();
  /* 병합 결과 뒤에는 목록을 다시 읽는다(병합된 PR이 목록에서 빠진다) */
  void loadPrList();
}

/* ---------- 그리기와 시계 ---------- */
function render() {
  const now = Date.now();
  st.renderedAt = now;
  for (const fn of [renderStrip, renderBanner, renderNow, renderDecide, renderMerge, renderPhases, renderHooks, renderTree, renderPin, renderLedger, renderBacklog, renderMilestones, renderSources]) {
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
  const decChanged = changed.includes('decisions');
  /* 바뀌기 전 결정 목록. 같은 키의 선택지 글이 바뀌었는지 보려고 st.vm을 바꾸기 전에 잡는다 */
  const prevDecisions = st.vm.decisions?.items || [];
  st.vm = next; st.prevSig = after; st.lastPushAt = now;
  if (fresh) st.lastChange = { count: counted.length + removed, hooks: changed.filter(k => k.startsWith('hook:')).length, at: now };
  /* 결정 목록이 바뀌면 고른 답을 새 목록에 맞추고, 남은 고름이 있으면 문장을 다시 묻는다(서버 서명이 바뀌었으므로) */
  if (decChanged) decReconcile(prevDecisions);
  render();
  if (decChanged && dec.picks.size) schedulePreview();
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
  /* 결정 카드: 같은 키를 다시 누르면 고름을 푼다. C를 고르면 코멘트 칸으로 간다 */
  const pk = e.target.closest('[data-pick]');
  if (pk) {
    const id = pk.dataset.pick, key = pk.dataset.key;
    if (dec.picks.get(id) === key) dec.picks.delete(id); else dec.picks.set(id, key);
    dec.result = null; schedulePreview();
    if (dec.picks.get(id) === 'C') $(`[data-comment="${CSS.escape(id)}"]`)?.focus();
    return;
  }
  const dc = e.target.closest('[data-dec-clear]');
  if (dc) { dec.picks.delete(dc.dataset.decClear); dec.comments.delete(dc.dataset.decClear); dec.result = null; schedulePreview(); return; }
  if (e.target.closest('[data-dec-clear-all]')) { dec.picks.clear(); dec.comments.clear(); dec.result = null; schedulePreview(); return; }
  if (e.target.closest('[data-dec-send]')) { void sendLine(); return; }
  /* 병합 카드: 불러오기·다시 읽기·병합. GitHub diff 링크는 기본 동작(새 탭)을 막지 않고 본 것으로만 친다 */
  if (MRG) {
    if (e.target.closest('[data-merge-load]')) { loadFromInput(); return; }
    const pick = e.target.closest('[data-merge-pick]');
    if (pick) { pickFromList(pick); return; }
    if (e.target.closest('[data-merge-list-reload]')) { if (!mg.listLoading) void loadPrList(); return; }
    if (e.target.closest('[data-merge-reload]')) { if (mg.pr && !mg.running && !mg.loading) void loadMerge(mg.pr, mg.manual); return; }
    if (e.target.closest('[data-merge-run]')) { void runMerge(); return; }
    if (e.target.closest('[data-merge-close]')) { if (!mg.running) { dropCard(); renderMerge(); } return; }
    const ml = e.target.closest('[data-merge-link]');
    if (ml) { markOpened(ml.dataset.mergeLink); return; }
  }
  if (e.target.closest('[data-dec-copy]')) {
    const text = dec.preview?.text, ids = [...dec.picks.keys()];
    if (text) copyText(text).then(ok => { dec.result = { phase: ok ? 'clipboard' : 'manual', line: text, ids }; renderDecide(); if (!ok) $('#decide .send-manual')?.select(); });
    return;
  }
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
/* 코멘트 입력: 카드는 다시 칠하지 않고 「보낼 문장」만 다시 묻는다. 그래서 한글 조합 중인 글자와 커서가 남는다 */
document.addEventListener('input', e => {
  const id = e.target?.dataset?.comment;
  if (id == null) return;
  dec.comments.set(id, e.target.value); dec.result = null;
  schedulePreview();
});
/* 병합 카드 번호 칸: Enter로 불러온다 */
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target?.matches?.('[data-merge-num]')) { e.preventDefault(); if (MRG) loadFromInput(); } });
document.addEventListener('toggle', e => {
  /* 병합 카드의 「꼭 볼 것」 접힘: 저장하지 않고, 펼치면 본 것으로 친다(patch가 있을 때) */
  if (e.target.dataset?.mergeFile != null) { if (MRG) mergeToggled(e.target); return; }
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
