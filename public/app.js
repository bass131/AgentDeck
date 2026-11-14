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
const NO_VOICE = '<span class="tag tag-candidate" title="00_현황판-문장.md에 이 항목의 문장이 없어 계획 문서 원문을 그대로 보여 줘요">사람용 문장 없음</span>';

/* ---------- 바뀐 항목: 직전 스냅샷과 키별 값을 비교한다 ---------- */
const fxAttr = k => ` data-fx="${esc(k)}"`;
const freshTag = k => (st.changedUntil.get(k) || 0) > Date.now() ? '<span class="fresh-tag">방금 바뀜</span>' : '';
const aiKey = a => 'ai:' + a.file + ':' + a.text.slice(0, 60);
function sigMap(vm) {
  const m = new Map(), J = JSON.stringify;
  m.set('milestone', J([vm.milestone.status, vm.milestone.title, vm.milestone.statusText, vm.voice?.milestone, vm.voice?.status]));
  m.set('focus', J([vm.focus?.current, vm.focus?.basis, vm.focus?.nextPhase]));
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
const AREA_OF = k => /^(milestone|focus|next)$/.test(k) ? 'now' : k.startsWith('phase') ? 'phases' : k.startsWith('hook') ? 'hooks' : k.startsWith('tree') ? 'tree'
  : /^(pin-sum|coord:)/.test(k) ? 'pin' : /^(ledger|ai:)/.test(k) ? 'ledger' : k.startsWith('bl:') ? 'backlog' : k.startsWith('ms:') ? 'milestones' : k.startsWith('src:') ? 'sources' : null;

/* ---------- 사람 문장: 원문 파일의 문장 → 계획 문서 「사람용 개요」 → 원문 그대로 ---------- */
/* goal 한 장 형식이면 단계는 「진척 단계」 항목이다. 항목 글이 곧 사람이 쓴 문장이라 「사람용 문장 없음」을 달지 않는다 */
const isGoal = () => st.vm.phases.status === 'ok' && st.vm.phases.format === 'goal';
const nOf = p => p.label ?? p.num;
const clipText = (s, n) => { const a = Array.from(String(s ?? '')); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
function phaseVoice(p) {
  if (isGoal()) return { v: null, name: p.name, named: true, goal: null, doing: null, done: null, need: null };
  const v = st.vm.voice?.phases?.[p.num] || null;
  return { v, name: v?.name?.text || p.name, named: !!v?.name, goal: v?.goal?.text || null, doing: v?.doing?.text || null, done: v?.done?.text || null, need: v?.need?.text || null };
}
const phaseOf = n => n == null || st.vm.phases.status !== 'ok' ? null : st.vm.phases.items.find(p => p.num === n) || null;

/* ---------- 지금: 막혔는가 판정. 문장은 고정 문구이고 수는 원문에서 온다 ---------- */
function judgeNow(now) {
  const vm = st.vm, P = vm.phases, L = vm.ledger, H = vm.hooks, R = vm.rules, out = [];
  if (P.status !== 'ok') return { level: 'unknown', head: '단계 정보를 읽지 못했습니다', reasons: [{ level: 'unknown', html: esc(srcOf('phases')?.error || '계획 문서를 읽지 못했습니다.') }], chips: [] };
  const goal = P.format === 'goal', GR = goal ? P.record : null, GS = goal ? P.goal : null;
  if (goal) {
    /* goal 한 장: 검증 기록은 goal 전체에 하나다. 종결된 goal은 단계로 막히지 않는다 */
    const at = P.items.find(p => p.flow === 'stopped');
    if (GS.stopped) out.push({ level: 'stop', html: `${at ? `<a href="#phase-${at.num}">${esc(nOf(at))}단계</a>에서 ` : ''}마지막 사용자 입력 뒤로 실패가 ${num('n-stop-goal', GR.failSinceUserInput)}번 쌓여 멈췄습니다. 사용자의 판단을 기다립니다.` });
    else if (!GS.closed && GR?.failSinceUserInput > 0) out.push({ level: 'warn', html: `마지막 사용자 입력 뒤로 실패가 ${num('n-fail', GR.failSinceUserInput)}번 기록됐습니다. ${R.failLimit}번이면 멈춥니다.` });
    if (GS.waitingUser) out.push({ level: 'warn', html: `마지막 검증 기록이 사용자 입력 줄입니다. 사용자의 답을 기다리는 줄인지, 받은 답을 적은 줄인지 확인해 주세요. <span class="rawtext">「${md(clipText(GR.last.text, 140))}」</span>` });
    if (!GS.closed && GR && !GR.section) out.push({ level: 'warn', html: 'goal 문서의 Phase 절에 「검증 기록」 줄이 없습니다. 계획 검사가 이 계획을 막을 수 있습니다.' });
  } else for (const p of P.items.filter(p => p.flow === 'stopped')) out.push({ level: 'stop', html: `<a href="#phase-${p.num}">${p.num}단계</a>가 실패 ${num('n-stop-' + p.num, p.record.failSinceUserInput)}번으로 멈췄습니다. 사용자의 판단을 기다립니다.` });
  if (L.status === 'ok' && L.gate === 'immediate') out.push({ level: 'stop', html: `되돌리기 어려운 결정을 AI가 혼자 내린 기록이 ${L.tally['AI·비가역']}건 있어, <a href="#ledger" data-open="ledger">새 워커를 띄울 수 없습니다</a>.` });
  if (L.status === 'ok' && L.gate === 'ask') out.push({ level: 'stop', html: `AI가 혼자 내린 결정(${L.tally.AI}건)이 사용자 결정(${L.userSide}건)보다 많아, <a href="#ledger" data-open="ledger">새 워커를 띄울 수 없습니다</a>.` });
  const cur = phaseOf(vm.focus?.current);
  if (cur && cur.flow !== 'stopped' && cur.record?.failSinceUserInput > 0) out.push({ level: 'warn', html: `이 단계에서 실패가 ${num('n-fail', cur.record.failSinceUserInput)}번 기록됐습니다. ${R.failLimit}번이면 멈춥니다.` });
  let denyChip = null;
  if (H.status === 'ok') {
    const denies = H.entries.filter(e => e.deny), last = denies.at(-1), at = last && parseAt(last.at);
    if (last && at != null && now - at < R.denyFreshMinutes * 60000) out.push({ level: 'warn', html: `${relSpan(at)} 검사가 작업을 막았습니다. <a href="#hooks">${esc(last.say || `${last.hook} ${last.verdict}`)}</a>` });
    denyChip = denies.length ? `<a href="#hooks">검사가 막은 작업 ${num('c-deny', denies.length)}건</a>` : '검사가 막은 작업 없음';
  }
  const failedSrc = vm.sources.filter(s => s.status === 'failed').length;
  if (failedSrc) out.push({ level: 'warn', html: `원문 ${failedSrc}개를 읽지 못했습니다. <a href="#sources" data-open="sources">어떤 원문인지 보기</a>` });
  const level = out.some(r => r.level === 'stop') ? 'stop' : out.length ? 'warn' : 'ok';
  const chips = [cur?.record?.section ? `이 단계 실패 ${num('c-fail', cur.record.failSinceUserInput)}/${R.failLimit}` : null,
    GR?.section && !GS.closed ? `이 goal 실패 ${num('c-fail', GR.failSinceUserInput)}/${R.failLimit}` : null, denyChip,
    L.status === 'ok' ? `<a href="#ledger" data-open="ledger">사용자 결정 ${num('c-user', L.userSide)} · AI 판단 ${num('c-ai', L.tally.AI + L.tally['AI·비가역'])}</a>` : null].filter(Boolean);
  const head = level === 'ok' && GS?.closed ? '종결된 goal이라 막힐 단계가 없습니다' : { stop: '멈춰 있습니다', warn: '확인할 것이 있습니다', ok: '막힌 것이 없습니다' }[level];
  return { level, head, reasons: out, chips };
}
const LEVEL_G = { ok: 'ok', warn: 'note', stop: 'block', unknown: 'unknown' }, LEVEL_WORD = { ok: '정상', warn: '주의', stop: '멈춤', unknown: '미확인' };

/* ---------- 상단 띠 ---------- */
const SLOTS = ['conn', 'collected', 'mini', 'change', 'failed'], slotHtml = new Map();
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
  const conn = { connecting: ['is-reconnecting', '연결하는 중'], connected: ['is-connected', '실시간 연결됨'],
    reconnecting: ['is-reconnecting', `다시 연결하는 중${st.attempt ? ` (${st.attempt}번째)` : ''}`], disconnected: ['is-disconnected', '연결 끊김'] }[st.conn];
  stripSlot('conn', `<span class="conn ${conn[0]}"><i aria-hidden="true"></i>${conn[1]}</span>`);
  const collected = stripSlot('collected', `<span class="collected${st.conn === 'disconnected' ? ' is-stale' : ''}" title="저장소 원문을 마지막으로 읽은 시각">읽은 시각 <time datetime="${esc(vm.collectedAt)}">${fHMS(at)}</time></span>`);
  if (collected && st.shownCollected && st.shownCollected !== vm.collectedAt) play(collected.querySelector('time'), [{ opacity: 0, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE1 });
  st.shownCollected = vm.collectedAt;
  /* 머리가 화면 밖으로 나가면 띠에 한 줄 요약을 고정한다 */
  let mini = '';
  if (st.heroGone) {
    const j = judgeNow(now), cur = phaseOf(vm.focus?.current), pv = cur && phaseVoice(cur);
    mini = `<a class="mini mini-${j.level}" href="#now">${G[LEVEL_G[j.level]]}<b>${LEVEL_WORD[j.level]}</b>${cur ? `<span>${esc(nOf(cur))}단계 · ${esc(pv.name)}</span>` : ''}</a>`;
  }
  stripSlot('mini', mini);
  const c = st.lastChange && now - st.lastChange.at < 60000 ? st.lastChange : null;
  stripSlot('change', c && c.count ? `<span class="fresh-tag">방금 ${c.count}곳이 바뀜</span>` : '');
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

/* ---------- 지금: 무슨 작업인가 · 막혔는가 · 다음은 무엇인가 ---------- */
function rail(P) {
  return `<ol class="rail" aria-label="단계 흐름">${P.items.map(p => `<li class="rail-n is-${p.flow}"><a href="#phase-${p.num}" title="${esc(nOf(p))}단계 · ${esc(phaseVoice(p).name)} · ${FLOW[p.flow]}">${G[p.flow]}<span>${esc(nOf(p))}</span><span class="sr">단계 ${FLOW[p.flow]}</span></a></li>`).join('')}</ol>`;
}
/* goal 한 장의 검증 기록 한 줄. 수는 원문 줄 수이고, 기록이 없으면 없다고 쓴다 */
function goalRecSay(r) {
  if (!r?.section) return tag('검증 기록 절이 없어요', 'tag-broken');
  const total = r.pass + r.fail + r.userInput;
  if (!total) return '검증 기록이 아직 없습니다.';
  return `검증 기록 통과 ${num('g-pass', r.pass)} · 실패 ${num('g-fail', r.fail)} · 사용자 입력 ${num('g-ui', r.userInput)}${r.last ? ` · 마지막은 ${esc(markerWord(r.last.marker))}` : ''}`;
}
/* goal 한 장에서 진행 표시([>])가 없을 때의 「지금 단계」. 읽기 실패가 아니라 문서에 적힌 사실을 그대로 말한다 */
function goalIdle(P) {
  const GS = P.goal, n = P.items.length;
  const say = { closed: `종결된 goal입니다. ${n}단계 중 ${GS.done}단계가 완료로 표시돼 있습니다.`,
    'not-started': `${n}단계 중 첫 단계 전입니다.`, between: `${n}단계 중 ${GS.done}단계까지 완료했고, 다음 단계 시작 전입니다.`,
    'all-done': `${n}단계를 모두 완료로 표시했습니다.`, empty: '「진척 단계」 목록에 항목이 없습니다.' }[GS.stage] || '진행 중으로 표시된 단계가 없습니다.';
  const sub = GS.stage === 'not-started' || GS.stage === 'between' ? '진행 중으로 표시(<code class="inline">[&gt;]</code>)된 단계가 아직 없습니다.' : '';
  return `<div class="stage is-${GS.closed || GS.stage === 'all-done' ? 'done' : 'waiting'}"${fxAttr('focus')}>
    <div class="stage-k"><span>지금 단계</span>${GS.status ? `<span class="stage-pos">${md('상태: ' + GS.status)}</span>` : ''}${n ? rail(P) : ''}</div>
    <p class="stage-doing">${say}${freshTag('focus')}</p>
    <p class="stage-goal">${sub ? sub + ' ' : ''}${goalRecSay(P.record)}</p></div>`;
}
function renderNow(now) {
  const vm = st.vm, M = vm.milestone, V = vm.voice || {}, P = vm.phases, F = vm.focus || {}, vmil = V.milestone, ov = V.overview;
  /* 1. 무슨 작업인가 */
  let headline, goal = '', sub = '';
  if (vmil?.line) headline = md(vmil.line.text);
  else if (ov?.sentences?.length) { headline = md(ov.sentences[0]); sub = `<span class="tag tag-rest" title="00_현황판-문장.md가 없어 계획 문서의 「사람용 개요」 첫 문단을 보여 줘요">계획 문서의 사람용 개요</span>`; }
  else if (M.status === 'ok') { headline = md(M.title); sub = NO_VOICE; }
  else headline = '현재 마일스톤을 읽지 못했습니다';
  if (vmil?.goal) goal = `<p class="now-goal"><b>목표</b>${md(vmil.goal.text)}</p>`;
  else if (!vmil?.line && ov?.sentences?.length > 1) goal = `<p class="now-goal">${ov.sentences.slice(1, 3).map(md).join(' ')}</p>`;
  const idLine = M.status === 'ok' ? `<p class="now-id"${fxAttr('milestone')}><span>${md(M.title)}</span>${sub}${freshTag('milestone')}</p>`
    : `<p class="now-id"${fxAttr('milestone')}>${tag('읽지 못함', 'tag-broken')}<span>${esc(srcOf('milestone')?.error || srcOf('pointer')?.error || '')}</span></p>`;

  /* 2. 지금 단계 */
  const cur = phaseOf(F.current);
  let stage;
  const GS = isGoal() ? P.goal : null, GR = GS ? P.record : null;
  if (P.status !== 'ok') stage = `<div class="stage is-unknown"${fxAttr('focus')}><p class="stage-k">지금 단계</p><p class="stage-doing">단계 정보를 읽지 못했습니다.</p><p class="stage-goal">${esc(srcOf('phases')?.error || '')}</p></div>`;
  else if (GS && !cur) stage = goalIdle(P);
  else if (!cur) stage = `<div class="stage"${fxAttr('focus')}><div class="stage-k"><span>지금 단계</span>${rail(P)}</div><p class="stage-doing">${P.items.length ? '모든 단계에 마감 커밋이 있습니다.' : '계획 문서에 단계가 없습니다.'}</p></div>`;
  else {
    const pv = phaseVoice(cur);
    const doing = cur.flow === 'stopped' ? `실패 ${(GR || cur.record).failSinceUserInput}번으로 멈췄습니다. 사용자의 판단을 기다립니다.` : pv.doing;
    stage = `<div class="stage is-${cur.flow}"${fxAttr('focus')}>
      <div class="stage-k"><span>지금 단계</span><span class="stage-pos">${P.items.length}단계 중 <b>${num('cur-n', nOf(cur))}단계</b></span>${rail(P)}</div>
      <h2 class="stage-name"><a href="#phase-${cur.num}">${md(pv.name)}</a>${state(cur.flow, FLOW[cur.flow])}${pv.named ? '' : NO_VOICE}${freshTag('focus')}</h2>
      ${doing ? `<p class="stage-doing">${md(doing)}</p>` : cur.goal ? `<p class="stage-doing is-raw">${md(cur.goal)}</p>` : ''}
      ${pv.goal ? `<p class="stage-goal"><b>목표</b>${md(pv.goal)}</p>` : ''}
      ${GS ? `<p class="stage-goal">${goalRecSay(GR)}${GS.currentCount > 1 ? ' ' + tag(`진행 표시가 ${GS.currentCount}개`, 'tag-candidate') : ''}</p>` : ''}
      ${P.pinDisagrees ? `<p class="stage-note" title="인수인계 메모는 지금이 ${P.pinPhase}단계라고 쓰지만, 커밋 기록으로는 ${cur.num}단계예요. 커밋 기준으로 보여 줘요.">${tag('기록이 서로 달라요', 'tag-candidate')}<span>인수인계 메모는 지금이 ${P.pinPhase}단계라고 쓰지만, 커밋 기록으로는 ${cur.num}단계입니다. 커밋 기준으로 보여 줍니다.</span></p>` : ''}</div>`;
  }

  /* 3. 막혔는가 */
  const j = judgeNow(now);
  const block = `<div class="sig sig-${j.level}" id="sig"><p class="sig-k">막혔나요</p>
    <p class="sig-head">${G[LEVEL_G[j.level]]}<b>${j.head}</b><span class="sig-word">${LEVEL_WORD[j.level]}</span></p>
    ${j.reasons.length ? `<ul class="sig-why">${j.reasons.map(r => `<li class="is-${r.level}">${r.html}</li>`).join('')}</ul>` : ''}
    ${j.chips.length ? `<p class="sig-chips">${j.chips.map(c => `<span>${c}</span>`).join('')}</p>` : ''}</div>`;

  /* 4. 다음 */
  const nx = phaseOf(F.nextPhase), stopped = P.status === 'ok' && P.items.find(p => p.flow === 'stopped');
  let next = '';
  if (stopped) next = `<p class="next-main">사용자의 판단이 필요합니다.</p><p class="next-sub">${esc(nOf(stopped))}단계가 멈춘 이유를 확인하고, 어떻게 할지 메인 세션에 답해 주세요.</p>`;
  else if (GS) {
    /* goal 한 장: 다음은 첫 [ ] 항목이다 */
    if (GS.closed) next = `<p class="next-main">끝난 goal입니다.</p>${GS.status ? `<p class="next-sub">${md('상태: ' + GS.status)}</p>` : ''}<p class="next-sub">다음 goal 문서로 포인터가 옮겨지면 그 단계가 여기에 보입니다.</p>`;
    else if (nx) next = `<p class="next-main"><span class="next-lead">${cur ? '이 단계가 끝나면' : '다음에 시작할 단계'}</span><a href="#phase-${nx.num}">${esc(nOf(nx))}단계 · ${md(nx.name)}</a></p>`;
    else next = `<p class="next-main">남은 단계가 없습니다.</p>${GS.status ? `<p class="next-sub">${md('상태: ' + GS.status)}</p>` : ''}`;
  } else if (cur) {
    const cv = phaseVoice(cur), started = cur.record && cur.record.pass + cur.record.fail + cur.record.userInput > 0;
    if (cv.need && !started) next += `<p class="need">${tag('사용자가 할 일', 'tag-todo')}<span>${md(cv.need)}</span></p>`;
    if (nx) {
      const nv = phaseVoice(nx);
      next += `<p class="next-main"><span class="next-lead">이 단계가 끝나면</span><a href="#phase-${nx.num}">${nx.num}단계 · ${md(nv.name)}</a>${nv.named ? '' : NO_VOICE}</p>
        ${nv.goal ? `<p class="next-sub">${md(nv.goal)}</p>` : nx.goal ? `<p class="next-sub is-raw">${md(nx.goal)}</p>` : ''}
        ${nv.need ? `<p class="need">${tag('시작 전에 사용자가 할 일', 'tag-todo')}<span>${md(nv.need)}</span></p>` : ''}`;
    } else next += `<p class="next-main">마지막 단계입니다.</p>${vmil?.after ? `<p class="next-sub">${md(vmil.after.text)}</p>` : ''}`;
  } else if (P.status === 'ok' && vmil?.after) next = `<p class="next-main">남은 단계가 없습니다.</p><p class="next-sub">${md(vmil.after.text)}</p>`;
  else next = '<p class="next-sub">다음 단계를 정하지 못했습니다.</p>';
  const pinNext = F.pinNext ? fold('raw-next', '원문 보기 <small>에이전트가 인수인계 메모에 쓴 다음 할 일</small>', sents(F.pinNext.parts) + srcLink({ path: vm.pin.path, line: F.pinNext.line }), 'raw') : '';
  const nextBox = `<div class="next"${fxAttr('next')}><p class="next-k">다음은</p>${next}${pinNext}</div>`;

  paint($('#now'), `<div class="now-what">${idLine}<h1 class="now-line">${headline}</h1>${goal}</div>${stage}<div class="now-pair">${block}${nextBox}</div>`);
}

/* ---------- 작업 단계 ---------- */
const markerWord = m => m === 'PASS' ? '통과' : m === 'FAIL' ? '실패' : m === 'USER-INPUT' ? '사용자 입력' : m;
const RAW_STATE = { 'no-record-section': '검증 기록 절이 없어요', 'no-section': '계획 문서에 이 단계의 절이 없어요' };
/* goal 한 장의 단계 한 줄: 「진척 단계」 항목 글이 이름이고, 원문은 그 줄과 출처다 */
function goalStepRow(p) {
  const k = 'phase:' + p.num, rec = st.vm.phases.record;
  const raw = `<dl class="rawkv"><dt>goal 문서의 줄</dt><dd><code class="inline">- [${esc(p.mark)}]${p.label ? ' ' + esc(p.label) + '.' : ''}</code> ${md(p.name)}${p.odd ? ' ' + tag('알 수 없는 표시라 대기로 봄', 'tag-candidate') : ''}</dd></dl>${srcLink(p.ref)}`;
  return `<li class="step is-${p.flow}" id="phase-${p.num}"${fxAttr(k)}>
    <div class="step-mark" aria-hidden="true">${G[p.flow]}</div>
    <div class="step-body">
      <h3 class="step-title"><span class="step-n">${esc(nOf(p))}단계</span><span class="step-name">${md(p.name)}</span>${state(p.flow, FLOW[p.flow])}${freshTag(k)}</h3>
      ${p.flow === 'stopped' ? `<p class="step-say">실패 ${esc(rec.failSinceUserInput)}번으로 멈췄습니다. 사용자의 판단을 기다립니다.</p>` : ''}
      ${fold('raw-phase-' + p.num, '원문 보기', raw, 'raw')}
    </div></li>`;
}
function phaseRow(p, now, limit) {
  if (isGoal()) return goalStepRow(p);
  const k = 'phase:' + p.num, r = p.record, pv = phaseVoice(p);
  const sentence = p.flow === 'stopped' ? `실패 ${r.failSinceUserInput}번으로 멈췄습니다. 사용자의 판단을 기다립니다.`
    : p.flow === 'done' ? pv.done : p.flow === 'current' ? pv.doing : null;
  const aux = [];
  if (r?.section) { aux.push(`검증 통과 ${num(k + ':p', r.pass)}`); aux.push(`<span class="${r.fail ? 'is-fail' : ''}">실패 ${num(k + ':f', r.fail)}</span>`); }
  else if (RAW_STATE[p.state]) aux.push(tag(RAW_STATE[p.state], 'tag-broken'));
  if (p.commit) aux.push(`마감 커밋 <span class="mono">${esc(p.commit.hash)}</span>`);
  if (r?.last) { const at = parseAt(r.last.at); if (at) aux.push(`마지막 기록 ${relSpan(at)}`); }
  /* 원문: 계획 문서의 이름·태그·목표, 검증 기록의 수와 마지막 줄 */
  let raw = `<dl class="rawkv"><dt>계획 문서의 이름</dt><dd>${md(p.name)} ${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join(' ')}${p.inTable ? '' : ' ' + tag('「Phase 흐름」 표에 없음', 'tag-candidate')}${p.duplicate ? ' ' + tag('같은 번호의 절이 둘 이상', 'tag-candidate') : ''}</dd>
    ${p.goal ? `<dt>계획 문서의 목표</dt><dd>${md(p.goal)}</dd>` : ''}
    ${r?.section ? `<dt>검증 기록</dt><dd>PASS ${r.pass} · FAIL ${r.fail} · USER-INPUT ${r.userInput} · 마지막 USER-INPUT 이후 FAIL ${r.failSinceUserInput}/${limit}</dd>` : ''}
    ${p.commit ? `<dt>마감 커밋</dt><dd><span class="mono">${esc(p.commit.hash)}</span> ${esc(p.commit.subject)}</dd>` : ''}</dl>`;
  if (r?.last) {
    const at = parseAt(r.last.at);
    raw += `<p class="raw-h">마지막 기록 줄 <span class="chip">${esc(markerWord(r.last.marker))}</span>${at ? ` <time datetime="${esc(r.last.at)}">${fWhen(at, now)}</time>` : ''}</p><p class="rawtext">${md(r.last.text)}</p>${srcLink({ path: r.last.file, line: r.last.line })}`;
  } else raw += srcLink(p.ref || p.tableRef);
  const v = pv.v, vref = v && (v.name || v.doing || v.goal || v.done);
  if (vref) raw += `<p class="raw-h">사람 문장의 출처</p>${srcLink({ path: st.vm.voice.path, line: v.sectionLine })}`;
  return `<li class="step is-${p.flow}" id="phase-${p.num}"${fxAttr(k)}>
    <div class="step-mark" aria-hidden="true">${G[p.flow]}</div>
    <div class="step-body">
      <h3 class="step-title"><span class="step-n">${p.num}단계</span><span class="step-name">${md(pv.name)}</span>${state(p.flow, FLOW[p.flow])}${pv.named ? '' : NO_VOICE}${freshTag(k)}</h3>
      ${sentence ? `<p class="step-say">${md(sentence)}</p>` : ''}
      ${pv.goal && p.flow !== 'done' ? `<p class="step-goal"><b>목표</b>${md(pv.goal)}</p>` : !pv.v && p.goal ? `<p class="step-goal is-raw">${md(p.goal)}</p>` : ''}
      ${pv.need && (p.flow === 'waiting' || (p.flow === 'current' && r && r.pass + r.fail + r.userInput === 0)) ? `<p class="need">${tag('시작 전에 사용자가 할 일', 'tag-todo')}<span>${md(pv.need)}</span></p>` : ''}
      ${aux.length ? `<p class="step-aux">${aux.map(a => `<span>${a}</span>`).join('')}</p>` : ''}
      ${fold('raw-phase-' + p.num, '원문 보기', raw, 'raw')}
    </div></li>`;
}
function renderPhases(now) {
  const el = $('#phases'), P = st.vm.phases, limit = st.vm.rules.failLimit;
  const head = sum => `<header class="area-head"><h2 id="phases-h">작업 단계</h2><div class="area-sum">${sum}</div></header>`;
  if (P.status !== 'ok') { paint(el, head(tag('읽지 못함', 'tag-broken')) + failedBlock(P, '단계와 검증 기록을 읽지 못했어요.', '단계 수와 기록 수는 미확인이고, 0이라는 뜻이 아니에요.')); return; }
  const n = f => P.items.filter(p => p.flow === f).length;
  const sum = ['stopped', 'done', 'current', 'waiting'].filter(f => n(f)).map(f => `<span class="count count-${f}">${G[f]}${FLOW[f]} ${num('ph-' + f, n(f))}</span>`).join('');
  const basis = { commit: `커밋 제목에 <code class="inline">${esc(P.milestoneId)}-P번호</code>가 있는 단계를 완료로, 그런 커밋이 없는 첫 단계를 진행 중으로 봅니다.`,
    pin: '커밋 기록을 읽지 못해, 인수인계 메모의 「상태」 문장에 적힌 단계를 진행 중으로 봅니다.', record: '커밋 기록과 인수인계 메모로 정하지 못해, 검증 기록이 있는 마지막 단계를 진행 중으로 봅니다.',
    steps: 'goal 문서 「진척 단계」의 표시를 그대로 읽습니다. <code class="inline">[x]</code>는 완료, <code class="inline">[&gt;]</code>는 진행 중, <code class="inline">[ ]</code>는 대기입니다. 통과 판정은 검증 기록 줄만 합니다.' }[P.basis] || '';
  /* goal 한 장은 검증 기록이 goal 전체에 하나라서 목록 위에 한 줄로 둔다 */
  let goalHead = '';
  if (P.format === 'goal') {
    const r = P.record, at = r?.last && parseAt(r.last.at);
    const rawRec = r?.last ? `<p class="raw-h">마지막 기록 줄 <span class="chip">${esc(markerWord(r.last.marker))}</span>${at ? ` <time datetime="${esc(r.last.at)}">${fWhen(at, now)}</time>` : ''}</p><p class="rawtext">${md(r.last.text)}</p>${srcLink({ path: r.last.file, line: r.last.line })}`
      : srcLink(r?.ref || P.goal.ref);
    goalHead = `<div class="goal-rec"${fxAttr('phases-rec')}><p class="step-aux">${P.goal.status ? `<span>${md('상태: ' + P.goal.status)}</span>` : ''}<span>${goalRecSay(r)}</span>${at ? `<span>마지막 기록 ${relSpan(at)}</span>` : ''}${freshTag('phases-rec')}</p>${fold('raw-goal-rec', '원문 보기 <small>검증 기록</small>', rawRec, 'raw')}</div>`;
  }
  paint(el, head(sum) + goalHead + (P.items.length ? `<ol class="steps" data-list="phases">${P.items.map(p => phaseRow(p, now, limit)).join('')}</ol>` : '<p class="empty">계획 문서에 단계가 없어요.</p>')
    + `<p class="area-foot">${basis} 실패가 ${limit}번 쌓이면 멈춤입니다. 진행률은 계산하지 않습니다.</p>`);
}

/* ---------- 검사 활동(훅) ---------- */
const hue = id => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const sessTag = e => e.session ? `<span class="sess" style="--h:${hue(e.session)}" title="세션 ${esc(e.session)}">${esc(e.sessionShort)}${e.sub ? '<small>하위</small>' : ''}</span>` : '<span class="sess is-none">세션 없음</span>';
const hookSay = e => e.say ? esc(e.say) : `<span class="rawline">${esc(e.hook || '훅 이름 없음')} · ${esc(e.verdict || '판정 없음')}${e.rule ? ` · ${esc(e.rule)}` : ''}</span>`;
const hookId = e => `${esc(e.hook || '')}${e.verdict ? ` · ${esc(e.verdict)}` : ''}${e.rule ? ` · ${esc(e.rule)}` : ''}`;
const levelOf = e => e.deny ? 'block' : e.level || 'unknown';
function renderHooks(now) {
  const el = $('#hooks'), H = st.vm.hooks, R = st.vm.rules;
  const head = sum => `<header class="area-head"><h2 id="hooks-h">검사 활동</h2><div class="area-sum">${sum}</div></header>`;
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
  const sum = [denies.length ? `<span class="count count-stopped">${G.block}막음 ${num('hk-deny', denies.length)}</span>` : `<span class="count count-done">${G.ok}막음 없음</span>`, `<span>세션 ${num('hk-sess', H.sessions.length)}</span>`, H.bad ? tag(`읽지 못한 줄 ${H.bad}`, 'tag-candidate') : ''].filter(Boolean).join('');
  paint(el, head(sum) + `<h3 class="sub-h">검사가 막은 작업 <span>${denies.length}건</span></h3>${denyHtml}
    <h3 class="sub-h">최근 흐름 <span>최신이 위</span></h3>${picks}${flow}
    <p class="area-foot">자동 검사(훅)가 남긴 기록의 마지막 ${H.lines}줄을 읽습니다${H.truncated ? '(파일 앞부분은 읽지 않음)' : ''}. 문장은 고정 사전에서 오고, 사전에 없는 판정은 기록된 글자 그대로 보입니다. ${srcLink({ path: H.path })}</p>`);
}

/* ---------- 커밋하지 않은 변경(작업 사본) ---------- */
const CHANGE = c => c === '??' ? '새 파일' : /U|AA|DD/.test(c) ? '충돌' : c.includes('R') ? '이름 바꿈' : c.includes('A') ? '추가' : c.includes('D') ? '삭제' : c.includes('M') ? '수정' : c.includes('T') ? '형식 바뀜' : c.includes('C') ? '복사' : c.trim();
const SHOW_CHANGES = 200;
function renderTree(now) {
  const el = $('#tree'), W = st.vm.worktree;
  const head = sum => `<header class="area-head"><h2 id="tree-h">커밋하지 않은 변경</h2><div class="area-sum">${sum}</div></header>`;
  if (W.status !== 'ok') { paint(el, head(tag('읽지 못함', 'tag-broken')) + failedBlock(W, '작업 사본을 읽지 못했어요.', '브랜치와 변경 파일 수는 미확인이고, 변경이 없다는 뜻이 아니에요.')); return; }
  const C = W.compare, headAt = parseAt(W.head.committedAt), fetched = parseAt(W.fetchedAt), n = W.changes.length;
  const kinds = new Map(); for (const c of W.changes) kinds.set(CHANGE(c.code), (kinds.get(CHANGE(c.code)) || 0) + 1);
  const say = n ? `커밋하지 않은 파일이 <b>${num('tr-n', n)}개</b> 있습니다.` : '커밋하지 않은 파일이 없습니다.';
  const kindLine = n ? `<p class="tree-kinds">${[...kinds].map(([k, v]) => `<span class="chip">${esc(k)} ${v}</span>`).join('')}</p>` : '';
  const sync = !C ? `<li>${G.unknown}<span>원격과 비교할 기준을 찾지 못했습니다.</span></li>`
    : `<li>${G.quiet}<span>원격(<span class="mono">${esc(C.ref)}</span>)보다 커밋 ${num('tr-ahead', C.ahead)}개 앞서 있고, ${C.behind ? `${num('tr-behind', C.behind)}개 뒤처져 있습니다` : '뒤처진 커밋은 없습니다'}.
        <small>${C.kind === 'default' ? '원격에 이 브랜치가 없어 기본 브랜치와 비교했습니다. ' : ''}원격을 마지막으로 확인한 때는 ${fetched ? `${fDate(fetched)} ${fHM(fetched)}` : '기록이 없습니다'}. 이 화면은 원격을 확인하지 않습니다.</small></span></li>`;
  /* 폴더별로 묶어 훑기 쉽게 한다 */
  const byDir = new Map();
  for (const c of W.changes.slice(0, SHOW_CHANGES)) { const i = c.path.lastIndexOf('/'), d = i >= 0 ? c.path.slice(0, i + 1) : './'; (byDir.get(d) || byDir.set(d, []).get(d)).push({ ...c, file: c.path.slice(i + 1) }); }
  const files = [...byDir].map(([d, items]) => `<li class="dir"><p class="dir-name">${esc(d).replace(/\//g, '/<wbr>')}</p><ul>${items.map(c => `<li class="chg${c.code === '??' ? ' is-new' : ''}"><span class="chg-k">${esc(CHANGE(c.code))}</span><span class="chg-p">${esc(c.from ? `${c.from} → ${c.file}` : c.file)}</span></li>`).join('')}</ul></li>`).join('');
  paint(el, head(n ? `<span class="count">${num('tr-n2', n)}개</span>` : `<span class="count count-done">${G.ok}없음</span>`)
    + `<p class="tree-say"${fxAttr('tree-changes')}>${say} ${freshTag('tree-changes')}</p>${kindLine}
    ${n ? `<ul class="dirs">${files}</ul>${n > SHOW_CHANGES ? `<p class="empty">그 밖에 ${n - SHOW_CHANGES}개가 더 있어요.</p>` : ''}` : ''}
    <ul class="facts">
      <li${fxAttr('tree-head')}>${G.quiet}<span><span class="mono">${esc(W.branch)}</span> 브랜치에서 작업 중입니다.${W.detached ? ' ' + tag('분리된 HEAD', 'tag-candidate') : ''} ${freshTag('tree-head')}</span></li>
      <li>${G.quiet}<span>마지막 커밋은 ${headAt ? relSpan(headAt) : '시각 미확인'}입니다.<small><span class="mono">${esc(W.head.hash)}</span> ${esc(W.head.subject)}</small></span></li>
      ${sync.replace('<li>', `<li${fxAttr('tree-sync')}>`)}
    </ul>`);
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
  paint(el, panel('ledger', '결정 기록', `사용자 결정 ${num('lg-u', L.userSide)}건 · AI 판단 ${num('lg-a', ai)}건${L.gate !== 'clear' ? ' ' + tag('워커 띄우기 막힘', 'tag-todo') : ''}`,
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
  else { renderStrip(now); fillRel(now); }
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
$('#keys').innerHTML = '자판 <kbd>1</kbd>~<kbd>5</kbd> 영역 이동 · <kbd>t</kbd> 밝기 바꾸기 · <kbd>o</kbd> 원문 모두 펼치기';
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
connect();
beat();
})();
