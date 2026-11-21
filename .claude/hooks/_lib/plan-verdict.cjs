// 스폰 직전(`20_plan-gate.cjs`)과 편집 직전(`31_edit-plan-gate.cjs`)이 같은 판정을 쓰도록 한 곳에 둔다 — 두 곳에 베끼면 한쪽만 고쳐진다.
// 판정은 ①계획 규격 ②실패 카운터 ③결정 대장 주도권 ④라우팅이다. 스폰 자리는 넷 다, 편집 자리는 ①②③만 거부로 쓴다.
// 반환은 첫 거부 하나다 — 뒤 판정이 앞 판정의 병합 텍스트·절 분해에 올라서므로 단락 평가다.
'use strict';
const fs = require('fs');
const path = require('path');
const { toAbs } = require('./repo-path.cjs');

const FAIL_LIMIT = 3;  // 집행 사본 — 값의 소유자는 노션 02. Project Rules 검증 4
const PHASE_LIMIT = 8; // 집행 사본 — 값의 소유자는 노션 01장 「각 구역의 역할」 01_Milestones 해설
// 제목 단독 줄만 절 헤더다 — 접두사 판독은 「검증 기록은 아직 없음」 같은 산문 줄을 헤더로 읽어 절 검사를 우회시켰다.
const RECORD_HEADER = /^검증 기록\s*$/;

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const hasConflictMarkers = (text) => /^<{7}(?: |$)/m.test(text) && /^>{7}(?: |$)/m.test(text);
// 머리말(첫 `##` 절 앞)의 「상태: 종결」만 읽는다 — 본문의 서술은 머리말이 아니다.
const isClosed = (text) => /상태:\s*종결/.test(text.split(/^##\s/m)[0]);

// planPath 포인터가 없거나 깨졌거나 비면 기본값 없이 { planRel: null, rule, problem }을 돌려준다 (fail-closed).
function readPlanPointer(root) {
  const missing = (problem) => ({ planRel: null, rule: '계획-포인터-결손', problem });
  let raw;
  try { raw = stripBom(fs.readFileSync(path.join(root, '98_Management', '01_GateState', 'gate-config.json'), 'utf8')); }
  catch (e) { return missing('gate-config.json을 읽을 수 없다'); }
  if (hasConflictMarkers(raw)) {
    return { planRel: null, rule: '계획-포인터-충돌', problem: 'gate-config.json에 merge 충돌 표지(<<<<<<< · >>>>>>>)가 있다 — `git checkout --ours|--theirs 98_Management/01_GateState/gate-config.json` 또는 `git merge --abort`로 충돌을 푼 뒤 다시 시도하라' };
  }
  let c;
  try { c = JSON.parse(raw); } catch (e) { return missing('gate-config.json이 JSON으로 읽히지 않는다'); }
  if (!c || typeof c !== 'object' || c.planPath === undefined || c.planPath === null) return missing('gate-config.json에 planPath 키가 없다');
  if (typeof c.planPath !== 'string') {
    return { planRel: null, rule: '계획-포인터-형식', problem: `planPath가 문자열이 아니다(${Array.isArray(c.planPath) ? 'array' : typeof c.planPath})` };
  }
  if (!c.planPath.trim()) return missing('gate-config.json의 planPath가 비어 있다');
  return { planRel: c.planPath, rule: null, problem: null };
}

const LEDGER_TAG = /^-\s*\[(USER·위임|USER|AI·비가역|AI)\]/;

// 계획과 같은 폴더의 `00_마일스톤-스펙.md` 대장 태그 수(판정 ③ 합산용). 못 읽거나 대장 절이 없으면 null.
// 머리말의 경로 글자는 읽지 않는다 — 다른 마일스톤의 스펙을 가리켜 [USER]를 빌려 오는 길을 닫는다.
const SPEC_NAME = '00_마일스톤-스펙.md';
function readSpecTally(root, planAbs) {
  const base = path.resolve(root, '01_Milestones');
  const plan = path.resolve(planAbs);
  const abs = path.join(path.dirname(plan), SPEC_NAME);
  if (!abs.startsWith(base + path.sep) || abs.toLowerCase() === plan.toLowerCase()) return null;
  let specText;
  try { specText = fs.readFileSync(abs, 'utf8'); } catch (e) { return null; }
  const counts = { path: path.relative(path.resolve(root), abs).split(path.sep).join('/'), USER: 0, 'USER·위임': 0, AI: 0, 'AI·비가역': 0 };
  let inLedger = false, found = false;
  for (const l of specText.split(/\r?\n/)) {
    if (/^##\s/.test(l)) { inLedger = /^##\s+결정 대장/.test(l); found = found || inLedger; continue; }
    if (!inLedger) continue;
    const t = l.match(LEDGER_TAG);
    if (t) counts[t[1]]++;
  }
  return found ? counts : null;
}

// 거부: { verdict:'deny', judgment:1|2|3|4, rule, reason, evidence, planRel, planFiles, routing? }
// 통과: { verdict:'allow', planRel, planFiles, humanOverview, failCounts, tally, aiLines, routing }
// planFiles는 파일 구획일 때만 배열이다. 포인터 결손은 planRel이 null인 판정 ① 거부다.
function evaluatePlan(opts = {}) {
  const root = opts.root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let planRel = opts.planRel;
  if (!planRel) {
    const ptr = readPlanPointer(root);
    if (ptr.problem) {
      return {
        verdict: 'deny', judgment: 1, rule: ptr.rule, planRel: null, planFiles: null,
        reason: `계획 포인터 결손: ${ptr.problem} — 종결된 계획으로 대신 판정하지 않는다 (fail-closed)`,
        evidence: { config: '98_Management/01_GateState/gate-config.json', problem: ptr.problem },
      };
    }
    planRel = ptr.planRel;
  }
  const planAbs = toAbs(root, planRel); // `/c/…`도 범위 판정과 같은 실경로로 읽는다

  let text = null;
  let planFiles = null;
  let preview = null;   // 파일 구획일 때 Preview 원문 — 판정 ①의 사람용 개요 검사가 이것만 본다
  const deny = (judgment, rule, reason, evidence, extra) =>
    Object.assign({ verdict: 'deny', judgment, rule, reason, evidence, planRel, planFiles }, extra || {});
  const unreadable = () => deny(1, '계획-문서-부재', `계획 문서를 읽을 수 없다: ${planRel} — 읽을 수 없는 계획으로는 열지 않는다 (fail-closed)`, { planPath: planRel });

  // planPath가 _MilestonePreview.md면 같은 폴더의 NN_Phase_N.md를 번호순으로 병합한 텍스트로 판정한다.
  if (path.basename(planAbs) === '_MilestonePreview.md') {
    try { preview = stripBom(fs.readFileSync(planAbs, 'utf8')); } catch (e) { /* 아래에서 반려 */ }
    if (preview === null) return unreadable();
    const dir = path.dirname(planAbs);
    const phaseNum = n => Number(n.match(/_Phase_(\d+)\.md$/)[1]);
    let phaseNames = [];
    try {
      phaseNames = fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).sort((a, b) => phaseNum(a) - phaseNum(b));
    } catch (e) { /* 목록 실패 = Phase 파일 0개 — 아래 규격 판정이 반려 */ }
    const parts = [preview];
    for (const n of phaseNames) {
      try { parts.push(stripBom(fs.readFileSync(path.join(dir, n), 'utf8'))); }
      catch (e) {
        return deny(1, '계획-문서-부재', `Phase 파일을 읽을 수 없다: ${n} — 결손 계획은 반려 (fail-closed)`, { planPath: planRel, file: n });
      }
    }
    text = parts.join('\n');
    planFiles = [path.basename(planAbs), ...phaseNames];
  } else {
    try { text = stripBom(fs.readFileSync(planAbs, 'utf8')); } catch (e) { /* 아래에서 반려 */ }
    if (text === null) return unreadable();
  }
  if (hasConflictMarkers(text)) {
    return deny(1, '계획-충돌-표지', `계획 문서에 merge 충돌 표지(<<<<<<< · >>>>>>>)가 있다: ${planRel} — 충돌을 푼 뒤 다시 시도하라 (fail-closed)`, { planPath: planRel });
  }

  const sections = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) { cur = { header: line, body: [] }; sections.push(cur); }
    else if (cur) cur.body.push(line);
  }
  const phaseFullRe = /^##\s+Phase\s+(\d+)\s*[—-]\s*(.+?)\s*·\s*태그:\s*(.+?)\s*·\s*의존:\s*(.+?)\s*$/;
  const phaseAnyRe = /^##\s+Phase\s+(\d+)/;
  const phases = [];
  let malformedPhase = null;
  for (const s of sections) {
    const m = s.header.match(phaseFullRe);
    if (m) {
      const tags = [...m[3].matchAll(/`([^`]+)`/g)].map(x => x[1]);
      const deps = /없음/.test(m[4]) ? [] : (m[4].match(/\d+/g) || []).map(Number);
      phases.push({ num: Number(m[1]), name: m[2], tags, deps, body: s.body });
      if (tags.length === 0) malformedPhase = malformedPhase || `Phase ${m[1]} 태그 표기 부재`;
    } else if (phaseAnyRe.test(s.header)) {
      malformedPhase = malformedPhase || `${s.header.slice(0, 40)} — 태그·의존 표기 부재`;
    }
  }

  // 판정 ① — 계획 템플릿 규격(필수 절·태그 표기)의 기계 실측이다. 사람 검증은 게이트 밖이다.
  const hasOverview = sections.some(s => /^##\s+(개요|목표)(\s|$)/.test(s.header)); // \b는 한글 뒤에서 불성립 — 사용 금지
  if (!hasOverview) return deny(1, '검증-미통과', '필수 절 부재: 개요(목표) 절이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
  // 파일 구획이면 Phase 파일의 동명 절이 결손을 가리지 못하게 preview만 본다. 단일 파일은 검사하지 않는다.
  const humanOverview = preview === null ? null : /^##\s+사람용 개요(\s|$)/m.test(preview);
  if (humanOverview === false) return deny(1, '검증-미통과', '필수 절 부재: 사람용 개요 절이 없다 — 사용자 판정 표면 결손, 블랙박스 방지 (fail-closed)', { planPath: planRel });
  if (phases.length === 0) return deny(1, '검증-미통과', 'Phase 구획이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
  if (malformedPhase) return deny(1, '검증-미통과', `도메인 태그·의존성 표기 부재: ${malformedPhase} — 표기 없는 계획은 반려 (노션 02장 분업 2)`, { planPath: planRel });
  const noRecord = phases.filter(p => !p.body.some(l => RECORD_HEADER.test(l)));
  if (noRecord.length > 0) return deny(1, '검증-미통과', `검증 기록 절 부재: Phase ${noRecord.map(p => p.num).join(', ')} — 기록 줄 없는 검증은 무효 (fail-closed)`, { planPath: planRel });

  // 판정 ② — 검증 기록 절 안에서 마지막 USER-INPUT 줄 이후의 FAIL만 센다. DoD·Steps의 FAIL 서술은 세지 않는다.
  const failCounts = {};
  for (const p of phases) {
    let count = 0, inRecord = false;
    for (const l of p.body) {
      if (RECORD_HEADER.test(l)) { inRecord = true; continue; }
      if (!inRecord) continue;
      if (/^-\s*USER-INPUT\b/.test(l)) count = 0; // 기준점 이동 — 이력은 지우지 않는다
      else if (/^-\s*FAIL\b/.test(l)) count++;
    }
    failCounts[`Phase ${p.num}`] = count;
  }
  for (const p of phases) {
    const count = failCounts[`Phase ${p.num}`];
    if (count >= FAIL_LIMIT) {
      return deny(2, '실패-카운터', `Phase ${p.num} FAIL ${count}회(마지막 USER-INPUT 이후) ≥ ${FAIL_LIMIT} — 전진 차단, 에스컬레이션으로 분기하라`, { planPath: planRel, failCounts });
    }
  }

  // 판정 ③ — 결정 대장의 출처 태그를 센다. 대장 부재는 반려다.
  const ledgerSec = sections.find(s => /^##\s+결정 대장/.test(s.header));
  if (!ledgerSec) return deny(3, '대장-부재', '결정 대장 절이 없다 — 대장 부재 = 계획 반려 (노션 02장 순서 4, fail-closed)', { planPath: planRel });
  const tally = { USER: 0, 'USER·위임': 0, AI: 0, 'AI·비가역': 0, spec: null };
  const aiLines = [];
  for (const l of ledgerSec.body) {
    const m = l.match(LEDGER_TAG);
    if (!m) continue;
    tally[m[1]]++;
    if (m[1] === 'AI' || m[1] === 'AI·비가역') aiLines.push(l.slice(0, 80));
  }
  // 헌법 11조 뒤로 사람의 합의는 마일스톤 스펙 대장에 모이므로 주도권은 같은 폴더 스펙 대장을 합쳐 센다.
  // 스펙이 없거나 01_Milestones 밖이면 goal 대장만 센다(닫힌 쪽).
  tally.spec = readSpecTally(root, planAbs);
  const sum = (k) => tally[k] + (tally.spec ? tally.spec[k] : 0);
  if (sum('AI·비가역') >= 1) {
    return deny(3, '주도권-즉시발동', `[AI·비가역] ${sum('AI·비가역')}건(goal ${tally['AI·비가역']} · 마일스톤 스펙 ${tally.spec ? tally.spec['AI·비가역'] : 0}) — 개수 무관 즉시 발동. 비가역은 위임으로 못 덮는다. 선택지형 문답으로 분기하라`, { planPath: planRel, tally, aiLines });
  }
  const aiSide = sum('AI');
  const userSide = sum('USER') + sum('USER·위임'); // 위임 자체가 사용자의 결정 — USER 쪽으로 센다
  if (aiSide > userSide) {
    const scope = tally.spec ? `goal과 마일스톤 스펙(${tally.spec.path}) 합계` : 'goal 대장만(마일스톤 스펙 없음)';
    return deny(3, '주도권-문답분기', `[AI] ${aiSide} > [USER] ${userSide}(${scope}) — 주도권 게이트 발동. 선택지형 문답으로 분기해 [AI] 줄의 답을 받고, 태그를 [USER]로 전환(기준점 이동 문법)한 뒤 재시도하라`, { planPath: planRel, tally, aiLines });
  }

  // 종결은 ①의 거부지만 ②③ 뒤에 본다 — 편집 게이트의 포인터 전환 예외가 실패 카운터·주도권을 건너뛰지 못하게.
  if (isClosed(preview === null ? text : preview)) {
    return deny(1, '계획-종결', `계획이 머리말에 「상태: 종결」을 적었다: ${planRel} — 닫힌 계획으로는 열지 않는다. gate-config.json의 planPath를 다음 계획으로 바꿔라 (01_Milestones 안 편집은 열려 있다)`, { planPath: planRel });
  }

  // 판정 ④ 라우팅 — 편집 자리는 ④를 거부로 쓰지 않고 로그로만 남기므로 거부 여부와 무관하게 끝까지 계산한다.
  const tagKinds = [...new Set(phases.flatMap(p => p.tags))];
  const anc = {}; // 의존 그래프의 조상 집합 (추이 폐쇄)
  for (const p of [...phases].sort((a, b) => a.num - b.num)) {
    anc[p.num] = new Set(p.deps);
    for (const d of p.deps) for (const g of (anc[d] || [])) anc[p.num].add(g);
  }
  let independentPair = null;
  for (const a of phases) for (const b of phases) {
    if (a.num < b.num && !anc[b.num].has(a.num) && !(anc[a.num] || new Set()).has(b.num)) {
      independentPair = independentPair || `Phase ${a.num} ∥ Phase ${b.num}`;
    }
  }
  const cross = tagKinds.length >= 2 || independentPair !== null;
  const routing = {
    tagKinds, phaseCount: phases.length, independentPair,
    route: cross ? '크로스 도메인 Worker 병렬' : '도메인 Worker 단독',
    review: cross ? '리뷰어 1차 + codex 교차 모델 2차' : '리뷰어 1차',
  };
  if (phases.length > PHASE_LIMIT) {
    return deny(4, '라우팅-분할', `Phase 수 ${phases.length} > 스킴 상한 ${PHASE_LIMIT} — 계획이 넘침: Milestone 분할, 재계획으로 회귀하라`,
      { planPath: planRel, phaseCount: phases.length }, { routing, failCounts, tally });
  }

  return { verdict: 'allow', planRel, planFiles, humanOverview, failCounts, tally, aiLines, routing };
}

module.exports = { evaluatePlan, readPlanPointer, stripBom, FAIL_LIMIT, PHASE_LIMIT, RECORD_HEADER };
