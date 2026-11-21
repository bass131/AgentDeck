// 맨 위 세 질문의 판정(lib/progress.mjs): 짧은 이름, 마일스톤 goal 목록, 최근 활동, 내 손이 필요한 일.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, readTail } from '../lib/collector.mjs';
import { parseHookTail } from '../lib/markdown.mjs';
import { buildGoalList, commandKind, doingLine, goalState, goalTitle, judgeHand, judgeQuiet, milestoneName, parseGoalAim, parsePlannedGoals, prOf, QUIET_AFTER_MIN, shortName, summarizeActivity, userChores } from '../lib/progress.mjs';
import { fakeGit, fixture, NOW } from './helpers.mjs';

const goalRepo = fileURLToPath(new URL('./fixtures/goal-repo/', import.meta.url));
const DIR = '01_Milestones/M09_Goals';
const pointTo = file => ({ readdir: fsp.readdir, stat: fsp.stat, tail: readTail, readFile: async (f, enc) =>
  path.normalize(f).endsWith(path.normalize('gate-config.json'))
    ? JSON.stringify({ planPath: `${DIR}/${file}`, workPinPath: `${DIR}/01_Work_Pin.md` }) : fsp.readFile(f, enc) });
const load = file => collect(goalRepo, { now: NOW, git: fakeGit(), io: pointTo(file) });

test('short name: the part before 「 — 」, else the text without asides, else the first clause and how many more', () => {
  assert.equal(shortName('재실측 — 세 거처의 필드·읽는 곳·쓰는 곳, 평탄화 store를 seed·read하는 테스트와 하네스'), '재실측');
  assert.equal(shortName('구현 1 — 레지스트리와 라우팅·구독·타이머 한 벌(구조만, 동작 변화 0)'), '구현 1');
  assert.equal(shortName('커밋, 작업 브랜치 push, PR 생성, 병합 승인 요청'), '커밋, 작업 브랜치 push, PR 생성, 병합 승인 요청');
  assert.equal(shortName('G9b 종결 기록, 이 goal 문서, 포인터 전환(`98_Management/01_GateState/gate-config.json`의 `planPath`), pin 갱신'), 'G9b 종결 기록 외 3가지');
  assert.equal(shortName('구현 — `parseGoalSteps` 추가'), '구현');
  assert.equal(shortName('짧은 이름'), '짧은 이름');
  assert.equal(shortName('쉼표가 없는 아주 긴 단계 이름이라서 서른두 자를 넘기면 끝을 잘라 말줄임표를 붙인다'), '쉼표가 없는 아주 긴 단계 이름이라서 서른두 자를 넘기면…');
  // 괄호만 있는 글은 원문을 그대로 둔다(빈 이름을 만들지 않는다)
  assert.equal(shortName('(전부 괄호)'), '(전부 괄호)');
});

test('short name: a leading demonstrative item (「이 goal 문서」) is not the head; the first meaningful item is', () => {
  // 실제 단계 원문. 지시어 항목을 머리로 쓰면 「이 goal 문서 외 3가지」가 되어 무엇을 하는 단계인지 사라진다
  assert.equal(shortName('이 goal 문서, 포인터 전환(`98_Management/01_GateState/gate-config.json`의 `planPath`), pin 갱신, G9c·G10의 상태를 「종결」로 바꾸고 병합 기록'), '포인터 전환 외 3가지');
  assert.equal(shortName('그 단계 문서, 해당 결정 기록, 검증 기록 절을 다시 세어 마지막 줄 시각까지 맞춘다'), '검증 기록 절을 다시 세어 마지막 줄 시각까지 맞춘다 외 2가지');
  // 의미 있는 항목이 32자를 넘으면 그 항목을 잘라 쓴다
  assert.equal(shortName('본 goal, 쉼표가 없는 아주 긴 단계 이름이라서 서른두 자를 넘기면 끝을 잘라 쓴다'), '쉼표가 없는 아주 긴 단계 이름이라서 서른두 자를 넘기면… 외 1가지');
  // 모두 지시어 항목이면 예전처럼 첫 항목이다
  assert.equal(shortName('이 goal 문서, 이 계획 문서, 그 결정 대장, 이 work-pin 문서, 이번 Backlog 줄'), '이 goal 문서 외 4가지');
  // 「이」로 시작해도 낱말이 셋을 넘거나, 문서를 가리키는 낱말로 끝나지 않으면(「이 브랜치에 커밋」) 지시어 항목이 아니다
  assert.equal(shortName('이 저장소의 훅 기록을 다시 읽기, 현황판 화면 확인, 문서 갱신과 링크 정리'), '이 저장소의 훅 기록을 다시 읽기 외 2가지');
  assert.equal(shortName('이 브랜치에 커밋, 작업 브랜치 push와 PR 생성, 결과 보고와 병합 승인 요청'), '이 브랜치에 커밋 외 2가지');
});

test('goal header pieces: title id and short name, milestone name, PR number, status word', () => {
  assert.deepEqual(goalTitle('M05 G9c — 실행 상태 단일 원천과 단일·멀티 분기 정리'), { milestone: 'M05', id: 'G9c', name: '실행 상태 단일 원천과 단일·멀티 분기 정리', full: '실행 상태 단일 원천과 단일·멀티 분기 정리' });
  assert.equal(goalTitle('M05 G1 — 구조 감사 · 앱 소스의 아키텍처 감사').name, '구조 감사');
  assert.equal(goalTitle('work-pin — 작업 좌표 (M05)'), null);
  assert.equal(milestoneName('마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 실행 중'), 'M05 구조 감사와 도메인별 재편');
  assert.deepEqual([prOf('종결 — PR 37 병합(`fdb6c63`)'), prOf('종결 (PR 48 병합, master `4652994`)'), prOf('실행 중')], [37, 48, null]);
  assert.deepEqual(['종결 (PR 9 병합)', '실행 중', '병합 대기', '초안', '보류'].map(s => goalState(s).state), ['done', 'current', 'current', 'draft', 'unknown']);
});

test('planned goals: only 「###」 heads inside a 「… goal 목록」 section; G9 covers G9a·G9b but G1 does not cover G10', () => {
  const planned = parsePlannedGoals('## 원칙\n\n### G0 — 밖\n\n## G2 이후 goal 목록\n\n### G9 — 통합 · 강\n### G10 — IPC · 강\n\n## 공통 위험\n\n### G11 — 밖');
  assert.deepEqual(planned.map(p => [p.id, p.name]), [['G9', '통합'], ['G10', 'IPC']]);
  const files = [{ path: 'a/10.md', title: 'M05 G1 — 감사', status: '종결 (PR 37 병합)' }, { path: 'a/90.md', title: 'M05 G9a — 코어', status: '종결 (PR 47 병합)' },
    { path: 'a/94.md', title: 'M05 G9c — 상태', status: '실행 중' }];
  const L = buildGoalList(files, planned.map(p => ({ ...p, path: 'a/12.md' })), 'a/94.md');
  assert.deepEqual(L.items.map(g => [g.id, g.state, g.pr, g.current]), [['G1', 'done', 37, false], ['G9a', 'done', 47, false], ['G9c', 'current', null, true], ['G10', 'left', null, false]]);
  assert.deepEqual([L.total, L.done, L.doing, L.left], [4, 2, 1, 1]);
});

test('goal list from the fixture folder: goal files in name order, sidecar docs without 「상태:」 skipped, planned goals appended', async () => {
  const vm = await load('10_Goal-G1-진행-중.md');
  const G = vm.goals;
  assert.equal(G.status, 'ok');
  assert.equal(G.milestoneName, 'M09 시험 마일스톤');
  assert.deepEqual(G.items.map(g => [g.id, g.state, g.current]),
    [['G1', 'current', true], ['G2', 'draft', false], ['G3', 'current', false], ['G4', 'current', false], ['G5', 'done', false], ['G6', 'left', false], ['G7', 'left', false]]);
  assert.equal(G.items.find(g => g.id === 'G5').pr, 9);
  assert.equal(G.items.find(g => g.id === 'G7').name, '그다음 goal (괄호 포함)');
  assert.deepEqual([G.total, G.done, G.left], [7, 1, 2]);
  assert.deepEqual(G.current, { milestone: 'M09', id: 'G1', name: '진행 중 시험', full: '진행 중 시험' });
  assert.equal(G.aim.text, '현황판이 goal 한 장의 진척 단계를 읽는다.');
  // 단계마다 짧은 이름이 함께 온다
  assert.equal(vm.phases.items[2].short, '구현');
  assert.equal(vm.summary.doing.text, 'G1 3단계 「구현」 진행 중');
});

test('the multi-file milestone has no goal list and adds no source row', async () => {
  const vm = await collect(fixture, { now: NOW, git: fakeGit() });
  assert.equal(vm.goals.status, 'absent');
  assert.equal(vm.sources.some(s => s.id === 'goals'), false);
  assert.match(vm.summary.doing.text, /^2단계 「.+」 진행 중$/);
});

test('doing line: running, stopped, between steps, before the first step, all done, closed', () => {
  const P = (stage, items, cur, next, extra = {}) => ({ status: 'ok', format: 'goal', current: cur, next, items,
    goal: { stage, closed: stage === 'closed', done: items.filter(s => s.flow === 'done').length, ...extra } });
  const s = (n, flow, name = `이름 ${n} — 원문 설명`) => ({ num: n, label: String(n), flow, name });
  const g = { id: 'G9c' };
  assert.equal(doingLine({ goal: g, phases: P('running', [s(1, 'done'), s(2, 'current')], 2, null) }).text, 'G9c 2단계 「이름 2」 진행 중');
  assert.equal(doingLine({ goal: g, phases: P('stopped', [s(1, 'stopped')], 1, null) }).text, 'G9c 1단계 「이름 1」에서 멈췄어요');
  assert.equal(doingLine({ goal: g, phases: P('between', [s(1, 'done'), s(2, 'waiting')], null, 2) }).text, 'G9c 1단계까지 마쳤고 2단계 「이름 2」 시작 전이에요');
  assert.equal(doingLine({ goal: g, phases: P('not-started', [s(1, 'waiting')], null, 1) }).text, 'G9c 첫 단계 「이름 1」 시작 전이에요');
  assert.equal(doingLine({ goal: g, phases: P('all-done', [s(1, 'done')], null, null) }).text, 'G9c 1단계를 모두 마쳤어요');
  assert.equal(doingLine({ goal: g, phases: P('closed', [s(1, 'done')], null, null) }).text, 'G9c 종결됐어요');
  // 원문으로 정하지 못하면 문장을 만들지 않고 이유를 준다
  const none = doingLine({ goal: g, phases: { status: 'failed' } });
  assert.deepEqual([none.text, none.why], [null, '단계 정보를 읽지 못했어요.']);
});

test('command kinds: leading cd and variable assignments are skipped; npm flags before the script name too', () => {
  const k = c => commandKind(c);
  assert.deepEqual([
    k('cd /c/Dev/AgentDeck && grep -rn "x" src | head'), k('sed -n 1,20p a.ts'), k('git log --oneline -5'), k('npx vitest run a.test.ts'),
    k('npm test'), k('npm run -s test:hooks > /dev/null 2>&1; echo $?'), k('npm run typecheck'), k('npm run gate:all'), k('npx tsc --noEmit'),
    k('git add a && git commit -m x'), k('git push -u origin b'), k('gh pr create --fill'), k('T=term_1; orca terminal wait --terminal $T'), k('node scripts/x.mjs'), k('')],
    ['read', 'read', 'read', 'test', 'test', 'test', 'build', 'build', 'build', 'commit', 'push', 'push', 'orca', 'run', null]);
});

const line = o => JSON.stringify({ ts: '2026-11-11T09:59:00+09:00', session: 's1', ...o });
const entries = rows => parseHookTail(rows.join('\n')).entries;

test('activity: the most frequent kind in the last 8 actions after the last stop; actor only when agent_id is recorded', () => {
  const E = entries([
    line({ hook: 'cmd-guard', event: 'PreToolUse', agent_id: null, verdict: 'allow', cmd: 'npx vitest run' }),
    line({ hook: 'surface-probe', event: 'Stop', agent_id: null, verdict: '통과' }),
    line({ hook: 'cmd-guard', event: 'PreToolUse', agent_id: 'a1', verdict: 'allow', cmd: 'grep -rn x src' }),
    line({ hook: 'tdd-guard', event: 'PostToolUse', tool: 'Bash', verdict: '무기록' }),
    line({ hook: 'cmd-guard', event: 'PreToolUse', agent_id: 'a1', verdict: 'allow', cmd: 'cd a && sed -n 1,9p b.ts' }),
    line({ hook: 'edit-plan-gate', event: 'PreToolUse', tool: 'Edit', verdict: 'allow', target: 'a.ts' }),
    line({ ts: '2026-11-11T09:59:30+09:00', hook: 'cmd-guard', event: 'PreToolUse', agent_id: 'a1', verdict: 'allow', cmd: 'cat c.ts' }),
  ]);
  const a = summarizeActivity(E);
  assert.deepEqual([a.kind, a.actor, a.count, a.of, a.at, a.say, a.sayPast], ['read', 'sub', 3, 4, '2026-11-11T09:59:30+09:00', '하위 에이전트가 코드를 읽고 있어요', '하위 에이전트가 코드를 읽었어요']);
  assert.equal(a.detail, 'cat c.ts');
  // 같은 수면 더 최근 것이고, agent_id 칸이 없는 기록은 누가 했는지 말하지 않는다
  const b = summarizeActivity(entries([line({ hook: 'cmd-guard', agent_id: null, cmd: 'npm test' }), line({ hook: 'edit-plan-gate', event: 'PreToolUse', tool: 'Write', target: 'x' })]));
  assert.deepEqual([b.kind, b.actor, b.say], ['edit', null, '파일을 고치고 있어요']);
  // 마지막 기록이 응답 마침이면 그렇게 말한다
  const c = summarizeActivity(entries([line({ hook: 'cmd-guard', agent_id: null, cmd: 'ls' }), line({ hook: 'surface-probe', event: 'Stop', agent_id: null, verdict: '통과' })]));
  assert.deepEqual([c.kind, c.say], ['stop', '메인 세션이 응답을 마쳤어요']);
  assert.equal(summarizeActivity(entries([line({ hook: 'pass-watcher', verdict: '무장전' })])), null);
});

test('hand: merge waiting, a merge step in progress, a question, a stop, the ledger gate, and an unanswered command approval', () => {
  const step = (n, flow, name) => ({ num: n, label: String(n), flow, name, ref: { path: 'g.md', line: n } });
  const goal = (statusWord, items, cur, extra = {}) => ({ status: 'ok', format: 'goal', items, current: cur,
    record: { section: true, failSinceUserInput: 0, last: null, ...extra.record }, goal: { status: statusWord, statusWord, closed: statusWord === '종결', waitingUser: false, ref: { path: 'g.md', line: 3 }, ...extra.goal } });
  const ids = h => h.map(x => [x.id, x.level]);
  assert.deepEqual(judgeHand({ phases: goal('실행 중', [step(1, 'current', '구현')], 1) }), []);
  assert.deepEqual(ids(judgeHand({ phases: goal('병합 대기', [step(1, 'done', 'a')], null, { goal: { status: '병합 대기 (PR 49)' } }) })), [['merge', 'todo']]);
  // 병합은 사용자가 현황판 병합 카드(확인 창)나 앱 PR 카드의 「병합」 버튼으로 한다 — 보드 승인 요청이 아니다
  assert.match(judgeHand({ phases: goal('병합 대기', [], null, { goal: { status: '병합 대기 (PR 49)' } }) })[0].say, /^PR 49의 병합을 기다려요 — 위 병합 카드의 「병합」 버튼으로 해 주세요/, '병합 카드는 「내 손」 위에 있다(M11 G5 72)');
  // 현황판 병합 카드가 이 번호로 PR을 불러온다(문장에서 번호를 뽑지 않는다). 번호가 없으면 null이다
  assert.equal(judgeHand({ phases: goal('병합 대기', [], null, { goal: { status: '병합 대기 (PR 49)' } }) })[0].pr, 49);
  assert.equal(judgeHand({ phases: goal('병합 대기', [], null) })[0].pr, null);
  assert.deepEqual(ids(judgeHand({ phases: goal('실행 중', [step(8, 'current', '커밋, push, PR 생성, 병합 승인 요청')], 8) })), [['merge-step', 'todo']]);
  assert.match(judgeHand({ phases: goal('실행 중', [step(8, 'current', '커밋, push, PR 생성, 병합 승인 요청')], 8) })[0].say, /「병합」 버튼/);
  const q = judgeHand({ phases: goal('실행 중', [step(2, 'current', 'b')], 2, { goal: { waitingUser: true }, record: { last: { marker: 'USER-INPUT', text: '범위를 바꿀까요?', file: 'g.md', line: 40 } } }) });
  assert.deepEqual([q[0].id, q[0].quote, q[0].ref], ['question', '범위를 바꿀까요?', { path: 'g.md', line: 40 }]);
  const stop = judgeHand({ phases: goal('실행 중', [step(2, 'stopped', 'b')], 2, { record: { failSinceUserInput: 3 } }) });
  assert.deepEqual(ids(stop), [['stopped', 'stop']]);
  assert.match(stop[0].say, /실패가 3번 쌓여 멈췄어요/);
  assert.deepEqual(ids(judgeHand({ ledger: { status: 'ok', gate: 'ask', tally: { AI: 3 }, userSide: 1 } })), [['ledger', 'stop']]);
  // 승인 질문 뒤에 같은 세션 기록이 있으면 이미 답한 것으로 본다
  const ask = line({ hook: 'cmd-guard', verdict: 'ask', rule: 'git-push', agent_id: null, cmd: 'git push' });
  const open = judgeHand({ hooks: { status: 'ok', entries: entries([ask, line({ session: 's2', hook: 'cmd-guard', verdict: 'allow', cmd: 'ls' })]) } });
  assert.deepEqual([open[0].id, open[0].quote, open[0].fresh], ['ask', 'git push', 10]);
  assert.deepEqual(judgeHand({ hooks: { status: 'ok', entries: entries([ask, line({ hook: 'cmd-guard', verdict: 'allow', cmd: 'ls' })]) } }), []);
});

test('hand keys: the same fact gives the same key; a step number or a gate in another goal is another fact', () => {
  const step = (n, flow, name) => ({ num: n, label: String(n), flow, name, ref: { path: 'g.md', line: n } });
  const goal = (statusWord, items, cur, extra = {}, doc = 'g.md') => ({ status: 'ok', format: 'goal', items, current: cur,
    record: { section: true, failSinceUserInput: 0, userInput: 0, last: null, ...extra.record }, goal: { status: statusWord, statusWord, closed: false, waitingUser: false, ref: { path: doc, line: 3 }, ...extra.goal } });
  const keys = h => h.map(x => x.key);
  // 병합 대기는 goal 문서 하나의 사실이다 — 머리말에 PR 번호가 나중에 붙어도 같은 키라 다시 울리지 않는다
  assert.deepEqual(keys(judgeHand({ phases: goal('병합 대기', [], null, { goal: { status: '병합 대기 (PR 49)' } }) })), ['merge:g.md']);
  assert.deepEqual(keys(judgeHand({ phases: goal('병합 대기', [], null) })), ['merge:g.md']);
  assert.deepEqual(keys(judgeHand({ phases: goal('병합 대기', [], null, { goal: { status: '병합 대기 (PR 49)' } }, 'h.md') })), ['merge:h.md']);
  const mergeStep = doc => keys(judgeHand({ phases: goal('실행 중', [step(7, 'current', '커밋, push, PR 생성, 병합 승인 요청')], 7, {}, doc) }));
  assert.deepEqual(mergeStep('g.md'), ['merge-step:g.md:7']);
  assert.deepEqual(mergeStep('h.md'), ['merge-step:h.md:7'], '다음 goal의 같은 단계 번호는 다른 사실이다');
  // 사용자 입력 줄은 그 줄의 시각으로 가른다 — 위쪽에 줄이 더해져 줄 번호가 밀려도 같은 사실이다
  const q = (line, at) => keys(judgeHand({ phases: goal('실행 중', [step(2, 'current', 'b')], 2, { goal: { waitingUser: true }, record: { last: { marker: 'USER-INPUT', at, text: '?', file: 'g.md', line } } }) }));
  assert.deepEqual([q(40, '2026-11-15T19:14:01+09:00'), q(41, '2026-11-15T19:14:01+09:00')], [['question:g.md:2026-11-15T19:14:01+09:00'], ['question:g.md:2026-11-15T19:14:01+09:00']]);
  assert.deepEqual(q(40, null), ['question:g.md:40'], '시각이 없는 줄은 줄 번호로 가른다');
  // 멈춤: 실패 수가 더 늘어도 같은 사실이고, 사용자가 답한 뒤(USER-INPUT 줄이 늘어난 뒤) 다시 멈추면 새 사실이다
  const stop = (fails, userInput) => keys(judgeHand({ phases: goal('실행 중', [step(2, 'stopped', 'b')], 2, { record: { failSinceUserInput: fails, userInput } }) }));
  assert.deepEqual([stop(3, 0), stop(4, 0), stop(3, 1)], [['stopped:g.md:2:u0'], ['stopped:g.md:2:u0'], ['stopped:g.md:2:u1']]);
  // 결정 대장 게이트: 사용자 결정 수를 넣는다 — 사용자가 결정을 더해 풀린 뒤 다시 막히면 새 사실이다
  const ledger = (path, userSide = 1) => keys(judgeHand({ ledger: { status: 'ok', gate: 'ask', tally: { AI: 3 }, userSide, ref: { path, line: 9 } } }));
  assert.deepEqual([ledger('g.md'), ledger('h.md'), ledger('g.md', 2)], [['ledger:g.md:ask:u1'], ['ledger:h.md:ask:u1'], ['ledger:g.md:ask:u2']]);
  const ask = judgeHand({ hooks: { status: 'ok', entries: entries([line({ hook: 'cmd-guard', verdict: 'ask', agent_id: null, cmd: 'git push' })]) } });
  assert.deepEqual(keys(ask), ['ask:2026-11-11T09:59:00+09:00']);
  // 같은 입력을 두 번 판정하면 키도 같다(스냅샷이 다시 와도 같은 사실)
  const both = { phases: goal('병합 대기', [step(2, 'stopped', 'b')], 2, { goal: { status: '병합 대기 (PR 51)' }, record: { failSinceUserInput: 3 } }) };
  assert.deepEqual(keys(judgeHand(both)), keys(judgeHand(structuredClone(both))));
  assert.ok(judgeHand(both).every(h => typeof h.key === 'string' && h.key));
});

test('hand keys from the real collector carry the document path; the ledger reference the ledger key uses is there', async () => {
  const G3 = await load('30_Goal-G3-입력-대기.md'), G4 = await load('40_Goal-G4-실패-누적.md');
  assert.deepEqual(G3.summary.hand.map(h => h.key), [`question:${DIR}/30_Goal-G3-입력-대기.md:2026-11-11T09:15:00+09:00`]);
  assert.deepEqual(G4.summary.hand.map(h => h.key), [`stopped:${DIR}/40_Goal-G4-실패-누적.md:2:u1`]);
  assert.deepEqual(G4.ledger.ref, { path: `${DIR}/40_Goal-G4-실패-누적.md`, line: 25 });
  // 다중 파일 형식의 멈춤은 그 Phase 파일 경로로 가른다
  const multi = await collect(fixture, { now: NOW, git: fakeGit() });
  assert.deepEqual(multi.summary.hand.map(h => h.key), ['stopped:01_Milestones/M02_Test/02_Phase_2.md:2:u1', 'ask:2026-11-11T09:04:00+09:00']);
});

test('quiet after a stop: only when the very last record is surface-probe\'s Stop; the threshold is 5 minutes', () => {
  assert.equal(QUIET_AFTER_MIN, 5);
  const stopAt = '2026-11-11T09:59:00+09:00';
  const stopped = entries([line({ hook: 'cmd-guard', agent_id: null, cmd: 'ls' }), line({ hook: 'stop-gate', event: 'Stop' }), line({ ts: stopAt, hook: 'surface-probe', event: 'Stop', agent_id: null, verdict: '통과' })]);
  assert.deepEqual(judgeQuiet(stopped), { at: stopAt, session: 's1', after: 5 });
  // 응답 마침의 사실은 최근 활동 값에 실려 화면으로 간다
  assert.deepEqual(summarizeActivity(stopped).quiet, { at: stopAt, session: 's1', after: 5 });
  // 응답 마침 뒤에 어떤 기록이든(활동으로 세지 않는 기록도) 있으면 조용하지 않다 — 하위 에이전트의 배경 작업 포함
  const after = entries([line({ hook: 'surface-probe', event: 'Stop', agent_id: null }), line({ hook: 'pass-watcher', event: 'PostToolUse', verdict: '무장전' })]);
  assert.equal(judgeQuiet(after), null);
  assert.equal(summarizeActivity(after).quiet, null);
  // 같은 Stop 묶음의 두 훅은 기록 순서가 보장되지 않는다 — 끝의 Stop 묶음에 surface-probe가 있으면 조용함이다
  const reordered = entries([line({ hook: 'surface-probe', event: 'Stop' }), line({ hook: 'stop-gate', event: 'Stop' })]);
  assert.deepEqual(judgeQuiet(reordered), { at: reordered[0].at, session: reordered[0].session, after: 5 });
  assert.equal(judgeQuiet(entries([line({ hook: 'stop-gate', event: 'Stop' })])), null, 'surface-probe 없는 Stop은 응답 마침이 아니다');
  assert.equal(judgeQuiet(entries([line({ hook: 'surface-probe', event: 'Stop' }), line({ hook: 'cmd-guard', agent_id: null, cmd: 'ls' }), line({ hook: 'stop-gate', event: 'Stop' })])), null, '끝 묶음 앞의 응답 마침은 지난 일이다');
  assert.equal(judgeQuiet(entries([line({ hook: 'cmd-guard', agent_id: 'a1', cmd: 'ls' })])), null);
  assert.deepEqual([judgeQuiet([]), judgeQuiet(null)], [null, null]);
});

test('chores: only the work-pin 「봐야 할 것」 sentences that say 「사용자 몫」, without repeats', () => {
  const parts = ['다음은 2단계다.', '서버 종료는 사용자 몫이다.', '서버 종료는 사용자 몫이다.', '브랜치 정리도 사용자 몫입니다.'];
  assert.deepEqual(userChores({ parts }), ['서버 종료는 사용자 몫이다.', '브랜치 정리도 사용자 몫입니다.']);
  assert.deepEqual(userChores(null), []);
});

test('goal aim: the first paragraph under 「## 목표」', () => {
  assert.deepEqual(parseGoalAim('# t\n\n## 목표\n\n첫 줄이다. 둘째 문장.\n이어진 줄.\n\n다음 문단\n\n## 범위\n'),
    { line: 5, text: '첫 줄이다. 둘째 문장. 이어진 줄.', sentences: ['첫 줄이다.', '둘째 문장.', '이어진 줄.'] });
  assert.equal(parseGoalAim('# t\n\n## 범위\n'), null);
});
