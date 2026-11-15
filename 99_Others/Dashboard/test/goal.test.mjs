// goal 한 장 형식(AgentDeck 04_Goal-한장-템플릿.md): 「진척 단계」 항목이 곧 단계다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, readTail } from '../lib/collector.mjs';
import { judgeGoal, parseGoalSteps, planLines } from '../lib/markdown.mjs';
import { fakeGit, NOW } from './helpers.mjs';

const goalRepo = fileURLToPath(new URL('./fixtures/goal-repo/', import.meta.url));
const DIR = '01_Milestones/M09_Goals';
// 포인터만 바꿔 같은 고정 입력 폴더의 다른 goal 문서를 읽힌다
const pointTo = file => ({ readdir: fsp.readdir, stat: fsp.stat, tail: readTail, readFile: async (f, enc) =>
  path.normalize(f).endsWith(path.normalize('gate-config.json'))
    ? JSON.stringify({ planPath: `${DIR}/${file}`, workPinPath: `${DIR}/01_Work_Pin.md` }) : fsp.readFile(f, enc) });
const load = file => collect(goalRepo, { now: NOW, git: fakeGit(), io: pointTo(file) });
const flows = vm => vm.phases.items.map(p => [p.label, p.flow]);

test('goal steps: checkbox items under 「진척 단계」 only, written numbers kept, indented sub-lines skipped', () => {
  const text = ['## Phase 1 — 이름 · 태그: `t` · 의존: 없음', '', '진척 단계 (안내)', '', '- [x] 1. 첫째', '  - 하위 줄', '- [>] 2. 둘째 `코드`', '- [ ] 2b. 셋째', '- [~] 3. 넷째',
    '', '실행 단계 일괄 승인 대상', '', '- [ ] 9. 목록 밖', '', '검증 기록', '', '- (기록 없음)'].join('\n');
  const g = parseGoalSteps(planLines([{ file: 'g.md', text }]));
  assert.deepEqual(g.steps.map(s => [s.mark, s.label, s.name, s.flow, s.odd, s.line]),
    [['x', '1', '첫째', 'done', false, 5], ['>', '2', '둘째 `코드`', 'current', false, 7], [' ', '2b', '셋째', 'waiting', false, 8], ['~', '3', '넷째', 'waiting', true, 9]]);
  assert.deepEqual([g.phaseLine, g.stepsLine], [1, 3]);
  assert.throws(() => parseGoalSteps(planLines([{ file: 'g.md', text: '## 목표\n\n- [ ] 1. 절 밖' }])), /Phase 1/);
  assert.throws(() => parseGoalSteps(planLines([{ file: 'g.md', text: '## Phase 1 — a · 태그: `t` · 의존: 없음\n\n- [ ] 1. 머리 없음' }])), /진척 단계/);
});

test('goal judge: current is the first [>], next the first [ ]; no [>] is a stage, not a failure', () => {
  const s = marks => [...marks].map((m, i) => ({ mark: m, flow: { x: 'done', '>': 'current', ' ': 'waiting' }[m], label: String(i + 1), name: 'n' + i }));
  const rec = (fail = 0, since = fail, last = null) => ({ section: true, pass: 1, fail, userInput: 0, failSinceUserInput: since, last: last && { marker: last } });
  assert.deepEqual((({ current, next, stage }) => [current, next, stage])(judgeGoal(s('x> '), rec())), [2, 3, 'running']);
  assert.deepEqual((({ current, next, stage }) => [current, next, stage])(judgeGoal(s('   '), rec())), [null, 1, 'not-started']);
  assert.deepEqual((({ current, next, stage, done }) => [current, next, stage, done])(judgeGoal(s('xx  '), rec())), [null, 3, 'between', 2]);
  assert.deepEqual((({ current, next, stage }) => [current, next, stage])(judgeGoal(s('xx'), rec())), [null, null, 'all-done']);
  assert.equal(judgeGoal(s('x> >'), rec()).currentCount, 2);
  // FAIL 두 번은 멈춤이 아니고, 세 번은 진행 단계(없으면 다음 단계)가 멈춤이다
  assert.equal(judgeGoal(s('x> '), rec(2)).stopped, false);
  const stopped = judgeGoal(s('xx '), rec(3));
  assert.deepEqual([stopped.stopped, stopped.stage, stopped.current, stopped.items[2].flow, stopped.next], [true, 'stopped', 3, 'stopped', null]);
  // 종결이면 멈춤도 입력 대기도 판정하지 않는다
  const closed = judgeGoal(s('xx'), rec(3, 3, 'USER-INPUT'), { status: '종결 (PR 9 병합) · 검증 강도: 약' });
  assert.deepEqual([closed.closed, closed.stage, closed.stopped, closed.waitingUser], [true, 'closed', false, false]);
  assert.equal(judgeGoal(s('x> '), rec(0, 0, 'USER-INPUT')).waitingUser, true);
});

test('goal in progress: steps, current [>], next [ ], goal-wide record; the multi-file table is not required', async () => {
  const vm = await load('10_Goal-G1-진행-중.md');
  assert.deepEqual(vm.sources.filter(s => s.status === 'failed'), []);
  const P = vm.phases;
  assert.deepEqual([P.status, P.format, P.basis, P.current, P.next], ['ok', 'goal', 'steps', 3, 4]);
  assert.deepEqual(flows(vm), [['1', 'done'], ['2', 'done'], ['3', 'current'], ['3b', 'waiting'], ['4', 'waiting']]);
  assert.equal(P.items[2].name, '구현 — `parseGoalSteps` 추가');
  assert.deepEqual(P.items[2].ref, { path: `${DIR}/10_Goal-G1-진행-중.md`, line: 22 });
  assert.deepEqual([P.record.pass, P.record.fail, P.record.userInput, P.record.failSinceUserInput, P.record.last.marker], [2, 1, 0, 1, 'PASS']);
  assert.deepEqual([P.goal.stage, P.goal.status, P.goal.statusWord, P.goal.waitingUser, P.goal.phaseName], ['running', '실행 중', '실행 중', false, '진행 시험']);
  assert.deepEqual([vm.focus.current, vm.focus.nextPhase, vm.focus.basis], [3, 4, 'steps']);
  assert.equal(vm.ledger.status, 'ok');
});

test('just-written goal: 「(기록 없음)」 and no [>] read as 「before the first step」, not as a read failure', async () => {
  const vm = await load('20_Goal-G2-막-작성.md');
  const P = vm.phases;
  assert.equal(P.status, 'ok');
  assert.deepEqual([P.current, P.next, P.goal.stage, P.goal.statusWord, P.goal.done], [null, 1, 'not-started', '초안', 0]);
  assert.deepEqual([P.record.section, P.record.pass + P.record.fail + P.record.userInput, P.record.last], [true, 0, null]);
  assert.deepEqual(flows(vm), [['1', 'waiting'], ['2', 'waiting'], ['3', 'waiting']]);
  assert.deepEqual([vm.focus.current, vm.focus.nextPhase], [null, 1]);
});

test('goal waiting on the user: last record line is USER-INPUT, and it resets the FAIL count', async () => {
  const P = (await load('30_Goal-G3-입력-대기.md')).phases;
  assert.deepEqual([P.current, P.goal.stage, P.goal.waitingUser, P.goal.stopped], [2, 'running', true, false]);
  assert.deepEqual([P.record.fail, P.record.failSinceUserInput, P.record.last.marker], [1, 0, 'USER-INPUT']);
  assert.match(P.record.last.text, /^범위를 바꾸는 항목 둘/);
});

test('goal with FAILs piling up: three after the last USER-INPUT stop the current step', async () => {
  const vm = await load('40_Goal-G4-실패-누적.md');
  const P = vm.phases;
  assert.deepEqual([P.record.fail, P.record.failSinceUserInput], [4, 3]);
  assert.deepEqual([P.goal.stopped, P.goal.stage, P.current, P.goal.waitingUser], [true, 'stopped', 2, false]);
  assert.deepEqual(flows(vm), [['1', 'done'], ['2', 'stopped'], ['3', 'waiting']]);
  assert.equal(vm.focus.nextPhase, 3);
});

test('closed goal: 「상태: 종결」 shows as closed, never stopped or waiting', async () => {
  const P = (await load('50_Goal-G5-종결.md')).phases;
  assert.deepEqual([P.goal.closed, P.goal.stage, P.goal.status, P.goal.stopped, P.goal.waitingUser], [true, 'closed', '종결 (PR 9 병합)', false, false]);
  assert.deepEqual([P.current, P.next, P.goal.done], [null, null, 2]);
});

test('a goal document without its Phase section fails the steps block with a Korean reason', async () => {
  const io = pointTo('10_Goal-G1-진행-중.md'), read = io.readFile;
  io.readFile = async (f, enc) => f.endsWith('진행-중.md') ? '# M09 G1 — 깨짐\n\n- 마일스톤: M09 · 상태: 실행 중\n\n## 목표\n\n없음\n' : read(f, enc);
  const vm = await collect(goalRepo, { now: NOW, git: fakeGit(), io });
  assert.equal(vm.phases.status, 'failed');
  assert.match(vm.sources.find(s => s.id === 'phases').error, /「## Phase 1 — …」 절을 찾지 못했어요/);
  assert.equal(vm.milestone.status, 'ok');
});
