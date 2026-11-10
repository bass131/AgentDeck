import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBacklog, parseHookTail, parseLedger, parsePhaseFlow, parsePhaseRecords, parsePin, parsePlanHeader, parseStatus, planLines } from '../lib/markdown.mjs';

test('plan header: # title and the status segment to the end of the line', () => {
  const h = parsePlanHeader(String.fromCharCode(0xFEFF) + '# M03 — Harness Refresh · 하네스 갱신\n\n- 마일스톤: M03 (방향) · 작성: 2026-11-10 (rev1) · 상태: 승인 완료 (2026-08-10) · Phase 1 진행\n\n## 사람용 개요\n- 마일스톤: 절 안은 첫머리가 아니다\n');
  assert.equal(h.title, 'M03 — Harness Refresh · 하네스 갱신');
  assert.equal(h.status, '승인 완료 (2026-08-10) · Phase 1 진행');
  assert.equal(h.statusLineNo, 3);
  assert.equal(parsePlanHeader('# 제목만\n\n## 절\n').status, null);
  assert.throws(() => parsePlanHeader('본문만\n## 절\n'), /제목 줄/);
});

test('Phase flow table: padded cells, name split from tags, escaped pipe, first table only', () => {
  const text = '## Phase 흐름\n\n\n| Phase | 이름 · 태그      | 목표   | DoD |\n| ----- | --------- | ---- | --- |\n| 1     | 착륙지·계획 등재 · `structure`   | 계획 \\| 등재 | x |\n| 2 | 표준 · `layout`·`guard` | 둘 | y |\n\n| 8 | 둘째 표 | z | w |\n## 다음\n| 9 | 다른 절 | z | w |\n';
  assert.deepEqual(parsePhaseFlow(text).map(r => [r.num, r.name, r.tags, r.goal, r.line]),
    [[1, '착륙지·계획 등재', ['structure'], '계획 | 등재', 6], [2, '표준', ['layout', 'guard'], '둘', 7]]);
  assert.throws(() => parsePhaseFlow('## 개요\n'), /Phase 흐름/);
  assert.throws(() => parsePhaseFlow('## Phase 흐름\n\n| A | B |\n|---|---|\n'), /열을 찾지/);
});

test('records: only marker lines under the bare 「검증 기록」 line count; USER-INPUT moves the baseline', () => {
  const entries = planLines([{ file: 'p.md', text: [
    '## Phase 1 — 이름 · 태그: `a` · 의존: 없음', '- FAIL Steps의 서술', '검증 기록은 아직 없음', '- FAIL 위장 헤더 뒤', '검증 기록',
    '- FAIL 2026-11-01T00:00:00+09:00 — 하나', '- USER-INPUT 2026-11-02T00:00:00+09:00 — 기준점', '- FAIL 2026-11-03 — 둘', '- FAILED 아님', '   - FAIL 들여쓴 줄', '### 소절도 같은 절', '- FAIL 2026-11-04T01:02:03+09:00 — 셋',
    '## Phase 2 — 둘 · 태그: `b` · 의존: Phase 1', '본문', '## Phase 3',
  ].join('\n') }]);
  const [p1, p2, p3] = parsePhaseRecords(entries);
  assert.deepEqual([p1.record.pass, p1.record.fail, p1.record.userInput, p1.record.failSinceUserInput], [0, 3, 1, 2]);
  assert.deepEqual(p1.record.last, { marker: 'FAIL', at: '2026-11-04T01:02:03+09:00', text: '셋', file: 'p.md', line: 12 });
  assert.deepEqual([p1.name, p1.tags, p1.deps], ['이름', ['a'], '없음']);
  assert.equal(p2.record.section, false);
  assert.equal(p3.name, null);
});

test('records across files keep each line\'s own file and line number', () => {
  const entries = planLines([{ file: 'a.md', text: '# A\n## 개요\n' }, { file: 'b.md', text: '# B\n\n## Phase 4 — 넷 · 태그: `x` · 의존: 없음\n검증 기록\n- PASS 2026-11-11T00:00:00+09:00 — 끝\n' }]);
  const [p] = parsePhaseRecords(entries);
  assert.deepEqual([p.num, p.file, p.line, p.record.line, p.record.last.line], [4, 'b.md', 3, 4, 5]);
});

test('ledger tally follows plan-gate: tag order, user side, three gate states', () => {
  const mk = body => planLines([{ file: 'a.md', text: '## 결정 대장\n' + body.join('\n') + '\n## 다음\n- [AI] 절 밖은 세지 않는다\n' }]);
  const a = parseLedger(mk(['- [USER] a', '- [USER·위임] b', '- [AI] c', '  - [AI] 들여쓴 줄', '-[AI] 붙여 쓴 줄', '- [AIX] x', '* [AI] 별표']));
  assert.deepEqual(a.tally, { USER: 1, 'USER·위임': 1, AI: 2, 'AI·비가역': 0 });
  assert.deepEqual([a.userSide, a.gate], [2, 'clear']);
  assert.deepEqual(a.aiLines.map(l => [l.text, l.line]), [['c', 4], ['붙여 쓴 줄', 6]]);
  assert.equal(parseLedger(mk(['- [USER] a', '- [AI] b', '- [AI] c'])).gate, 'ask');
  const irreversible = parseLedger(mk(['- [USER] a', '- [USER] b', '- [AI·비가역] c']));
  assert.deepEqual([irreversible.gate, irreversible.aiLines[0].tag], ['immediate', 'AI·비가역']);
  assert.throws(() => parseLedger(planLines([{ file: 'a.md', text: '## 개요\n- [AI] x\n' }])), /결정 대장/);
});

test('pin: coord bullets with continuation and sub-headings, summary fields and missing labels', () => {
  const p = parsePin('# pin\n\n## 좌표\n\n- 마일스톤: **M** — `x`\n- 다음 액션: 묻기\n  이어짐\n- 콜론 없는 줄\n\n### 소절\n- 소절: 같은 절\n\n## 마감 요약 (최신 1건)\n\n- 스탬프: 2026-11-11T06:07:05+09:00\n- 바뀐 것: A\n- 봐야 할 것: C\n');
  assert.deepEqual(p.coord.items.map(i => [i.label, i.text]), [['마일스톤', '**M** — `x`'], ['다음 액션', '묻기 이어짐'], [null, '콜론 없는 줄'], ['소절', '같은 절']]);
  assert.deepEqual([p.summary.stamp.text, p.summary.changed.text, p.summary.decided, p.summary.watch.text], ['2026-11-11T06:07:05+09:00', 'A', null, 'C']);
  assert.deepEqual(p.summary.missing, ['내린 결정']);
  const none = parsePin('# pin\n본문\n');
  assert.deepEqual([none.coord, none.summary], [null, null]);
});

test('backlog: bold numbered titles grouped by section; fences and plain numbers ignored', () => {
  const b = parseBacklog('# B\n\n## 대기 항목\n\n1. **첫** (관찰) — x\n2. 굵지 않은 항목\n```\n3. **펜스 안**\n```\n10. **열 번째**\n\n## 처리된 항목\n\n4. **처리됨** — y\n## 빈 절\n');
  assert.equal(b.count, 3);
  assert.deepEqual(b.sections.map(s => [s.name, s.items.map(i => [i.num, i.title])]), [['대기 항목', [[1, '첫'], [10, '열 번째']]], ['처리된 항목', [[4, '처리됨']]]]);
});

test('hook tail: drops the cut first line, counts malformed lines, marks deny and block', () => {
  const text = 'ruption"}\n{"ts":"2026-11-11T00:00:00+09:00","hook":"a","verdict":"allow"}\nnot json\n{"ts":"2026-11-11T00:00:01+09:00","hook":"b","verdict":"deny","rule":"r","reason":"' + '가'.repeat(300) + '"}\n{"hook":"c","verdict":"block"}\n[1]\n';
  const h = parseHookTail(text, { truncated: true });
  assert.deepEqual([h.lines, h.bad], [5, 2]);
  assert.deepEqual(h.entries.map(e => [e.hook, e.verdict, e.deny]), [['a', 'allow', false], ['b', 'deny', true], ['c', 'block', true]]);
  assert.equal(Array.from(h.entries[1].reason).length, 241);
  assert.equal(parseHookTail(text).bad, 3);
  assert.equal(parseHookTail(text, { limit: 2 }).lines, 2);
  const dup = parseHookTail('{"a":1}\n{"a":1}\n');
  assert.notEqual(dup.entries[0].key, dup.entries[1].key);
});

test('git status -z: renames carry the original path; spaces and Korean are kept', () => {
  assert.deepEqual(parseStatus(' M a b.md\0R  새 이름.md\0옛 이름.md\0?? 폴더/파일.md\0'), [
    { code: ' M', path: 'a b.md', from: null }, { code: 'R ', path: '새 이름.md', from: '옛 이름.md' }, { code: '??', path: '폴더/파일.md', from: null }]);
  assert.deepEqual(parseStatus(''), []);
});
