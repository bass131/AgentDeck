// 화면 모양의 판단(public/chime.js의 AgentDeckView): 「지금 하는 일」 카드 상태, 단계 진척 링, 등장 동작 대상. M05 H6.
// chime.js는 classic script라 전역에 붙는다. 시험은 파일을 불러 그 전역을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../public/chime.js';

const V = globalThis.AgentDeckView;
const { doingTone, stepRing, enterKeys } = V;

const goal = (stage, flows = ['done', 'current', 'waiting']) => ({ status: 'ok', format: 'goal', goal: { stage },
  items: flows.map((flow, i) => ({ num: String(i + 1), flow })) });
const multi = flows => ({ status: 'ok', format: 'multi', items: flows.map((flow, i) => ({ num: i + 1, flow })) });

test('the view module is frozen, pure and separate from the chime module', () => {
  assert.ok(Object.isFrozen(V));
  assert.notEqual(V, globalThis.AgentDeckChime);
  for (const fn of [doingTone, stepRing, enterKeys]) assert.equal(typeof fn, 'function');
});

test('doing card tone: stop beats the hand, the hand beats done, done beats running', () => {
  assert.equal(doingTone({ hand: 'stop', phases: goal('running') }).tone, 'stop');
  assert.equal(doingTone({ hand: 'ok', phases: goal('stopped', ['done', 'stopped']) }).tone, 'stop', '멈춘 단계는 손 목록과 무관하게 빨강');
  assert.equal(doingTone({ hand: 'todo', phases: goal('running') }).tone, 'todo');
  // 병합 대기: 단계를 모두 마쳤어도 사용자가 할 일이 있으면 노랑이다
  assert.equal(doingTone({ hand: 'todo', phases: goal('all-done', ['done', 'done']) }).tone, 'todo');
  assert.equal(doingTone({ hand: 'ok', phases: goal('all-done', ['done', 'done']) }).tone, 'done');
  assert.equal(doingTone({ hand: 'ok', phases: goal('closed', ['done', 'done']) }).tone, 'done');
  assert.equal(doingTone({ hand: 'ok', phases: goal('running') }).tone, 'live');
});

test('doing card tone: not started, between steps and unreadable are grey, never blue', () => {
  assert.deepEqual(doingTone({ hand: 'ok', phases: goal('not-started', ['waiting', 'waiting']) }), { tone: 'rest', word: '대기', glyph: 'waiting' });
  assert.equal(doingTone({ hand: 'ok', phases: goal('between', ['done', 'waiting']) }).tone, 'rest');
  assert.deepEqual(doingTone({ hand: 'ok', phases: { status: 'failed', items: [] } }), { tone: 'unknown', word: '확인 안 됨', glyph: 'unknown' });
  assert.equal(doingTone({ hand: 'ok', phases: goal('empty', []) }).tone, 'unknown');
  assert.equal(doingTone({ hand: 'ok', phases: null }).tone, 'unknown');
});

test('doing card tone: words and glyphs reuse the words already on screen', () => {
  assert.deepEqual(doingTone({ hand: 'stop', phases: goal('running') }), { tone: 'stop', word: '멈춤', glyph: 'stopped' });
  assert.deepEqual(doingTone({ hand: 'todo', phases: goal('running') }), { tone: 'todo', word: '내 손 필요', glyph: 'note' });
  assert.deepEqual(doingTone({ hand: 'ok', phases: goal('closed', ['done']) }), { tone: 'done', word: '완료', glyph: 'done' });
  assert.deepEqual(doingTone({ hand: 'ok', phases: goal('running') }), { tone: 'live', word: '진행 중', glyph: 'current' });
});

test('doing card tone: the multi-file format reads the step flows', () => {
  assert.equal(doingTone({ hand: 'ok', phases: multi(['done', 'current', 'waiting']) }).tone, 'live');
  assert.equal(doingTone({ hand: 'ok', phases: multi(['done', 'done']) }).tone, 'done');
  assert.equal(doingTone({ hand: 'ok', phases: multi(['done', 'stopped']) }).tone, 'stop');
  assert.equal(doingTone({ hand: 'ok', phases: multi(['waiting', 'waiting']) }).tone, 'rest');
});

test('step ring: done share and the one current step, in percent of the circle', () => {
  const r = stepRing(goal('running', ['done', 'done', 'done', 'current', 'waiting', 'waiting', 'waiting', 'waiting']));
  assert.deepEqual(r, { total: 8, done: 3, now: 1, stopped: false, donePct: 37.5, nowPct: 12.5 });
  assert.deepEqual(stepRing(goal('all-done', ['done', 'done', 'done'])), { total: 3, done: 3, now: 0, stopped: false, donePct: 100, nowPct: 0 });
  assert.equal(stepRing(goal('stopped', ['done', 'stopped', 'waiting'])).stopped, true);
  assert.equal(stepRing(goal('not-started', ['waiting', 'waiting'])).donePct, 0);
  // 셋으로 나누면 끝자리가 무한하다. 소수 한 자리로 자른다
  assert.equal(stepRing(goal('running', ['done', 'current', 'waiting'])).donePct, 33.3);
});

test('step ring: unreadable or empty steps give no ring (the screen draws hatching, not zero)', () => {
  assert.equal(stepRing({ status: 'failed', items: [] }), null);
  assert.equal(stepRing(goal('empty', [])), null);
  assert.equal(stepRing(null), null);
});

test('enter keys: everything enters the first time, then only new keys and changed states', () => {
  const first = enterKeys(null, [['G1', 'done'], ['G2', 'current']]);
  assert.deepEqual(first.enter, ['G1', 'G2']);
  const same = enterKeys(first.seen, [['G1', 'done'], ['G2', 'current']]);
  assert.deepEqual(same.enter, [], 'SSE가 같은 상태를 다시 보내면 아무것도 움직이지 않는다');
  const moved = enterKeys(same.seen, [['G1', 'done'], ['G2', 'done'], ['G3', 'current']]);
  assert.deepEqual(moved.enter, ['G2', 'G3']);
  // 사라진 키는 잊는다. 다시 나타나면 처음 보이는 것이다
  const gone = enterKeys(moved.seen, [['G1', 'done']]);
  assert.deepEqual(gone.enter, []);
  assert.deepEqual(enterKeys(gone.seen, [['G1', 'done'], ['G3', 'current']]).enter, ['G3']);
});

test('enter keys: the memory it returns is a fresh map and the input is untouched', () => {
  const seen = new Map([['G1', 'done']]);
  const out = enterKeys(seen, [['G1', 'current']]);
  assert.deepEqual([...seen], [['G1', 'done']]);
  assert.deepEqual([...out.seen], [['G1', 'current']]);
});

const read = async p => (await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

// app.js 배선(등장 동작·띠 읽은 시각·빗금 링·어디쯤 띠·검증 기록 숫자 카드)은 test/m11-g5-dom.test.mjs가 jsdom에서 동작으로 본다(M11 G6, Backlog 41).
const ruleOf = css => sel => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*\\}`)) || [''])[0];

test('styles: the doing card and the progress band use only the existing colour meanings and no CSS animation', async () => {
  const css = await read('../public/styles.css');
  const rule = ruleOf(css);
  for (const [sel, token] of [['.doing-card.tone-live', '--info'], ['.doing-card.tone-todo', '--todo'], ['.doing-card.tone-stop', '--broken'], ['.doing-card.tone-done', '--ok'], ['.doing-card.tone-rest', '--ink-3'],
    ['.bc.is-done', '--ok'], ['.bc.is-here', '--info'], ['.stat.is-fail', '--broken']]) {
    assert.match(rule(sel), new RegExp(`var\\(${token}`), `${sel} → ${token}`);
  }
  assert.doesNotMatch(rule('.doing-card.tone-todo'), /--broken/, '내 손 필요(노랑)는 멈춤(빨강)과 다르다');
  assert.doesNotMatch(rule('.doing-card.tone-rest'), /--info|--todo|--broken|--ok/, '대기는 회색(쉼)');
  for (const sel of ['.doing-card', '.band', '.bc', '.bc.is-here', '.ring', '.stat']) assert.doesNotMatch(rule(sel), /animation\s*:/, `${sel}에는 CSS 동작이 없다`);
  // H8 체크리스트 4: 카드는 옅은 면과 1px 상태색 테두리 두 장치만 쓴다. 그라데이션 바림, 6px 안쪽 막대, 그림자는 없다
  for (const tone of ['live', 'todo', 'stop', 'done']) {
    const r = rule(`.doing-card.tone-${tone}`);
    assert.doesNotMatch(r, /transparent \d+%|inset 6px|--shadow-card/, `tone-${tone}`);
    assert.match(r, /-tint\)/, `tone-${tone}은 옅은 면`);
  }
  assert.doesNotMatch(rule('.doing-card'), /--shadow-card|border:1\.5px/);
  // H8 체크리스트 8: 읽는 면은 약한 테두리(--rule), 확인 안 됨의 점선은 보이도록 한 단 강하게(--rule-2)
  assert.match(rule('.q.doing-card'), /border-color:var\(--rule\)/);
  assert.match(rule('.doing-card.tone-unknown'), /border-color:var\(--rule-2\)/);
  // 지금 칸이 띠에서 가장 눈에 띈다: 파랑 채움, 더 높은 칸, 바깥 고리. 남은 goal은 면 없이 점선이다
  assert.match(rule('.bc.is-here'), /box-shadow:0 0 0 \d+px var\(--info-tint\)/);
  assert.match(rule('.bc.is-left'), /border-style:dashed[^}]*background:none/);
});

test('styles: under 720px the card puts its text under the head and ring so the first screen still fits', async () => {
  const css = await read('../public/styles.css');
  const narrow = css.slice(css.indexOf('@container dash (width < 720px){\n  /* 좁은 폭: '));
  const block = narrow.slice(0, narrow.indexOf('\n}\n'));
  assert.match(block, /\.q\.doing-card\{[^}]*grid-template-areas:"head ring" "body body"/);
  assert.match(block, /\.ring\{[^}]*width:(\d+)px/);
  assert.ok(Number(block.match(/\.ring\{[^}]*width:(\d+)px/)[1]) <= 64, '좁은 폭의 링은 64px 이하');
});

// H8 체크리스트 2·3·7: 굵기 3단, 크기 5단. 큰 글은 「지금 하는 일」 한 줄뿐이고, 라벨은 답 위의 작은 머리말이다. 폭과 무관하게 왼쪽 끝이 하나다.
test('styles: hierarchy — three weights, five sizes, the doing line is the only display size, labels sit above their answers', async () => {
  const css = await read('../public/styles.css');
  const rule = ruleOf(css), root = rule(':root');
  for (const t of ['--fw-1', '--fw-2', '--fw-3']) assert.match(root, new RegExp(`${t}:\\d+`), t);
  for (const t of ['--fs-cap', '--fs-sm', '--fs-body', '--fs-lg', '--fs-display']) assert.match(root, new RegExp(`${t}:`), t);
  assert.doesNotMatch(root, /--fs-h:|--fs-say:/, '옛 크기 토큰은 없다');
  const body = css.slice(css.indexOf('*{box-sizing'));
  assert.deepEqual(body.match(/font-weight:\s*\d+/g) || [], [], '굵기는 토큰으로만 쓴다');
  assert.deepEqual(body.match(/font-size:\s*[\d.]+px/g) || [], [], '크기는 토큰으로만 쓴다');
  assert.equal((body.match(/var\(--fs-display\)/g) || []).length, 1, '가장 큰 글은 하나');
  assert.match(rule('.q-doing .q-line'), /var\(--fs-display\)/);
  assert.match(rule('.q-k'), /font-size:var\(--fs-cap\)[^}]*color:var\(--ink-3\)/, '라벨은 값보다 작고 흐리다');
  assert.match(rule('.q'), /grid-template-columns:minmax\(0,1fr\)/, '라벨 열이 없다 — 라벨은 답 위');
});

// H8 체크리스트 5·10: 영역 머리의 2px 잉크 줄과 빨강 사선 장식이 없고, 상태 알약은 한 부품이다.
test('styles: no 2px ink rules or red hatch decoration; lozenges share one base rule', async () => {
  const css = await read('../public/styles.css');
  const rule = ruleOf(css);
  assert.doesNotMatch(css, /border(-top)?:\s*2px solid var\(--ink\)/, '영역을 가르는 2px 잉크 줄이 없다(초점 고리는 선이 아니라 outline이라 남는다)');
  assert.doesNotMatch(css, /\.now::before/);
  assert.doesNotMatch(css, /--accent-line\)/);
  assert.match(css, /\n\.lz, \.tag, \.state, \.doing-word\{[^}]*border-radius:999px/, '.lz·.tag·.state·.doing-word는 한 기본 규칙');
  assert.match(rule('.tag-todo'), /background:var\(--todo\)/, '꽉 찬 면은 할 일(노랑)…');
  assert.match(rule('.state-stopped'), /background:var\(--broken\)/, '…과 멈춤(빨강)');
  assert.doesNotMatch(rule('.state-done'), /background:var\(--ok\)/, '완료는 꽉 찬 면이 아니다');
});

// H8 체크리스트 12: 지금 단계는 면 대신 고리로 튄다. 멈춘 단계(지금 단계이기도 하다)의 고리는 파랑이 아니라 빨강이다.
test('styles: the step timeline rings the current step in blue, a stopped step in red, and drops the gradient fill', async () => {
  const css = await read('../public/styles.css');
  const rule = ruleOf(css);
  assert.match(rule('.step.is-here .step-mark .g'), /box-shadow:0 0 0 \d+px var\(--info-tint\)/);
  assert.match(rule('.step.is-stopped .step-mark .g'), /box-shadow:0 0 0 \d+px var\(--broken-tint\)/);
  assert.ok(css.indexOf('\n.step.is-stopped .step-mark .g{') > css.indexOf('\n.step.is-here .step-mark .g{'), '멈춤 규칙이 뒤에 와서 이긴다');
  assert.doesNotMatch(css, /\.step\.is-here\{[^}]*gradient/);
});
