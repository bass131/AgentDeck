// 결정 응답의 순수 함수(lib/decisions.mjs): 보드 판독, 목록 서명, 선택 가능 판정, 코멘트 정리, 문장 조립, 고른 답 검사.
// 본보기는 C:\Dev\DawnHolder_Dashboard 의 lib/answer.mjs·web/lib/answers.mjs다. 병합 승인 줄은 들이지 않았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_LEAD, AnswerError, BOARD, BoardError, COMMENT_MAX, HANDLE_FORMAT, cleanComment, composeAnswer, decisionSig, lineFor, oneLine,
  parseBoard, pickKeys, readPicks, selectable, validHandle } from '../lib/decisions.mjs';

const opt = (key, label, effect = `${label}를 고르면 일어나는 일이다.`) => ({ key, label, effect });
const entry = (over = {}) => ({ id: 'g11-version-compare', title: '엔진 버전 비교 두 함수를 합칠지', state: 'waiting', recommended: 'A',
  options: [opt('A', '그대로 둔다'), opt('B', '다음 goal에서 합친다')], detail: ['## 무엇을 정하나', '- 본문'], ...over });
const board = (...decisions) => JSON.stringify({ decisions });

test('constants: the board lives in 01_Milestones as a local file, the lead and the handle form are fixed', () => {
  assert.equal(BOARD, '01_Milestones/00_Decision_Board.local.json');
  assert.equal(ANSWER_LEAD, '현황판 결정 응답');
  assert.equal(COMMENT_MAX, 300);
  assert.ok(HANDLE_FORMAT.test('term_ea52c9f0-a152-4490-8af2-8a8dd948396f'));
  for (const bad of ['', 'term_EA52C9F0-A152-4490-8AF2-8A8DD948396F', 'term_ea52c9f0a1524490', 'x term_ea52c9f0-a152-4490-8af2-8a8dd948396f', 'term_ea52c9f0-a152-4490-8af2-8a8dd948396f\n'])
    assert.ok(!HANDLE_FORMAT.test(bad), bad);
  assert.equal(validHandle('term_ea52c9f0-a152-4490-8af2-8a8dd948396f'), 'term_ea52c9f0-a152-4490-8af2-8a8dd948396f');
  for (const bad of [null, undefined, 42, {}, 'term_abc']) assert.equal(validHandle(bad), null);
});

test('board: a well-formed waiting entry is read as is, with its options, detail and times', () => {
  const r = parseBoard(board(entry({ pr: 55, arrivedAt: '2026-11-15T21:50:00+09:00', updatedAt: 'not a time' })));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.items.length, 1);
  const d = r.items[0];
  assert.deepEqual([d.id, d.kind, d.title, d.state, d.pr, d.recommended], ['g11-version-compare', null, '엔진 버전 비교 두 함수를 합칠지', 'waiting', 55, 'A']);
  assert.deepEqual(d.options.map(o => o.key), ['A', 'B']);
  assert.deepEqual(d.detail, ['## 무엇을 정하나', '- 본문']);
  assert.equal(d.arrivedAt, '2026-11-15T21:50:00+09:00');
  assert.equal(d.updatedAt, null, '읽을 수 없는 시각은 없는 것으로 본다');
});

// 병합은 앱 PR 카드의 「병합」 버튼으로만 한다. 보드의 병합 결정(kind: merge)은 없어졌다.
test('board: a retired merge kind is read as an ordinary decision with a warning that points to the app merge button', () => {
  const r = parseBoard(board(entry({ kind: 'merge', pr: 55 })));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].kind, null);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].what, /병합.*버튼/);
});

test('board: a half-written or wrong top level is a BoardError (the collector then keeps the last good list)', () => {
  for (const text of ['{"decisions": [', '', 'null', '[]', '"글"', '42']) assert.throws(() => parseBoard(text), BoardError, JSON.stringify(text));
  assert.deepEqual(parseBoard('\uFEFF' + board(entry())).items.length, 1, 'BOM은 떼고 읽는다');
});

test('board: only the broken entry or field is dropped, and each drop leaves a warning', () => {
  const r = parseBoard(board(
    entry({ id: 'ok-1' }),
    null, 'text', [1],
    entry({ id: undefined }),
    entry({ id: 'has space' }),
    entry({ id: 'no-title', title: '' }),
    entry({ id: 'ok-1', title: '같은 id 두 번째' }),
    entry({ id: 'bad-fields', kind: 'plan', pr: 'PR?', recommended: 'C', detail: { a: 1 },
      options: [opt('A', '하나'), opt('A', '같은 키'), opt('C', '코멘트 자리'), { key: 'B' }, 'B', null] }),
  ));
  assert.deepEqual(r.items.map(d => d.id), ['ok-1', 'bad-fields']);
  const bad = r.items[1];
  assert.equal(bad.kind, null, '모르는 kind는 일반 결정으로 읽는다');
  assert.equal(bad.pr, null);
  assert.equal(bad.recommended, null, '추천은 있는 선택지 키여야 한다');
  assert.deepEqual(bad.detail, []);
  assert.deepEqual(bad.options.map(o => [o.key, o.label]), [['A', '하나']]);
  assert.ok(r.warnings.length >= 10, `경고 ${r.warnings.length}개`);
  for (const w of r.warnings) assert.ok(typeof w.where === 'string' && typeof w.what === 'string' && w.what.length > 0);
});

test('board: numbers become text, "#55" becomes 55, detail as one string is split into lines, other states are skipped', () => {
  const r = parseBoard(board(entry({ id: 7, title: 12, pr: '#55', detail: '첫 줄\r\n둘째 줄' }), entry({ id: 'later', state: 'review' })));
  assert.deepEqual(r.items.map(d => [d.id, d.title, d.pr]), [['7', '12', 55]]);
  assert.deepEqual(r.items[0].detail, ['첫 줄', '둘째 줄']);
  assert.equal(r.skipped, 1, 'waiting이 아닌 항목은 고를 수 없어 목록에 넣지 않는다');
  assert.deepEqual(parseBoard('{}').items, []);
  const notArray = parseBoard('{"decisions": {"id": "x"}}');
  assert.deepEqual([notArray.items.length, notArray.warnings.length], [0, 1]);
});

test('board: control characters, line breaks and escape bytes never survive in title, label or effect', () => {
  const r = parseBoard(board(entry({ title: '제목\n둘째\u001b[2J\u2028끝', options: [opt('A', '그대로\r\n', '효과\u0007'), opt('B', '\u009b합친다')] })));
  const d = r.items[0];
  assert.equal(d.title, '제목 둘째 [2J 끝');
  assert.deepEqual(d.options.map(o => [o.label, o.effect]), [['그대로', '효과'], ['합친다', '합친다를 고르면 일어나는 일이다.']]);
});

test('one line and comments: C0, DEL, C1 and the two Unicode separators become spaces; comments stop at 300 characters', () => {
  assert.equal(oneLine(' a\tb\nc\r\nd\u0000e\u007ff\u0085g\u009bh\u2028i\u2029j '), 'a b c d e f g h i j');
  assert.equal(cleanComment('\u001b[201~줄\n바꿈'), '[201~줄 바꿈');
  const long = '가'.repeat(400);
  assert.equal(Array.from(cleanComment(long)).length, 300);
  assert.equal(cleanComment('😀'.repeat(301)), '😀'.repeat(300), '글자 단위(코드 포인트)로 자른다');
  assert.equal(cleanComment(null), '');
});

test('selectable and pick keys: a waiting entry with options offers A·B and C; without options only C', () => {
  const [d] = parseBoard(board(entry())).items;
  assert.ok(selectable(d));
  assert.deepEqual(pickKeys(d), ['A', 'B', 'C']);
  const [bare] = parseBoard(board(entry({ options: [] }))).items;
  assert.ok(!selectable(bare));
  assert.deepEqual(pickKeys(bare), ['C']);
});

test('signature: the detail text is part of it — the user answers on what they read, so an edited detail makes the drawn list stale', () => {
  const items = parseBoard(board(entry())).items;
  assert.notEqual(decisionSig(parseBoard(board(entry({ detail: ['## 무엇을 정하나', '- 고친 본문'] }))).items), decisionSig(items));
  assert.notEqual(decisionSig(parseBoard(board(entry({ options: [opt('A', '그대로 둔다', '바뀐 효과'), opt('B', '다음 goal에서 합친다')] }))).items), decisionSig(items), '효과 글도 서명에 든다');
  assert.equal(decisionSig(parseBoard(board(entry({ updatedAt: '2026-11-16T05:00:00+09:00' }))).items), decisionSig(items), '시각만 바뀌면 서명은 그대로다');
});

test('signature: same list same signature; any title, option, key, order or recommendation change moves it', () => {
  const items = parseBoard(board(entry(), entry({ id: 'second', title: '둘째 결정' }))).items;
  const sig = decisionSig(items);
  assert.match(sig, /^[0-9a-f]{16}$/);
  assert.equal(decisionSig(parseBoard(board(entry(), entry({ id: 'second', title: '둘째 결정' }))).items), sig);
  const variants = [
    board(entry({ title: '바뀐 제목' }), entry({ id: 'second', title: '둘째 결정' })),
    board(entry({ options: [opt('A', '그대로 둔다'), opt('B', '바뀐 선택지')] }), entry({ id: 'second', title: '둘째 결정' })),
    board(entry({ recommended: 'B' }), entry({ id: 'second', title: '둘째 결정' })),
    board(entry({ id: 'second', title: '둘째 결정' }), entry()),
    board(entry()),
  ];
  for (const v of variants) assert.notEqual(decisionSig(parseBoard(v).items), sig, v.slice(0, 60));
  assert.match(decisionSig([]), /^[0-9a-f]{16}$/);
});

const two = () => parseBoard(board(entry(), entry({ id: 'sdk-fallback', title: 'SDK 폴백 값 변경을 G11에 둔 것을 그대로 둘지', kind: 'merge',
  options: [opt('A', '그대로 둔다'), opt('B', '되돌려 따로 다룬다')] }))).items;

test('sentence: one line, the lead, numbered items in board order joined by a middle dot', () => {
  const items = two();
  const picks = new Map([['sdk-fallback', 'B'], ['g11-version-compare', 'A']]);
  assert.equal(composeAnswer(items, picks), '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다 · 2) SDK 폴백 값 변경을 G11에 둔 것을 그대로 둘지 → B 되돌려 따로 다룬다');
  assert.equal(composeAnswer(items, new Map()), '');
  assert.equal(composeAnswer(items, new Map([['sdk-fallback', 'C']]), new Map([['sdk-fallback', '먼저 PR 55 diff를 보여 줘']])),
    '현황판 결정 응답: 2) SDK 폴백 값 변경을 G11에 둔 것을 그대로 둘지 → C 코멘트 「먼저 PR 55 diff를 보여 줘」');
  assert.equal(composeAnswer(items, new Map([['sdk-fallback', 'C']]), new Map()), '', 'C에 글이 없으면 조각이 없다');
});

test('sentence: a merge entry is still the ordinary sentence — no approval line, nothing that stands in for the merge dialog', () => {
  const items = two();
  const line = composeAnswer(items, new Map([['sdk-fallback', 'A']]));
  assert.ok(line.startsWith('현황판 결정 응답: '), line);
  assert.doesNotMatch(line, /병합 승인:|gh pr merge|stop-gate|release|AGENTDECK_STATE_SEAM/);
});

test('sentence: the whole composed line has no control character even if a parsed entry was tampered with afterwards', () => {
  const items = two();
  items[0] = { ...items[0], title: '악성\n제목\u001b', options: [{ key: 'A', label: '라벨\r', effect: '' }] };
  const line = composeAnswer(items, new Map([['g11-version-compare', 'A']]));
  assert.doesNotMatch(line, /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
  assert.equal(line, '현황판 결정 응답: 1) 악성 제목 → A 라벨');
});

test('picks: unknown ids, keys not offered now, C without text and wrong shapes are refused, not dropped', () => {
  const items = two();
  const bad = [
    null, [], 'x', { picks: [] }, { picks: {}, comments: 'x' },
    { picks: { nope: 'A' } },
    { picks: { 'g11-version-compare': 'Z' } },
    { picks: { 'g11-version-compare': 'C' } },
    { picks: { 'g11-version-compare': 'C' }, comments: { 'g11-version-compare': '\n\u001b ' } },
    { picks: { 'g11-version-compare': 1 } },
    { picks: {}, comments: { nope: '글' } },
    { picks: {}, comments: { 'g11-version-compare': 3 } },
  ];
  for (const body of bad) assert.throws(() => readPicks(items, body), AnswerError, JSON.stringify(body));
  const { picks, comments } = readPicks(items, { picks: { 'g11-version-compare': 'C', 'sdk-fallback': null }, comments: { 'g11-version-compare': ' 줄\n바꿈 ' } });
  assert.deepEqual([...picks], [['g11-version-compare', 'C']]);
  assert.deepEqual([...comments], [['g11-version-compare', '줄 바꿈']]);
  assert.throws(() => readPicks(parseBoard(board(entry({ options: [] }))).items, { picks: { 'g11-version-compare': 'A' } }), AnswerError, '선택지가 없으면 C만 고른다');
});

test('lineFor: a page that drew another list gets a stale refusal; otherwise the server-made sentence', () => {
  const items = two(), sig = decisionSig(items), list = { items, sig };
  assert.deepEqual(lineFor(list, { sig: 'ffffffffffffffff', picks: { 'g11-version-compare': 'A' } }), { refusal: '화면에 그린 결정 목록이 지금 목록과 달라요. 화면을 다시 그렸으니 확인하고 다시 골라 주세요.', stale: true });
  assert.deepEqual(lineFor(list, { picks: { 'g11-version-compare': 'A' } }).stale, true, '서명이 없으면 다른 목록이다');
  assert.deepEqual(lineFor(list, { sig, picks: { 'g11-version-compare': 'A' }, text: '페이지가 만든 문장은 쓰지 않는다' }),
    { text: '현황판 결정 응답: 1) 엔진 버전 비교 두 함수를 합칠지 → A 그대로 둔다' });
  assert.throws(() => lineFor(list, { sig, picks: {} }), AnswerError, '고른 항목이 없으면 거절');
});
