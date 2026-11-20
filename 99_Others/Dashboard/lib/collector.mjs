import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { gitRunner, readWorktree } from './git.mjs';
import { GOAL_STATUS, RULES, SCHEMA, SECTION_RE, isoKst, judgeFlow, judgeGoal, lines, parseGoalSteps, planLines, stripBom, parseBacklog, parseHookTail, parseLedger, parsePhaseFlow, parsePhaseRecords, parsePin, parsePlanHeader } from './markdown.mjs';
import { VOICE_FILE, hookPhrase, parseOverview, parseVoice } from './phrases.mjs';
import { buildGoalList, doingLine, shortName, goalState, goalTitle, judgeHand, milestoneName, parseGoalAim, parsePlannedGoals, summarizeActivity, userChores } from './progress.mjs';
import { BOARD, decisionSig, parseBoard } from './decisions.mjs';

export const GATE_CONFIG = '98_Management/01_GateState/gate-config.json';
export const HOOK_LOG = '98_Management/01_GateState/hook-log.jsonl';
export const MILESTONES = '01_Milestones';
const SPEC_NAME = '00_마일스톤-스펙.md';
export const BACKLOG = '99_Backlog.md';
// 마일스톤 폴더의 첫머리 문서: 다중 파일 형식(M01~M03) → 마일스톤 스펙(M08~) → goal 한 장이 곧 마일스톤인 폴더(M04)
export const HEAD_FILES = Object.freeze(['_MilestonePreview.md', SPEC_NAME, '00_Goal.md']);

// 첫머리의 「상태:」. 마일스톤 스펙은 「- 마일스톤:」 줄 대신 「- 작성: … · 상태: …」 줄에 상태를 둔다.
export function milestoneHead(text) {
  const h = parsePlanHeader(text);
  if (h.status != null) return { title: h.title, status: h.status, line: h.statusLineNo || h.titleLine };
  const all = lines(text), end = all.findIndex(l => SECTION_RE.test(l)), head = end < 0 ? all : all.slice(0, end);
  for (let i = 0; i < head.length; i++) {
    if (!/^-\s/.test(head[i])) continue;
    const parts = head[i].replace(/^-\s*/, '').trim().split(/\s+·\s+/), k = parts.findIndex(s => /^상태\s*:/.test(s));
    if (k >= 0) return { title: h.title, status: parts.slice(k).join(' · ').replace(/^상태\s*:\s*/, '').trim(), line: i + 1 };
  }
  return { title: h.title, status: null, line: h.titleLine };
}

export async function readTail(file, bytes) {
  const handle = await fsp.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes), buffer = Buffer.alloc(size - start);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, start + offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return { text: buffer.subarray(0, offset).toString('utf8'), size, truncated: start > 0 };
  } finally { await handle.close(); }
}
const defaultIo = { readFile: fsp.readFile, readdir: fsp.readdir, stat: fsp.stat, tail: readTail };

export const readError = (target, error) => error?.code === 'ENOENT'
  ? `${target} 파일이나 폴더를 찾지 못했어요.`
  : error?.code ? `${target}을(를) 읽지 못했어요 (${error.code}).` : (error?.message || `${target}을(를) 읽지 못했어요.`);
const slash = p => p.replace(/\\/g, '/');
const phaseNum = n => Number(/_Phase_(\d+)\.md$/.exec(n)[1]);

export async function collect(repoPath, { revision = 1, now = new Date(), io = defaultIo, git = gitRunner(repoPath), watchError = null, previous = null } = {}) {
  const sources = [], collectedAt = isoKst(now);
  const abs = rel => path.isAbsolute(rel) ? rel : path.join(repoPath, ...rel.split('/'));
  const cache = new Map();
  // 같은 수집 안에서는 파일을 한 번만 읽는다. 실패는 어떤 파일이었는지를 달고 올라간다.
  const read = rel => {
    if (!cache.has(rel)) cache.set(rel, io.readFile(abs(rel), 'utf8').then(stripBom, e => { e.target = rel; throw e; }));
    return cache.get(rel);
  };
  const source = (id, label, target, status, error = null) => sources.push({ id, label, target, status, collectedAt, error });
  async function block(id, label, target, fallback, fn) {
    try {
      const value = await fn();
      const status = value?.status === 'absent' ? 'absent' : 'ok';
      source(id, label, target, status, status === 'absent' ? value.note : null);
      return { sourceId: id, ...fallback, ...value, status };
    } catch (error) {
      const message = error.code ? readError(error.target || target, error) : error.message;
      source(id, label, target, 'failed', message);
      return { sourceId: id, ...fallback, status: 'failed' };
    }
  }

  // 1. 현재 좌표: gate-config의 포인터를 따라간다. 경로는 코드에 고정하지 않는다.
  const pointer = await block('pointer', '현재 좌표 포인터', GATE_CONFIG, { planPath: null, workPinPath: null }, async () => {
    let config;
    try { config = JSON.parse(await read(GATE_CONFIG)); } catch (e) { if (e.code) throw e; throw new Error('gate-config.json의 JSON 형식을 읽지 못했어요.'); }
    const pick = k => { if (typeof config?.[k] !== 'string' || !config[k].trim()) throw new Error(`gate-config.json에 ${k} 값이 없어요.`); return slash(config[k].trim()); };
    return { planPath: pick('planPath'), workPinPath: pick('workPinPath') };
  });
  const needPointer = key => { if (pointer.status !== 'ok') throw new Error('현재 좌표 포인터를 읽지 못해 이 블록의 원문을 정하지 못했어요.'); return pointer[key]; };
  const planPath = pointer.planPath, planDir = planPath ? path.posix.dirname(planPath) : null;

  // 계획 문서 + 같은 폴더의 NN_Phase_N.md를 plan-gate와 같은 순서로 이어 붙인다.
  let planLoad = null;
  const loadPlan = () => planLoad ||= (async () => {
    const preview = await read(needPointer('planPath'));
    const parts = [{ file: planPath, text: preview }];
    if (path.posix.basename(planPath) === '_MilestonePreview.md') {
      let names;
      try { names = await io.readdir(abs(planDir)); } catch (e) { e.target = planDir; throw e; }
      for (const n of names.filter(n => /^\d+_Phase_\d+\.md$/.test(n)).sort((a, b) => phaseNum(a) - phaseNum(b))) {
        const file = `${planDir}/${n}`;
        parts.push({ file, text: await read(file) });
      }
    }
    return { preview, parts, entries: planLines(parts) };
  })();

  // 첫머리는 Preview만 읽는다. Phase 파일 하나가 깨져도 마일스톤 이름은 보인다.
  const milestone = await block('milestone', '계획 문서 첫머리', planPath || '(포인터 미확인)', { planPath, title: null, statusText: null, statusLine: null }, async () => {
    const h = parsePlanHeader(await read(needPointer('planPath')));
    return { planPath, title: h.title, statusText: h.status, statusLine: h.statusLine, ref: { path: planPath, line: h.statusLineNo || h.titleLine } };
  });

  const pin = await block('pin', 'work-pin 좌표·마감 요약', pointer.workPinPath || '(포인터 미확인)', { path: pointer.workPinPath, coord: null, summary: null }, async () => {
    const file = needPointer('workPinPath');
    return { path: file, ...parsePin(await read(file)) };
  });

  // 작업 사본(읽기 전용 git). Phase 흐름 판정이 최근 커밋 제목을 쓰므로 먼저 읽는다. 커밋 목록은 보기 모델에 싣지 않는다.
  let commits = null;
  const worktree = await block('worktree', '작업 사본(git)', 'git rev-parse · log · status · rev-list', {}, async () => {
    const { log, ...rest } = await readWorktree(git, { stat: io.stat });
    commits = log ?? null;
    return rest;
  });

  // 사람 문장: 현재 계획 폴더의 「00_현황판-문장.md」. 없으면 계획 문서 「사람용 개요」 첫 문단으로 내려간다. 문장을 만들지 않는다.
  const voicePath = planDir ? `${planDir}/${VOICE_FILE}` : null;
  const voice = await block('voice', '사람 문장', voicePath || '(포인터 미확인)', { path: voicePath, milestone: null, phases: {}, overview: null }, async () => {
    needPointer('planPath');
    let overview = null;
    try { const o = parseOverview(await read(planPath)); overview = o && { ...o, path: planPath }; } catch { /* 계획 문서 실패는 milestone 블록이 알린다 */ }
    try { return { path: voicePath, ...parseVoice(await read(voicePath)), overview }; }
    catch (e) { if (e.code === 'ENOENT') return { status: 'absent', path: voicePath, milestone: null, phases: {}, overview, note: `현재 마일스톤 폴더에 ${VOICE_FILE}가 없어요. 원문을 그대로 보여 줘요.` }; throw e; }
  });

  // 진척 표시 낡음(M05 Backlog 62): goal 문서의 마지막 커밋 뒤에 그 브랜치 커밋이 더 있으면 그 수. 문서를 고치는 중(커밋 전)이거나 git을 못 읽으면 null이다.
  async function staleMark(file) {
    if (worktree.status !== 'ok' || (worktree.changes || []).some(c => c.path === file)) return null;
    try {
      const commit = (await git(['log', '-1', '--format=%h', '--', file])).trim();
      if (!/^[0-9a-f]{4,40}$/.test(commit)) return null;
      const after = Number((await git(['rev-list', '--count', `${commit}..HEAD`])).trim());
      return Number.isInteger(after) && after > 0 ? { after, commit } : null;
    } catch { return null; }
  }

  // 2. Phase 흐름: 표의 이름·목표 + Phase 절의 검증 기록 집계
  const pinItem = label => pin.status === 'ok' ? pin.coord?.items.find(it => it.label === label) || null : null;
  const pinState = pinItem('상태'), pinPhaseMatch = pinState && /Phase\s*(\d+)/.exec(pinState.text);
  // 「Phase N 완료」처럼 끝났다고 쓴 문장은 그다음 Phase가 현재라는 뜻으로 읽는다.
  const pinDone = !!pinPhaseMatch && /^\s*\**\s*(완료|종료|마감|끝)/.test(pinState.text.slice(pinPhaseMatch.index + pinPhaseMatch[0].length));
  const pinPhase = pinPhaseMatch ? Number(pinPhaseMatch[1]) : null;
  const milestoneId = /^M\d+/i.exec(milestone.title || '')?.[0] || null;
  // goal 한 장 형식: 템플릿 규칙대로 파일 이름이 _MilestonePreview.md가 아니면 이 형식이다(그 이름만 다중 파일 형식으로 판독된다).
  const goalFormat = !!planPath && path.posix.basename(planPath) !== '_MilestonePreview.md';
  const phasesTarget = !planDir ? '(포인터 미확인)' : goalFormat ? `${planPath} (goal 한 장의 진척 단계)` : `${planDir}/ (Preview + NN_Phase_N.md)`;
  const phases = await block('phases', goalFormat ? '진척 단계·검증 기록' : 'Phase 흐름·검증 기록', phasesTarget, { items: [] }, async () => {
    const { preview, parts, entries } = await loadPlan();
    if (goalFormat) {
      const status = parsePlanHeader(preview).status, statusHead = status ? status.split(/\s+·\s+/)[0] : null;
      const { phaseLine, stepsLine, steps } = parseGoalSteps(entries);
      const r = parsePhaseRecords(entries)[0] || null, rec = r?.record || null;
      const g = judgeGoal(steps, rec, { status });
      const stale = g.currentCount && !g.closed ? await staleMark(planPath) : null;
      const items = g.items.map(s => ({ num: s.num, label: s.label, name: s.name, short: shortName(s.name), mark: s.mark, odd: s.odd, flow: s.flow, state: s.flow,
        tags: [], goal: null, inTable: true, tableRef: null, ref: { path: s.file, line: s.line }, record: null, commit: null, duplicate: false }));
      return { planPath, format: 'goal', files: [planPath], items, current: g.current, next: g.next, basis: 'steps', milestoneId, pinPhase: null, pinDisagrees: false,
        record: rec && { ...rec, ref: rec.line ? { path: r.file, line: rec.line } : null },
        goal: { stage: g.stage, closed: g.closed, stopped: g.stopped, waitingUser: g.waitingUser, done: g.done, currentCount: g.currentCount, stale,
          status: statusHead, statusWord: GOAL_STATUS.exec(status || '')?.[1] ?? null, phaseName: r?.name ?? null,
          ref: { path: planPath, line: stepsLine ?? phaseLine } } };
    }
    const table = parsePhaseFlow(preview), recs = parsePhaseRecords(entries);
    const nums = [...new Set([...table.map(t => t.num), ...recs.map(r => r.num)])].sort((a, b) => a - b);
    const items = nums.map(num => {
      const t = table.find(x => x.num === num), r = recs.find(x => x.num === num);
      const rec = r?.record || null, total = rec ? rec.pass + rec.fail + rec.userInput : 0;
      const state = !r ? 'no-section' : !rec.section ? 'no-record-section' : rec.failSinceUserInput >= RULES.failLimit ? 'stopped' : total === 0 ? 'empty' : 'recorded';
      const name = t?.name || r?.name || `Phase ${num}`;
      return { num, name, short: shortName(name), tags: t?.tags?.length ? t.tags : r?.tags || [], goal: t?.goal || r?.goal || null,
        inTable: !!t, tableRef: t ? { path: planPath, line: t.line } : null, ref: r ? { path: r.file, line: r.line } : null,
        record: rec && { ...rec, ref: rec.line ? { path: r.file, line: rec.line } : null }, state, duplicate: recs.filter(x => x.num === num).length > 1 };
    });
    const pinCurrent = pinPhase == null ? null : pinDone ? items.find(p => p.num > pinPhase)?.num ?? null : pinPhase;
    const flow = judgeFlow(items, { milestoneId, commits, pinPhase: pinCurrent });
    return { planPath, format: 'phases', files: parts.map(p => p.file), items: flow.items, current: flow.current, basis: flow.basis, milestoneId, pinPhase: pinCurrent,
      pinDisagrees: pinCurrent != null && flow.current != null && pinCurrent !== flow.current };
  });
  // 머리의 「다음」: 현재 Phase의 다음 번호 Phase와, pin 「다음 액션」 원문(접어서 보인다).
  const nextRaw = pinItem('다음 액션');
  const focus = { current: phases.current ?? null, basis: phases.basis ?? null,
    nextPhase: phases.format === 'goal' ? phases.next ?? null : phases.current == null ? null : phases.items.find(p => p.num > phases.current)?.num ?? null,
    pinNext: nextRaw && { text: nextRaw.text, parts: nextRaw.parts, line: nextRaw.line }, pinState: pinState && { text: pinState.text, parts: pinState.parts, line: pinState.line } };

  // 3. 결정 대장: plan-gate 판정 ③과 같은 집계 — 같은 폴더의 마일스톤 스펙 대장을 더하고, 그 파일을 못 읽으면 더하지 않는다
  const ledger = await block('ledger', '결정 대장', planPath || '(포인터 미확인)', { tally: null, userSide: null, gate: null, aiLines: [] }, async () => {
    const { entries } = await loadPlan();
    const specPath = planDir && planDir.startsWith(MILESTONES + '/') ? `${planDir}/${SPEC_NAME}` : null;
    let specEntries = null;
    if (specPath && specPath.toLowerCase() !== planPath.toLowerCase()) {
      try { specEntries = planLines([{ file: specPath, text: await read(specPath) }]); } catch { specEntries = null; }
    }
    const l = parseLedger(entries, specEntries);
    return { ...l, ref: { path: l.file, line: l.line } };
  });

  // 4. 마일스톤 목록: 폴더마다 첫머리 문서 하나(HEAD_FILES 순서). 셋 다 없으면 머리말 「상태:」가 있는 goal 문서를 센다(M05 Backlog 44).
  const milestones = await block('milestones', '마일스톤 목록', MILESTONES + '/', { items: [] }, async () => {
    let entries;
    try { entries = await io.readdir(abs(MILESTONES), { withFileTypes: true }); } catch (e) { e.target = MILESTONES; throw e; }
    const dirs = entries.filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => e.name).sort((a, b) => a.localeCompare(b));
    const items = [];
    for (const name of dirs) {
      const dir = `${MILESTONES}/${name}`;
      let names = null;
      try { names = await io.readdir(abs(dir)); } catch { names = null; }
      const headFile = names ? HEAD_FILES.find(f => names.includes(f)) : HEAD_FILES[0];
      const item = { name, path: `${dir}/${headFile ?? HEAD_FILES[0]}`, current: planDir === dir, state: 'ok', title: null, statusText: null, error: null };
      try {
        if (headFile) { const h = milestoneHead(await read(item.path)); Object.assign(item, { title: h.title, statusText: h.status, line: h.line }); }
        else {
          const goals = { total: 0, closed: 0 };
          for (const n of names.filter(n => /\.md$/i.test(n))) {
            let h = null;
            try { h = parsePlanHeader(await read(`${dir}/${n}`)); } catch { /* 제목 없는 문서는 goal이 아니다 */ }
            if (h && goalTitle(h.title) && h.status) { goals.total++; if (goalState(h.status).state === 'done') goals.closed++; }
          }
          if (goals.total) Object.assign(item, { state: 'goals', path: dir, goals });
          else Object.assign(item, { state: 'missing', error: readError(item.path, { code: 'ENOENT' }) });
        }
      } catch (e) { item.state = e.code === 'ENOENT' ? 'missing' : 'failed'; item.error = e.code ? readError(item.path, e) : e.message; }
      items.push(item);
    }
    return { items };
  });

  // 6. 훅 활동: hook-log 꼬리만 읽는다
  const hooks = await block('hooks', '훅 활동', HOOK_LOG, { entries: [], lines: null, bad: null }, async () => {
    let t;
    try { t = await io.tail(abs(HOOK_LOG), RULES.hookTailBytes); } catch (e) { e.target = HOOK_LOG; throw e; }
    const parsed = parseHookTail(t.text, { truncated: t.truncated });
    // 고정 사전에 있는 판정만 사람 문장을 단다. 없는 값은 say가 null이고 화면이 원문을 그대로 보인다.
    for (const e of parsed.entries) Object.assign(e, hookPhrase(e), e.deny ? { level: 'block' } : null);
    return { path: HOOK_LOG, size: t.size, truncated: t.truncated, ...parsed };
  });

  // 7. Backlog: 현재 마일스톤 폴더에 있을 때만 읽는다. 없음은 실패가 아니라 「없음」이다.
  const backlogPath = planDir ? `${planDir}/${BACKLOG}` : null;
  const backlog = await block('backlog', 'Backlog', backlogPath || '(포인터 미확인)', { path: backlogPath, sections: [], count: null }, async () => {
    needPointer('planPath');
    try { return { path: backlogPath, ...parseBacklog(await read(backlogPath)) }; }
    catch (e) { if (e.code === 'ENOENT') return { status: 'absent', path: backlogPath, sections: [], count: null, note: '현재 마일스톤 폴더에 99_Backlog.md가 없어요.' }; throw e; }
  });

  // 8. 마일스톤 안 goal 목록: 현재 goal 폴더의 goal 문서들(머리말 상태)과, 계획 문서 「… goal 목록」 절의 아직 파일이 없는 goal.
  //    goal 한 장 형식에서만 읽는다. 다중 파일 형식의 옛 마일스톤은 원천 목록에 넣지 않고 「없음」으로 둔다.
  const goalsFallback = { items: [], total: null, milestoneName: null, current: null, aim: null };
  const goals = planDir && !goalFormat ? { sourceId: 'goals', ...goalsFallback, status: 'absent' } : await block('goals', '마일스톤 안 goal 목록', planDir ? `${planDir}/ (goal 문서 머리말 · 계획 문서 goal 목록)` : '(포인터 미확인)',
    goalsFallback, async () => {
      needPointer('planPath');
      const head = parsePlanHeader(await read(planPath)), cur = goalTitle(head.title);
      let names;
      try { names = await io.readdir(abs(planDir)); } catch (e) { e.target = planDir; throw e; }
      const files = [], planned = [];
      for (const n of names.filter(n => /\.md$/i.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
        const file = `${planDir}/${n}`, text = await read(file);
        let h = null;
        try { h = parsePlanHeader(text); } catch { /* 제목 없는 문서는 goal이 아니다 */ }
        // goal 문서는 「M05 G9c — …」 제목에 머리말 「상태:」까지 있는 문서다. 같은 꼴의 제목이라도 상태가 없으면 부속 문서(차이 목록·재실측)다.
        if (h && goalTitle(h.title) && h.status) files.push({ path: file, title: h.title, status: h.status, line: h.statusLineNo || h.titleLine });
        else for (const p of parsePlannedGoals(text)) planned.push({ ...p, path: file });
      }
      return { ...buildGoalList(files, planned, planPath), milestoneName: milestoneName(head.statusLine), current: cur,
        aim: (a => a && { ...a, path: planPath })(parseGoalAim(await read(planPath))) };
    });

  // 9. 결정 보드(M05 H7): 사용자 결정을 기다리는 항목. 메인 세션이 쓰는 로컬 파일이라 포인터와 무관하게 읽는다.
  //    없으면 실패가 아니라 「없음」이다. 반쯤 쓰였거나 읽지 못하면 그 블록만 실패로 알리고, 직전 수집의 정상 목록(previous)을 그대로 둔다.
  const kept = previous?.decisions && Array.isArray(previous.decisions.items) ? previous.decisions : null;
  const decisions = await block('decisions', '결정 보드', BOARD,
    { path: BOARD, items: kept?.items ?? [], sig: kept?.sig ?? decisionSig(kept?.items ?? []), warnings: kept?.warnings ?? [], skipped: kept?.skipped ?? 0, kept: !!kept?.items.length }, async () => {
      let raw;
      try { raw = await read(BOARD); }
      catch (e) { if (e.code === 'ENOENT') return { status: 'absent', path: BOARD, items: [], sig: decisionSig([]), warnings: [], skipped: 0, kept: false, note: '결정 보드 파일이 없어요. 답을 기다리는 결정이 없다는 뜻이에요.' }; throw e; }
      const b = parseBoard(raw);
      return { path: BOARD, ...b, sig: decisionSig(b.items), kept: false };
    });

  // 맨 위 세 질문의 재료. 판정은 lib/progress.mjs의 고정 규칙이다.
  const pinWatch = pin.status === 'ok' ? pin.summary?.watch : null;
  const summary = {
    doing: doingLine({ goal: goals.current, phases }),
    activity: hooks.status === 'ok' ? summarizeActivity(hooks.entries) : null,
    hand: judgeHand({ phases, ledger, hooks, failLimit: RULES.failLimit }),
    chores: userChores(pinWatch), choresRef: pinWatch ? { path: pin.path, line: pinWatch.line } : null,
  };

  source('watch', '파일 변경 감시', '저장소 전체(node_modules·.git/objects 제외)', watchError ? 'failed' : 'ok', watchError);
  return { schema: SCHEMA, revision, collectedAt, repo: { name: path.basename(path.resolve(repoPath)), path: slash(repoPath) },
    rules: { failLimit: RULES.failLimit, hookTailLines: RULES.hookTailLines, hookRecent: RULES.hookRecent, denyVerdicts: RULES.denyVerdicts, denyFreshMinutes: RULES.denyFreshMinutes },
    sources, pointer, milestone, voice, focus, pin, phases, ledger, milestones, worktree, hooks, backlog, goals, decisions, summary };
}
