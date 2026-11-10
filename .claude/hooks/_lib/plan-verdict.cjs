// 계획 판정부 공용 모듈 (M03 Phase 2 Step 5 · 계획 승인 문답 안건 5 채택).
//
// 왜 모듈인가: 같은 판정이 두 자리에서 발화한다 — 스폰 직전(`20_plan-gate.cjs`)과 편집 직전
// (`31_edit-plan-gate.cjs`)이다. 판정 글자를 두 곳에 베껴 두면 한쪽만 고쳐지는 날이 온다.
// 설계 원 기록: 00_Documents/05_Design_Notes/ 아래 06_실패-카운터 · 07_주도권-게이트 · 10_분업-라우팅-규격.
//
// 판정 넷은 번호를 갖는다 — ①(계획 규격)·②(실패 카운터)·③(결정 대장 주도권)·④(라우팅).
// 어디까지를 거부로 쓸지는 호출부가 정한다. 스폰 자리는 넷 전부를 거부로 쓰고, 편집 자리는 ①②③만
// 거부로 쓰고 ④는 로그 필드로만 남긴다 (④는 분업 규격이라 편집 한 건의 자격이 아니다).
// 반환은 첫 거부 하나다 — 뒤 판정은 앞 판정의 결과(병합 텍스트·절 분해)에 올라서므로 단락 평가다.
'use strict';
const fs = require('fs');
const path = require('path');

const FAIL_LIMIT = 3;  // 집행 사본 — 값의 소유자는 노션 02. Project Rules 검증 4
const PHASE_LIMIT = 8; // 집행 사본 — 값의 소유자는 노션 01장 「각 구역의 역할」 01_Milestones 해설
// 「검증 기록」 절 헤더의 허용 형태 (M02 Phase 3 Step 4, Backlog 12번) — 제목 단독 줄만이다.
// 종전 접두사 판독(`/^검증 기록/`)은 「검증 기록은 아직 없음」 같은 산문 줄도 절 헤더로 인정해,
// 위장 헤더 한 줄이면 절 실존 검사가 우회되고 판정 ②의 집계 시작점도 엉뚱한 자리로 옮겨 갔다.
const RECORD_HEADER = /^검증 기록\s*$/;

// 판정 대상 계획 문서 — gate-config.json의 planPath 포인터 (프로브는 포인터만 바꾼다).
// fail-closed (M03 Phase 4 Step 11 · M03 Backlog 20): 종전에는 포인터가 없거나 깨졌거나 planPath가 비면
// 종결된 M01 계획을 기본값으로 판정해 통과시켰고, planPath가 문자열이 아니면 경로 연산이 터져 호출부의
// 내부 오류 허용으로 빠졌다. 이제 기본값은 없다 — 결손이면 { planRel: null, rule, problem }을 돌려준다.
function readPlanPointer(root) {
  const missing = (problem) => ({ planRel: null, rule: '계획-포인터-결손', problem });
  let raw;
  try { raw = fs.readFileSync(path.join(root, '98_Management', '01_GateState', 'gate-config.json'), 'utf8'); }
  catch (e) { return missing('gate-config.json을 읽을 수 없다'); }
  let c;
  try { c = JSON.parse(raw); } catch (e) { return missing('gate-config.json이 JSON으로 읽히지 않는다'); }
  if (!c || typeof c !== 'object' || c.planPath === undefined || c.planPath === null) return missing('gate-config.json에 planPath 키가 없다');
  if (typeof c.planPath !== 'string') {
    return { planRel: null, rule: '계획-포인터-형식', problem: `planPath가 문자열이 아니다(${Array.isArray(c.planPath) ? 'array' : typeof c.planPath})` };
  }
  if (!c.planPath.trim()) return missing('gate-config.json의 planPath가 비어 있다');
  return { planRel: c.planPath, rule: null, problem: null };
}

// 반환 계약 —
//   거부: { verdict:'deny', judgment:1|2|3|4, rule, reason, evidence, planRel, planFiles, routing? }
//   통과: { verdict:'allow', planRel, planFiles, humanOverview, failCounts, tally, aiLines, routing }
// planFiles는 파일 구획일 때만 배열이고 단일 파일 planPath에서는 null이다 (하위 호환).
// 포인터 결손은 판정 ①의 거부다 — planRel은 null이다 (판정할 계획이 없다).
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
  const planAbs = path.isAbsolute(planRel) ? planRel : path.join(root, planRel);

  let text = null;
  let planFiles = null; // 파일 구획일 때 병합된 파일 목록 — 판정 evidence에 실린다
  let preview = null;   // 파일 구획일 때 Preview 원문 — 판정 ①의 사람용 개요 검사가 이것만 본다
  const deny = (judgment, rule, reason, evidence, extra) =>
    Object.assign({ verdict: 'deny', judgment, rule, reason, evidence, planRel, planFiles }, extra || {});

  // ---- 계획 텍스트 적재 — 단일 파일 또는 파일 구획(다중 파일) ---------------
  // planPath가 _MilestonePreview.md를 가리키면 같은 폴더의 NN_Phase_N.md를 번호순으로
  // 병합해 단일 텍스트로 만들고, 아래 판정 4종은 그 병합 텍스트에 적용한다. 예외 하나 —
  // 판정 ①의 사람용 개요 검사는 병합 텍스트가 아니라 Preview 원문(preview)만 본다.
  // Phase 파일이 0개면 병합 결과에 Phase 구획이 없으므로 기존 반려가 그대로 나간다 (fail-closed).
  if (path.basename(planAbs) === '_MilestonePreview.md') {
    try { preview = fs.readFileSync(planAbs, 'utf8'); } catch (e) { /* 아래에서 반려 */ }
    if (preview === null) {
      return deny(1, '계획-문서-부재', `계획 문서를 읽을 수 없다: ${planRel} — 계획 없는 스폰은 반려 (fail-closed)`, { planPath: planRel });
    }
    const dir = path.dirname(planAbs);
    const phaseNum = n => Number(n.match(/_Phase_(\d+)\.md$/)[1]);
    let phaseNames = [];
    try {
      phaseNames = fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).sort((a, b) => phaseNum(a) - phaseNum(b));
    } catch (e) { /* 목록 실패 = Phase 파일 0개 — 아래 규격 판정이 반려 */ }
    const parts = [preview];
    for (const n of phaseNames) {
      try { parts.push(fs.readFileSync(path.join(dir, n), 'utf8')); }
      catch (e) {
        return deny(1, '계획-문서-부재', `Phase 파일을 읽을 수 없다: ${n} — 결손 계획은 반려 (fail-closed)`, { planPath: planRel, file: n });
      }
    }
    text = parts.join('\n');
    planFiles = [path.basename(planAbs), ...phaseNames];
  } else {
    try { text = fs.readFileSync(planAbs, 'utf8'); } catch (e) { /* 아래에서 반려 */ }
    if (text === null) {
      return deny(1, '계획-문서-부재', `계획 문서를 읽을 수 없다: ${planRel} — 계획 없는 스폰은 반려 (fail-closed)`, { planPath: planRel });
    }
  }

  // ---- 절 분해 ------------------------------------------------------------
  const sections = []; // { header, body:[] }
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

  // ---- 판정 ① 계획 문서 검증 통과 — 기계 집행 범위 = 계획 템플릿 규격 실측 ----
  // (00_Documents/02_Rules 템플릿: 필수 절 부재·태그 표기 부재 = 검증 불통과. 사람 검증은 게이트 밖.)
  const hasOverview = sections.some(s => /^##\s+(개요|목표)(\s|$)/.test(s.header)); // \b는 한글 뒤에서 불성립 — 사용 금지
  if (!hasOverview) return deny(1, '검증-미통과', '필수 절 부재: 개요(목표) 절이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
  // 파일 구획 전용 — Preview 원문에 「사람용 개요」 절이 있는가. Phase 파일의 동명 절이 결손을 못 가리게
  // 병합 텍스트가 아니라 preview만 본다. 단일 파일(M01 하위 호환)은 검사하지 않는다 (preview === null).
  // 근거: [USER] 2026-08-08 블랙박스 금지 — 계획의 사용자 판정 표면 필수. \b는 한글 뒤에서 불성립 — 사용 금지
  const humanOverview = preview === null ? null : /^##\s+사람용 개요(\s|$)/m.test(preview);
  if (humanOverview === false) return deny(1, '검증-미통과', '필수 절 부재: 사람용 개요 절이 없다 — 사용자 판정 표면 결손, 블랙박스 방지 (fail-closed)', { planPath: planRel });
  if (phases.length === 0) return deny(1, '검증-미통과', 'Phase 구획이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
  if (malformedPhase) return deny(1, '검증-미통과', `도메인 태그·의존성 표기 부재: ${malformedPhase} — 표기 없는 계획은 반려 (노션 02장 분업 2)`, { planPath: planRel });
  const noRecord = phases.filter(p => !p.body.some(l => RECORD_HEADER.test(l)));
  if (noRecord.length > 0) return deny(1, '검증-미통과', `검증 기록 절 부재: Phase ${noRecord.map(p => p.num).join(', ')} — 기록 줄 없는 검증은 무효 (fail-closed)`, { planPath: planRel });

  // ---- 판정 ② 실패 카운터 — 「검증 기록」 절 내부에서, 마지막 USER-INPUT 줄 이후의 FAIL만 센다 ----
  // 집계 범위는 Phase 본문 전체가 아니라 검증 기록 절만이다 — 02장 검증 4 원문("검증 결과는
  // 기록 줄로만 유효")의 집행 사본 정합. DoD·Steps의 FAIL 서술은 세지 않는다 (결정 대장 [USER] 2026-08-01).
  const failCounts = {};
  for (const p of phases) {
    let count = 0, inRecord = false;
    for (const l of p.body) {
      if (RECORD_HEADER.test(l)) { inRecord = true; continue; } // 절 헤더 계약은 위와 같다 (제목 단독 줄)
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

  // ---- 판정 ③ 결정 대장 — 출처 태그 계산 (대장 부재 = 반려) ----
  const ledgerSec = sections.find(s => /^##\s+결정 대장/.test(s.header));
  if (!ledgerSec) return deny(3, '대장-부재', '결정 대장 절이 없다 — 대장 부재 = 계획 반려 (노션 02장 순서 4, fail-closed)', { planPath: planRel });
  const tally = { USER: 0, 'USER·위임': 0, AI: 0, 'AI·비가역': 0 };
  const aiLines = [];
  for (const l of ledgerSec.body) {
    const m = l.match(/^-\s*\[(USER·위임|USER|AI·비가역|AI)\]/);
    if (!m) continue;
    tally[m[1]]++;
    if (m[1] === 'AI' || m[1] === 'AI·비가역') aiLines.push(l.slice(0, 80));
  }
  const userSide = tally.USER + tally['USER·위임']; // 위임 자체가 사용자의 결정 — USER 쪽으로 센다
  if (tally['AI·비가역'] >= 1) {
    return deny(3, '주도권-즉시발동', `[AI·비가역] ${tally['AI·비가역']}건 — 개수 무관 즉시 발동. 비가역은 위임으로 못 덮는다. 선택지형 문답으로 분기하라`, { planPath: planRel, tally, aiLines });
  }
  if (tally.AI > userSide) {
    return deny(3, '주도권-문답분기', `[AI] ${tally.AI} > [USER] ${userSide} — 주도권 게이트 발동. 선택지형 문답으로 분기해 [AI] 줄의 답을 받고, 태그를 [USER]로 전환(기준점 이동 문법)한 뒤 재시도하라`, { planPath: planRel, tally, aiLines });
  }

  // ---- 판정 ④ 라우팅 표 적용 — 계획 문서의 구조 신호를 세는 기계 연산 ----
  // 라우팅은 거부 여부와 무관하게 끝까지 계산한다 — 편집 자리는 ④를 거부로 쓰지 않고 로그로만 남긴다.
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

module.exports = { evaluatePlan, readPlanPointer, FAIL_LIMIT, PHASE_LIMIT, RECORD_HEADER };
