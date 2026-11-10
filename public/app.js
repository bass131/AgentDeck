(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCHEMA = 'ad-dashboard/1', DAY = 864e5, KST = 9 * 36e5, WD = ['일', '월', '화', '수', '목', '금', '토'];
const BOOT = JSON.parse($('#bootstrap').textContent);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const EASE1 = getComputedStyle(document.documentElement).getPropertyValue('--ease-pop1').trim() || 'cubic-bezier(.85,.14,.29,.99)';

/* ---------- 움직임: 실제 사건(연결 신호·스냅샷 변경·사용자 조작)에만 묶는다 ---------- */
const moving = () => !reduceMotion.matches && !document.hidden;
const play = (el, frames, opts) => el && moving() && el.animate ? el.animate(frames, opts) : null;
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const num = (key, v) => `<span class="num" data-num="${esc(key)}">${esc(v)}</span>`;
const numsOf = root => new Map([...root.querySelectorAll('[data-num]')].map(e => [e.dataset.num, e.textContent]));
function paint(el, html) {
  const prev = numsOf(el); el.innerHTML = html;
  if (!prev.size) return;
  /* 실제로 바뀐 숫자만 위에서 굴러 들어온다 */
  for (const e of el.querySelectorAll('[data-num]')) {
    const p = prev.get(e.dataset.num);
    if (p != null && p !== e.textContent) play(e, [{ transform: 'translateY(-45%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: EASE1 });
  }
}

const st = { vm: BOOT.vm, prevSig: null, changedUntil: new Map(), pending: new Set(), conn: 'connecting', attempt: 0,
  lostAt: Date.now(), lastPushAt: 0, lastChange: null, open: new Set(), renderedAt: 0 };

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
const relSpan = (ms, now) => `<span class="rel" data-rel="${ms}">${rel(ms, now)}</span>`;

/* ---------- 조각 ---------- */
const WARN_ICON = '<svg class="warn" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 1.4 11 10.3H1z" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 4.7v2.6M6 8.7v.05" stroke-width="1.4" stroke-linecap="round"/></svg>';
const tag = (label, cls) => `<span class="tag ${cls}">${cls === 'tag-broken' ? WARN_ICON : ''}${esc(label)}</span>`;
const areaTitle = (en, ko) => `<span class="en" aria-hidden="true">${en}</span><span class="ko">${ko}</span>`;
const areaHead = (id, en, ko, sum) => `<header class="area-head"><h2 id="${id}">${areaTitle(en, ko)}</h2><div class="area-sum">${sum}</div></header>`;
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
const failedBlock = (b, title, note) => `<div class="unknown-block"${fxAttr(b.sourceId + '-status')}><p><strong>${title}</strong> ${esc(srcOf(b.sourceId)?.error || '')}</p><p>${note}</p></div>`;

/* ---------- 바뀐 항목: 직전 스냅샷과 키별 값을 비교한다 ---------- */
const fxAttr = k => ` data-fx="${esc(k)}"`;
const freshTag = k => (st.changedUntil.get(k) || 0) > Date.now() ? '<span class="fresh-tag">방금 바뀜</span>' : '';
const aiKey = a => 'ai:' + a.file + ':' + a.text.slice(0, 60);
function sigMap(vm) {
  const m = new Map(), J = JSON.stringify;
  m.set('milestone', J([vm.milestone.status, vm.milestone.title, vm.milestone.statusText]));
  m.set('pin-sum', J([vm.pin.status, vm.pin.summary]));
  for (const it of vm.pin.coord?.items || []) m.set('coord:' + (it.label || it.line), J(it.text));
  m.set('phases-status', vm.phases.status);
  for (const p of vm.phases.items || []) m.set('phase:' + p.num, J([p.name, p.goal, p.state, p.record && [p.record.pass, p.record.fail, p.record.userInput, p.record.failSinceUserInput, p.record.last]]));
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

/* ---------- 상단 띠 ---------- */
const SLOTS = ['conn', 'collected', 'change', 'stop', 'gate', 'failed'], slotHtml = new Map();
function stripSlot(name, html) {
  const box = $('#strip-status');
  if (!box.querySelector('[data-slot]')) { slotHtml.clear(); box.innerHTML = SLOTS.map(s => `<span class="slot" data-slot="${s}"></span>`).join(''); }
  if (slotHtml.get(name) === html) return null;
  const el = box.querySelector(`[data-slot="${name}"]`);
  slotHtml.set(name, html); paint(el, html);
  return el;
}
function renderStrip(now) {
  const vm = st.vm, at = Date.parse(vm.collectedAt);
  const conn = { connecting: ['is-reconnecting', '연결하는 중'], connected: ['is-connected', '실시간 연결됨'],
    reconnecting: ['is-reconnecting', `다시 연결하는 중${st.attempt ? ` (${st.attempt}번째)` : ''}`], disconnected: ['is-disconnected', '연결 끊김'] }[st.conn];
  stripSlot('conn', `<span class="conn ${conn[0]}"><i aria-hidden="true"></i>${conn[1]}</span>`);
  const collected = stripSlot('collected', `<span class="collected${st.conn === 'disconnected' ? ' is-stale' : ''}">원문 수집 <time datetime="${esc(vm.collectedAt)}">${fHMS(at)}</time> <span class="rel"></span></span>`);
  const relEl = $('[data-slot="collected"] .rel'), relText = rel(at, now);
  if (relEl && relEl.textContent !== relText) relEl.textContent = relText;
  if (collected && st.shownCollected && st.shownCollected !== vm.collectedAt) play(collected.querySelector('time'), [{ opacity: 0, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE1 });
  st.shownCollected = vm.collectedAt;
  const c = st.lastChange && now - st.lastChange.at < 60000 ? st.lastChange : null;
  stripSlot('change', c ? `<span class="fresh-tag">방금 갱신, ${c.count ? `${c.count}개 바뀜` : '바뀐 항목 없음'}${c.hooks ? ` · 훅 기록 ${c.hooks}줄` : ''}</span>` : '');
  const stopped = vm.phases.status === 'ok' ? vm.phases.items.filter(p => p.state === 'stopped').length : 0;
  stripSlot('stop', stopped ? `<a class="tag tag-todo" href="#phases">멈춤 ${num('strip-stop', stopped)}</a>` : '');
  stripSlot('gate', vm.ledger.status === 'ok' && vm.ledger.gate !== 'clear' ? `<a class="tag tag-todo" href="#ledger">결정 대장 게이트 발동</a>` : '');
  const failed = vm.sources.filter(s => s.status === 'failed').length;
  stripSlot('failed', failed ? `<a class="tag tag-broken" href="#sources" data-open="sources">${WARN_ICON}수집 실패 ${num('strip-failed', failed)}</a>` : '');
}
function pulseConn() { const dot = $('.conn.is-connected i'); if (dot && moving()) restart(dot, 'is-beat'); }
let bannerState = null;
function renderBanner() {
  const b = $('#banner'), at = Date.parse(st.vm.collectedAt);
  b.className = 'banner';
  if (st.conn === 'disconnected') {
    b.classList.add('is-disconnected');
    b.innerHTML = `<div class="wrap"><p><strong>${WARN_ICON}실시간 연결이 끊겼어요.</strong> ${fHMS(st.lostAt)}부터 서버 응답이 없어요. 화면은 ${fHMS(at)}에 수집한 내용이고, 저장소 파일이 바뀌어도 반영되지 않아요.</p><button type="button" class="btn" id="reconnect">다시 연결</button></div>`;
  } else if (st.conn === 'reconnecting') {
    b.classList.add('is-reconnecting');
    b.innerHTML = `<div class="wrap"><p><strong>다시 연결하는 중이에요${st.attempt ? ` (${st.attempt}번째 시도)` : ''}.</strong> 그동안 화면은 ${fHMS(at)} 수집본이에요.</p></div>`;
  } else b.innerHTML = '';
  if (bannerState != null && bannerState !== st.conn && b.firstElementChild) play(b.firstElementChild, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE1 });
  bannerState = st.conn;
}

/* ---------- 머리: 현재 마일스톤, 기록 줄 합계, pin 마감 요약 ---------- */
function renderHero(now) {
  const vm = st.vm, M = vm.milestone, P = vm.phases, pin = vm.pin, ptr = vm.pointer;
  const eyebrow = '<p class="hero-eyebrow" aria-hidden="true">Current milestone</p>';
  let head;
  if (M.status !== 'ok') {
    head = `<div class="hero-head"${fxAttr('milestone')}>${eyebrow}<h1 class="hero-title">현재 마일스톤 미확인</h1>
      <p class="hero-status">${tag('수집 실패', 'tag-broken')} ${esc(srcOf('milestone')?.error || '')}</p>
      <div class="hero-meta">${ptr.status === 'ok' ? `<span>계획 포인터</span>${srcLink({ path: ptr.planPath })}` : `<span>${esc(srcOf('pointer')?.error || '')}</span>`}</div></div>`;
  } else {
    const dir = p => p ? p.slice(0, p.lastIndexOf('/')) : null;
    const split = ptr.status === 'ok' && dir(ptr.planPath) !== dir(ptr.workPinPath);
    head = `<div class="hero-head"${fxAttr('milestone')}>${eyebrow}<h1 class="hero-title">${md(M.title)}</h1>
      <p class="hero-status"><b>상태</b> ${M.statusText ? md(M.statusText) : tag('상태 줄 없음', 'tag-candidate')} ${freshTag('milestone')}</p>
      <div class="hero-meta"><span>계획</span>${srcLink(M.ref)}${split ? tag('계획과 pin 포인터가 다른 폴더예요', 'tag-candidate') : ''}</div></div>`;
  }
  let counter = '';
  if (P.status === 'ok') {
    const sum = k => P.items.reduce((n, p) => n + (p.record?.[k] || 0), 0), pass = sum('pass'), fail = sum('fail'), ui = sum('userInput');
    counter = `<div><div class="counter" aria-hidden="true"><span class="cd-g${pass ? '' : ' is-dim'}"><b>${num('c-pass', pass)}</b><small>Pass</small></span><span class="cd-sep">:</span>
      <span class="cd-g${fail ? ' is-fail' : ' is-dim'}"><b>${num('c-fail', fail)}</b><small>Fail</small></span><span class="cd-sep">:</span>
      <span class="cd-g${ui ? '' : ' is-dim'}"><b>${num('c-ui', ui)}</b><small>Input</small></span></div>
      <p class="counter-note">Phase ${P.items.length}개의 검증 기록 줄 합계</p><p class="sr">검증 기록 줄 합계: PASS ${pass}, FAIL ${fail}, USER-INPUT ${ui}</p></div>`;
  }
  let sum;
  if (pin.status !== 'ok') sum = `<div class="unknown-block"${fxAttr('pin-sum')}><p><strong>work-pin을 읽지 못했어요.</strong> ${esc(srcOf('pin')?.error || '')}</p><p>마감 요약은 미확인이에요. 요약이 없다는 뜻이 아니에요.</p></div>`;
  else if (!pin.summary) sum = `<div class="pin-sum"${fxAttr('pin-sum')}><p class="pin-sum-h">${tag('절 없음', 'tag-broken')}<span>work-pin에 「마감 요약」 절이 없어요.</span></p>${srcLink({ path: pin.path })}</div>`;
  else {
    const S = pin.summary, at = S.stamp ? parseAt(S.stamp.text) : null;
    const row = (label, f) => `<dt>${label}</dt><dd>${f ? md(f.text) : tag('줄 없음', 'tag-candidate')}</dd>`;
    sum = `<section class="pin-sum"${fxAttr('pin-sum')} aria-label="work-pin 마감 요약"><p class="pin-sum-h"><span>마감 요약</span>${S.stamp ? `<time class="tnum">${esc(S.stamp.text)}</time>${at ? relSpan(at, now) : ''}` : tag('스탬프 없음', 'tag-candidate')} ${freshTag('pin-sum')}</p>
      <dl class="kv">${row('바뀐 것', S.changed)}${row('내린 결정', S.decided)}${row('봐야 할 것', S.watch)}</dl>${srcLink({ path: pin.path, line: S.line })}</section>`;
  }
  paint($('#hero'), `<div class="hero-top">${head}${counter}</div>${sum}`);
}

/* ---------- Phase 흐름 ---------- */
const markerTag = m => m === 'PASS' ? tag('PASS', 'tag-ok') : m === 'FAIL' ? tag('FAIL', 'tag-broken') : tag(m, 'tag-plain');
const PHASE_STATE = { stopped: ['멈춤 — 사용자 판단 대기', 'tag-todo stop-tag'], empty: ['기록 없음', 'tag-rest'],
  'no-record-section': ['검증 기록 절 없음', 'tag-broken'], 'no-section': ['Phase 절 없음', 'tag-broken'] };
function phaseRow(p, now, limit) {
  const k = 'phase:' + p.num, r = p.record, s = PHASE_STATE[p.state];
  let counts = '', last = '';
  if (r?.section) {
    counts = `<div class="phase-counts"><span><span class="k">PASS</span><span class="v">${num(k + ':p', r.pass)}</span></span>
      <span class="${r.fail ? 'is-fail' : ''}"><span class="k">FAIL</span><span class="v">${num(k + ':f', r.fail)}</span></span>
      <span><span class="k">USER-INPUT</span><span class="v">${num(k + ':u', r.userInput)}</span></span>
      <span>마지막 USER-INPUT 이후 FAIL <span class="v">${num(k + ':s', r.failSinceUserInput)}</span>/${limit}</span></div>`;
    if (r.last) {
      const at = parseAt(r.last.at);
      last = `<div class="phase-last">${markerTag(r.last.marker)}${at ? `<time datetime="${esc(r.last.at)}">${fWhen(at, now)}</time>` : ''}<span class="txt" title="${esc(r.last.text)}">${md(r.last.text)}</span></div>${srcLink({ path: r.last.file, line: r.last.line })}`;
    }
  }
  return `<li class="phase${p.state === 'stopped' ? ' is-stop' : ''}"${fxAttr(k)}><div class="phase-num"><small>Phase</small>${esc(p.num)}</div><div class="phase-body">
    <div class="phase-title"><span class="phase-name">${md(p.name)}</span><span class="phase-tags">${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span>${s ? tag(s[0], s[1]) : ''}${p.duplicate ? tag('같은 번호의 절이 둘 이상', 'tag-candidate') : ''}${p.inTable ? '' : tag('「Phase 흐름」 표에 없음', 'tag-candidate')}${freshTag(k)}</div>
    ${p.goal ? `<p class="phase-goal">${md(p.goal)}</p>` : ''}${counts}${last || srcLink(p.ref || p.tableRef)}</div></li>`;
}
function renderPhases(now) {
  const el = $('#phases'), P = st.vm.phases, limit = st.vm.rules.failLimit;
  if (P.status !== 'ok') { paint(el, areaHead('phases-h', 'Phases', 'Phase 흐름', tag('수집 실패', 'tag-broken')) + failedBlock(P, 'Phase 흐름과 검증 기록을 읽지 못했어요.', 'Phase 수와 기록 줄 수는 미확인이고, 0이라는 뜻이 아니에요.')); return; }
  const n = s => P.items.filter(p => s.includes(p.state)).length;
  const sum = [n(['stopped']) && `${tag('멈춤', 'tag-todo')}${num('ph-stop', n(['stopped']))}`, n(['no-section', 'no-record-section']) && `${tag('절 없음', 'tag-broken')}${num('ph-broken', n(['no-section', 'no-record-section']))}`,
    n(['empty']) && `${tag('기록 없음', 'tag-rest')}${num('ph-empty', n(['empty']))}`, `<span>Phase ${num('ph-n', P.items.length)}</span>`].filter(Boolean).join('');
  paint(el, areaHead('phases-h', 'Phases', 'Phase 흐름', sum)
    + (P.items.length ? `<ol class="list" data-list="phases">${P.items.map(p => phaseRow(p, now, limit)).join('')}</ol>` : '<p class="empty">계획 문서에 Phase가 없어요.</p>')
    + `<p class="area-foot">이름·목표는 「Phase 흐름」 표에서, 줄 수는 Phase 절 「검증 기록」 아래의 <code class="inline">- PASS</code>·<code class="inline">- FAIL</code>·<code class="inline">- USER-INPUT</code> 줄에서 읽어요. 마지막 USER-INPUT 이후 FAIL이 ${limit}번이면 멈춤이에요(헌법 7조). 진행률은 계산하지 않아요.</p>`);
}

/* ---------- 결정 대장 ---------- */
function renderLedger() {
  const el = $('#ledger'), L = st.vm.ledger;
  if (L.status !== 'ok') { paint(el, areaHead('ledger-h', 'Ledger', '결정 대장', tag('수집 실패', 'tag-broken')) + failedBlock(L, '결정 대장을 읽지 못했어요.', '태그 수는 미확인이고, 0건이라는 뜻이 아니에요.')); return; }
  const T = L.tally;
  const gate = L.gate === 'immediate' ? `${tag('즉시 발동', 'tag-todo')}<span>[AI·비가역] ${T['AI·비가역']}건이 있어 개수와 무관하게 스폰 게이트가 막혀요.</span>`
    : L.gate === 'ask' ? `${tag('문답 분기 발동', 'tag-todo')}<span>[AI] ${T.AI}건이 [USER] 쪽 ${L.userSide}건보다 많아 스폰 게이트가 막혀요.</span>`
    : `${tag('미발동', 'tag-ok')}<span>[AI] ${T.AI}건이 [USER] 쪽 ${L.userSide}건 이하이고 [AI·비가역]이 없어요.</span>`;
  const cell = (label, v) => `<div class="${v && label.includes('AI') ? 'is-ai' : ''}"><dt>[${label}]</dt><dd>${num('lg:' + label, v)}</dd></div>`;
  const sum = [L.gate !== 'clear' && tag('게이트 발동', 'tag-todo'), `<span>남은 [AI] 줄 ${num('lg-ai', L.aiLines.length)}</span>`].filter(Boolean).join('');
  const line = a => `<li class="ai-line"${fxAttr(aiKey(a))}>${tag(a.tag, 'tag-plain')}<div class="ai-body"><p class="ai-text">${md(a.text)} ${freshTag(aiKey(a))}</p>${srcLink({ path: a.file, line: a.line })}</div></li>`;
  paint(el, areaHead('ledger-h', 'Ledger', '결정 대장', sum)
    + `<dl class="tally"${fxAttr('ledger')}>${cell('USER', T.USER)}${cell('USER·위임', T['USER·위임'])}${cell('AI', T.AI)}${cell('AI·비가역', T['AI·비가역'])}</dl>
    <p class="gate">${gate} ${freshTag('ledger')}</p>
    ${L.aiLines.length ? `<h3 class="sub-h">남은 [AI] 줄</h3><ol class="list" data-list="ai">${L.aiLines.map(line).join('')}</ol>` : '<p class="empty">남은 [AI] 줄이 없어요.</p>'}
    ${srcLink(L.ref)}<p class="area-foot">「결정 대장」 절에서 줄 머리가 <code class="inline">- [태그]</code>인 줄만 세요. 판정식은 <code class="inline">.claude/hooks/20_plan-gate.cjs</code>와 같고, [USER·위임]은 [USER] 쪽으로 세요.</p>`);
}

/* ---------- 작업 좌표(work-pin 「좌표」 절) ---------- */
function renderCoords() {
  const el = $('#coords'), pin = st.vm.pin, ptr = st.vm.pointer;
  const pointer = ptr.status === 'ok'
    ? `<dl class="facts"><dt>계획 포인터</dt><dd>${srcLink({ path: ptr.planPath })}</dd><dt>pin 포인터</dt><dd>${srcLink({ path: ptr.workPinPath })}</dd></dl>`
    : failedBlock(ptr, '현재 좌표 포인터를 읽지 못했어요.', '계획 문서와 pin의 위치를 정하지 못해 그 블록들도 미확인이에요.');
  let body;
  if (pin.status !== 'ok') body = failedBlock(pin, 'work-pin을 읽지 못했어요.', '좌표는 미확인이에요.');
  else if (!pin.coord) body = `<p class="empty">${tag('절 없음', 'tag-broken')} work-pin에 「좌표」 절이 없어요.</p>`;
  else body = `<ul class="list kv-list" data-list="coord">${pin.coord.items.map(it => { const k = 'coord:' + (it.label || it.line); return `<li${fxAttr(k)}><dl class="kv"><dt>${esc(it.label || '항목')}</dt><dd>${md(it.text)} ${freshTag(k)}</dd></dl></li>`; }).join('')}</ul>${srcLink({ path: pin.path, line: pin.coord.line })}`;
  paint(el, areaHead('coords-h', 'Pin', '작업 좌표', pin.status === 'ok' && pin.coord ? `<span>항목 ${num('co-n', pin.coord.items.length)}</span>` : tag('미확인', 'tag-unknown')) + pointer + body);
}

/* ---------- 작업 사본 ---------- */
const CHANGE = c => c === '??' ? '미추적' : /U|AA|DD/.test(c) ? '충돌' : c.includes('R') ? '이름 바꿈' : c.includes('A') ? '추가' : c.includes('D') ? '삭제' : c.includes('M') ? '수정' : c.includes('T') ? '형식 바뀜' : c.includes('C') ? '복사' : c.trim();
const SHOW_CHANGES = 200;
function renderTree(now) {
  const el = $('#tree'), W = st.vm.worktree;
  if (W.status !== 'ok') { paint(el, areaHead('tree-h', 'Tree', '작업 사본', tag('수집 실패', 'tag-broken')) + failedBlock(W, '작업 사본을 읽지 못했어요.', '브랜치와 변경 파일 수는 미확인이고, 변경이 없다는 뜻이 아니에요.')); return; }
  const C = W.compare, headAt = parseAt(W.head.committedAt), fetched = parseAt(W.fetchedAt);
  const kind = { upstream: '추적 브랜치', 'same-name': '같은 이름의 origin 브랜치', default: 'origin에 이 브랜치가 없어 기본 브랜치' }[C?.kind];
  const sync = C ? `앞 <b>${num('tr-ahead', C.ahead)}</b> · 뒤 <b>${num('tr-behind', C.behind)}</b> <span class="mono">${esc(C.ref)}</span> 기준<small>${kind}와 비교 · 마지막 fetch ${fetched ? `${fDate(fetched)} ${fHM(fetched)}` : '기록 없음'} · 이 화면은 fetch하지 않아요</small>`
    : `${tag('미확인', 'tag-unknown')}<small>origin 추적 정보가 없어요.</small>`;
  const changes = W.changes.slice(0, SHOW_CHANGES).map(c => `<li class="chg${c.code === '??' ? ' is-untracked' : ''}"><span class="code mono" title="${esc(CHANGE(c.code))}">${esc(c.code.replace(/ /g, '·'))}</span><span class="p">${esc(c.from ? `${c.from} → ${c.path}` : c.path)}</span></li>`).join('');
  const sum = [W.changes.length ? `${tag('변경', 'tag-plain')}${num('tr-n', W.changes.length)}` : tag('변경 없음', 'tag-rest'), C?.ahead ? `<span>앞 ${num('tr-a2', C.ahead)}</span>` : ''].filter(Boolean).join('');
  paint(el, areaHead('tree-h', 'Tree', '작업 사본', sum) + `<dl class="facts">
    <dt>브랜치</dt><dd${fxAttr('tree-head')}><span class="mono">${esc(W.branch)}</span>${W.detached ? ' ' + tag('분리된 HEAD', 'tag-candidate') : ''} ${freshTag('tree-head')}</dd>
    <dt>HEAD</dt><dd><span class="mono">${esc(W.head.hash)}</span> ${md(W.head.subject)}${headAt ? `<small>${fDate(headAt)} ${fHM(headAt)} 커밋 · ${rel(headAt, now)}</small>` : ''}</dd>
    <dt>origin 대비</dt><dd${fxAttr('tree-sync')}>${sync} ${freshTag('tree-sync')}</dd>
    <dt>미커밋</dt><dd${fxAttr('tree-changes')}>추적 파일 ${num('tr-t', W.tracked)} · 미추적 파일 ${num('tr-u', W.untracked)} ${freshTag('tree-changes')}</dd></dl>
    ${W.changes.length ? `<details class="more" data-id="changes"${isOpen('changes')}><summary><span class="chev" aria-hidden="true"></span>변경 파일 ${W.changes.length}개</summary><ul class="list">${changes}</ul>${W.changes.length > SHOW_CHANGES ? `<p class="empty">그 밖에 ${W.changes.length - SHOW_CHANGES}개가 더 있어요.</p>` : ''}</details>` : ''}
    <p class="area-foot">읽기 전용 git 명령(rev-parse·log·status·rev-list)만 써요. 상태 코드는 <code class="inline">git status --porcelain</code>의 두 칸이고, 빈칸은 「·」로 보여요.</p>`);
}

/* ---------- 훅 활동 ---------- */
function renderHooks(now) {
  const el = $('#hooks'), H = st.vm.hooks, R = st.vm.rules;
  if (H.status !== 'ok') { paint(el, areaHead('hooks-h', 'Hooks', '훅 활동', tag('수집 실패', 'tag-broken')) + failedBlock(H, 'hook-log를 읽지 못했어요.', '훅 판정 수는 미확인이고, 0건이라는 뜻이 아니에요.')); return; }
  const verdict = v => R.denyVerdicts.includes(v) ? tag(v, 'tag-broken') : v === 'ask' ? tag(v, 'tag-todo') : /^(allow|통과)$/.test(v || '') ? tag(v, 'tag-ok') : tag(v || '판정 없음', 'tag-plain');
  const row = e => { const at = parseAt(e.at), k = 'hook:' + e.key; return `<li class="hook${e.deny ? ' is-deny' : ''}"${fxAttr(k)}><time${at ? ` datetime="${esc(e.at)}"` : ''}>${at ? fWhen(at, now) : '시각 없음'}</time><span class="h" title="${esc(e.hook)}">${esc(e.hook || '훅 이름 없음')}</span>
    <span class="v">${verdict(e.verdict)}${e.rule ? `<span class="rule">${esc(e.rule)}</span>` : ''}${freshTag(k)}</span>${e.reason || e.detail ? `<span class="why">${esc([e.reason, e.detail].filter(Boolean).join(' · '))}</span>` : ''}</li>`; };
  const all = H.entries.slice().reverse(), denies = all.filter(e => e.deny), recent = all.slice(0, R.hookRecent);
  const sum = [denies.length ? `${tag('막힘', 'tag-broken')}${num('hk-deny', denies.length)}` : tag('막힘 없음', 'tag-rest'), H.bad ? tag(`읽지 못한 줄 ${H.bad}`, 'tag-candidate') : '', `<span>최근 ${num('hk-lines', H.lines)}줄</span>`].filter(Boolean).join('');
  paint(el, areaHead('hooks-h', 'Hooks', '훅 활동', sum)
    + `<h3 class="sub-h">막힌 판정 ${denies.length}건</h3>${denies.length ? `<ol class="list" data-list="deny">${denies.map(row).join('')}</ol>` : `<p class="empty">최근 ${H.lines}줄 안에 ${R.denyVerdicts.join('·')} 판정이 없어요.</p>`}
    <h3 class="sub-h">최근 기록</h3>${recent.length ? `<ol class="list" data-list="hooks">${recent.slice(0, 12).map(row).join('')}</ol>${recent.length > 12 ? `<details class="more" data-id="hooks-more"${isOpen('hooks-more')}><summary><span class="chev" aria-hidden="true"></span>${recent.length - 12}줄 더 보기</summary><ol class="list">${recent.slice(12).map(row).join('')}</ol></details>` : ''}` : '<p class="empty">기록 줄이 없어요.</p>'}
    ${srcLink({ path: H.path })}<p class="area-foot">파일이 계속 커져서 끝 ${Math.round(R.hookTailLines)}줄 창만 읽어요(지금 파일 ${Math.round(H.size / 1024)} KB${H.truncated ? ', 앞부분은 읽지 않음' : ''}). 막힌 판정은 verdict가 ${R.denyVerdicts.join('·')}인 줄이고, 이 창 밖의 줄은 세지 않아요.</p>`);
}

/* ---------- Backlog ---------- */
function renderBacklog() {
  const el = $('#backlog'), B = st.vm.backlog;
  const head = sum => areaHead('backlog-h', 'Backlog', '미룬 항목', sum);
  if (B.status === 'absent') { paint(el, head(tag('없음', 'tag-rest')) + `<p class="empty">${esc(srcOf('backlog')?.error || '현재 마일스톤 폴더에 Backlog 파일이 없어요.')}</p>`); return; }
  if (B.status !== 'ok') { paint(el, head(tag('수집 실패', 'tag-broken')) + failedBlock(B, 'Backlog를 읽지 못했어요.', '항목 수는 미확인이고, 0건이라는 뜻이 아니에요.')); return; }
  const list = s => `<ol class="list" data-list="bl">${s.items.map(it => { const k = `bl:${s.name}:${it.num}`; return `<li class="row"${fxAttr(k)}><span class="row-num">${esc(it.num)}</span><div class="row-body"><span class="row-title">${md(it.title)}</span> ${freshTag(k)}${srcLink({ path: B.path, line: it.line })}</div></li>`; }).join('')}</ol>`;
  const body = B.sections.map(s => /처리|완료/.test(s.name)
    ? `<details class="more" data-id="bl-${esc(s.name)}"${isOpen('bl-' + s.name)}><summary><span class="chev" aria-hidden="true"></span>${esc(s.name)} ${s.items.length}건</summary>${list(s)}</details>`
    : `<h3 class="bl-sec">${esc(s.name)} ${s.items.length}건</h3>${list(s)}`).join('');
  paint(el, head(`<span>항목 ${num('bl-n', B.count)}</span>`) + (B.count ? body : '<p class="empty">번호 항목이 없어요.</p>') + `<p class="area-foot">「N. **제목**」 번호 줄의 굵은 제목만 읽어요.</p>`);
}

/* ---------- 마일스톤 ---------- */
function renderMilestones() {
  const el = $('#milestones'), M = st.vm.milestones;
  if (M.status !== 'ok') { paint(el, areaHead('milestones-h', 'Milestones', '마일스톤', tag('수집 실패', 'tag-broken')) + failedBlock(M, '마일스톤 목록을 읽지 못했어요.', '마일스톤 수는 미확인이에요.')); return; }
  const row = m => `<li class="row ms-row${m.current ? ' is-current' : ''}"${fxAttr('ms:' + m.name)}><div class="row-body"><span class="row-title">${md(m.title || m.name)}</span> ${m.current ? tag('현재 좌표', 'tag-info') : ''}${m.state === 'missing' ? tag('계획 문서 없음', 'tag-candidate') : m.state === 'failed' ? tag('읽기 실패', 'tag-broken') : ''} ${freshTag('ms:' + m.name)}
    <span class="row-sub">${m.statusText ? `상태: ${md(m.statusText)}` : m.error ? esc(m.error) : '상태 줄이 없어요.'}</span>${srcLink({ path: m.path, line: m.line })}</div></li>`;
  paint(el, areaHead('milestones-h', 'Milestones', '마일스톤', `<span>${num('ms-n', M.items.length)}개</span>`)
    + (M.items.length ? `<ol class="list" data-list="ms">${M.items.map(row).join('')}</ol>` : '<p class="empty">01_Milestones 아래에 폴더가 없어요.</p>')
    + '<p class="area-foot">폴더마다 _MilestonePreview.md 첫머리의 상태 줄을 그대로 보여 줘요. 상태를 해석하지 않아요.</p>');
}

/* ---------- 원천 수집 상태 ---------- */
function renderSources() {
  const vm = st.vm, failed = vm.sources.filter(s => s.status === 'failed').length;
  const status = s => s.status === 'ok' ? tag('읽음', 'tag-ok') : s.status === 'failed' ? tag('수집 실패', 'tag-broken') : tag('없음', 'tag-rest');
  const rows = vm.sources.map(s => `<tr class="${s.status === 'failed' ? 'is-failed' : ''}"${fxAttr('src:' + s.id)}><td>${esc(s.label)}${s.error ? `<span class="err">${esc(s.error)}</span>` : ''}</td>
    <td class="target" data-k="대상">${esc(s.target || '')}</td><td data-k="상태">${status(s)}</td><td data-k="수집">${s.collectedAt ? `<time>${fHMS(Date.parse(s.collectedAt))}</time>` : '없음'}</td></tr>`).join('');
  paint($('#sources'), `<details class="sources" data-id="sources"${isOpen('sources') || (failed ? ' open' : '')}><summary>${areaHead('sources-h', 'Sources', '원천 수집 상태', `<span>원천 ${num('src-n', vm.sources.length)}</span>${failed ? `${tag('수집 실패', 'tag-broken')}${num('src-failed', failed)}` : ''}`)}</summary>
    <table class="src-table"><thead><tr><th>원천</th><th>대상</th><th>상태</th><th>수집 시각</th></tr></thead><tbody>${rows}</tbody></table></details>
    <div class="foot-meta"><span>저장소 ${esc(vm.repo.path)}</span><span>보기 모델 ${esc(vm.schema)}, 개정 ${esc(vm.revision)}</span><span>읽기 전용 화면이에요. 저장소에 쓰지 않아요.</span></div>`);
}

/* ---------- 그리기와 시계 ---------- */
function render() {
  const now = Date.now();
  st.renderedAt = now;
  for (const fn of [renderStrip, renderBanner, renderHero, renderPhases, renderLedger, renderCoords, renderTree, renderHooks, renderBacklog, renderMilestones, renderSources]) {
    try { fn(now); } catch (error) { console.error('[AgentDeck 현황판] 그리기 실패', fn.name, error); }
  }
}
function markFresh(keys) { for (const k of keys) for (const el of document.querySelectorAll(`[data-fx="${CSS.escape(k)}"]`)) restart(el, 'is-fresh'); }
function applySnapshot(next) {
  const before = st.prevSig || sigMap(st.vm), after = sigMap(next), now = Date.now();
  const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
  const counted = changed.filter(k => !k.startsWith('src:') && !k.startsWith('hook:'));
  const removed = [...before.keys()].filter(k => !after.has(k) && !k.startsWith('hook:') && !k.startsWith('src:')).length;
  for (const k of changed) st.changedUntil.set(k, now + 60000);
  const fresh = changed.length || removed || next.revision !== st.vm.revision;
  st.vm = next; st.prevSig = after; st.lastPushAt = now;
  if (fresh) st.lastChange = { count: counted.length + removed, hooks: changed.filter(k => k.startsWith('hook:')).length, at: now };
  render();
  try { if (document.hidden) for (const k of changed) st.pending.add(k); else markFresh(changed); } catch {}
}
let beatTimer = null;
function beat() {
  clearTimeout(beatTimer); beatTimer = null;
  if (document.hidden) return;
  watchStream();
  const now = Date.now();
  /* 푸시가 없으면 1분마다 전체를 다시 그린다(상대 시각의 안전망) */
  if (now - st.renderedAt >= 60000 && now - st.lastPushAt > 8000) render();
  else {
    renderStrip(now);
    for (const el of document.querySelectorAll('[data-rel]')) { const t = rel(+el.dataset.rel, now); if (el.textContent !== t) el.textContent = t; }
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

/* ---------- 입력: 경로 복사, 다시 연결, 테마, 접기 상태 ---------- */
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 4200); }
function copyText(text) {
  const legacy = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; };
  return navigator.clipboard?.writeText ? navigator.clipboard.writeText(text).then(() => true, legacy) : Promise.resolve(legacy());
}
document.addEventListener('click', e => {
  const copy = e.target.closest('[data-copy]');
  if (copy) { e.preventDefault(); const text = copy.dataset.copy; copyText(text).then(ok => toast(ok ? `경로를 복사했어요: ${text}` : `복사하지 못했어요. 경로: ${text}`)); return; }
  if (e.target.closest('#reconnect')) { reconnect(); return; }
  const openLink = e.target.closest('[data-open]');
  if (openLink) { st.open.add(openLink.dataset.open); renderSources(); return; }
  const th = e.target.closest('[data-theme-set]');
  if (th) setTheme(th.dataset.themeSet);
});
document.addEventListener('toggle', e => { const id = e.target.dataset?.id; if (!id) return; e.target.open ? st.open.add(id) : st.open.delete(id); }, true);
const THEMES = ['system', 'light', 'dark'];
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)); }
function setTheme(t) { applyTheme(t); try { localStorage.setItem('ad-dash-theme', t); } catch {} }
let savedTheme = null;
try { savedTheme = localStorage.getItem('ad-dash-theme'); } catch {}
applyTheme(THEMES.includes(savedTheme) ? savedTheme : 'dark');

/* ---------- 시작: 처음 열 때 한 번만 영역이 우선순위 순서로 들어온다 ---------- */
if (moving()) {
  const html = document.documentElement;
  html.classList.add('is-intro');
  setTimeout(() => html.classList.remove('is-intro'), 1400);
}
render();
connect();
beat();
})();
