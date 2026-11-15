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

test('app.js: entrances go through play() with remembered keys, never through a class in the painted html', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(app, /const VIEW = globalThis\.AgentDeckView \|\| null;/);
  assert.match(body('renderNow'), /enter\(/, '「지금」을 그린 뒤 등장 대상을 고른다');
  assert.match(body('enter'), /VIEW\.enterKeys\(/);
  assert.match(body('enter'), /play\(/, '동작은 play()라 동작 줄이기와 숨은 탭에서 꺼진다');
  assert.doesNotMatch(app, /is-enter/, '등장 동작을 그리는 HTML의 class로 걸지 않는다(다시 그릴 때마다 돈다)');
});

test('app.js: the ring is hatched, not zero, when the steps cannot be read', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  assert.match(body('ringBlock'), /VIEW\.stepRing\(P\)/);
  assert.match(body('ringBlock'), /if \(!r\) return [^\n]*ring is-unknown/, '단계를 못 읽으면 빗금 링과 「단계 미확인」');
  assert.match(body('doingBlock'), /VIEW\.doingTone\(\{ hand: handLevel\(now\), phases: P \}\)/, '카드 상태는 화면이 쓰는 손 수준(fresh 필터 뒤)으로 정한다');
});

test('app.js: the where block keeps its sentence and adds done / now / left number cards from the same goal list', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  const where = body('whereBlock');
  assert.match(where, /goal \$\{Gs\.total\}개 중 \$\{Gs\.done\}개 완료/, '「goal N개 중 k개 완료 …」 문장은 그대로 있다');
  for (const [k, word] of [['is-done', '완료'], ['is-now', '지금'], ['is-left', '남음']]) assert.match(where, new RegExp(`'${k}'[^\\n]*?'${word}'`), k);
  assert.match(where, /data-enter="\$\{esc\(g\.id\)\}"/, 'goal 칩은 id를 등장 키로 쓴다');
});

test('app.js: the verification record becomes pass / fail / user-input number cards, still only in the steps area', async () => {
  const app = await read('../public/app.js');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  const rec = body('recordLine');
  for (const [key, word] of [['g-pass', '통과'], ['g-fail', '실패'], ['g-ui', '사용자 입력']]) assert.match(rec, new RegExp(`'${word}', num\\('${key}'`), word);
  assert.match(rec, /검증 기록은 아직 없어요\./, '기록이 없으면 0 카드가 아니라 그 문장');
  assert.match(rec, /tag\('검증 기록 절이 없어요', 'tag-broken'\)/);
  assert.equal((app.match(/num\('g-pass'/g) || []).length, 1, '기록 수는 단계 영역 한 곳에만 있다');
  // <dl>은 <p> 안에 들 수 없다(파서가 <p>를 먼저 닫는다). 기록 줄을 감싸는 요소는 div다
  assert.match(body('renderPhases'), /<div class="goal-rec"\$\{fxAttr\('phases-rec'\)\}>\$\{recordLine\(r, now\)\}/);
});

test('styles: the doing card and goal chips use only the existing colour meanings and no CSS animation', async () => {
  const css = await read('../public/styles.css');
  const rule = sel => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*\\}`)) || [''])[0];
  for (const [sel, token] of [['.doing-card.tone-live', '--info'], ['.doing-card.tone-todo', '--todo'], ['.doing-card.tone-stop', '--broken'], ['.doing-card.tone-done', '--ok'], ['.doing-card.tone-rest', '--ink-3'],
    ['.tk.is-done', '--ok'], ['.tk.is-here', '--info'], ['.stat.is-fail', '--broken']]) {
    assert.match(rule(sel), new RegExp(`var\\(${token}`), `${sel} → ${token}`);
  }
  assert.doesNotMatch(rule('.doing-card.tone-todo'), /--broken/, '내 손 필요(노랑)는 멈춤(빨강)과 다르다');
  assert.doesNotMatch(rule('.doing-card.tone-rest'), /--info|--todo|--broken|--ok/, '대기는 회색(쉼)');
  for (const sel of ['.doing-card', '.tk', '.tk.is-here', '.ring', '.stat']) assert.doesNotMatch(rule(sel), /animation\s*:/, `${sel}에는 CSS 동작이 없다`);
  // 「지금」 영역의 첫 줄 규칙(.q:first-child의 검정 윗선)이 카드 윗변 색을 덮지 않는다. 두께만 맞춘다
  assert.doesNotMatch(rule('.q.doing-card:first-child'), /var\(/);
  // 그래서 상태마다 테두리 색을 스스로 정한다. 확인 안 됨과 상태 없는 카드도 검정 윗선이 남지 않는다
  for (const sel of ['.doing-card.tone-unknown', '.q.doing-card']) assert.match(rule(sel), /border-color:var\(--rule-2\)/, sel);
  // 지금 goal 칩이 줄에서 가장 눈에 띈다: 파랑 채움에 바깥 고리. 남은 goal은 면 없이 점선이다
  assert.match(rule('.tk.is-here'), /box-shadow:0 0 0 \d+px var\(--info-tint\)/);
  assert.match(rule('.tk.is-left'), /border-style:dashed[^}]*background:none/);
});

test('styles: under 720px the card puts its text under the glyph and ring so the three answers still fit the first screen', async () => {
  const css = await read('../public/styles.css');
  const narrow = css.slice(css.indexOf('@container dash (width < 720px){\n  /* 좁은 폭: 질문을'));
  const block = narrow.slice(0, narrow.indexOf('\n}\n'));
  assert.match(block, /\.q\.doing-card\{[^}]*grid-template-areas:"glyph head ring" "body body body"/);
  assert.match(block, /\.ring\{[^}]*width:(\d+)px/);
  assert.ok(Number(block.match(/\.ring\{[^}]*width:(\d+)px/)[1]) <= 64, '좁은 폭의 링은 64px 이하');
});

test('styles: hierarchy — area heads are larger than the answers under the three questions, and the doing line is the largest', async () => {
  const css = await read('../public/styles.css');
  const size = re => Number((css.match(re) || [])[1]);
  const head = size(/\n:root\{[^}]*--fs-h:(\d+)px/), line = size(/\n\.q-line\{font-size:clamp\((\d+)px/), doing = size(/\n\.q-doing \.q-line\{font-size:clamp\((\d+)px/);
  assert.ok(head >= 22, `영역 머리 ${head}px`);
  assert.ok(doing > head && head >= line - 1, `지금 하는 일 ${doing}px > 영역 머리 ${head}px ≥ 답 ${line}px 근처`);
});
