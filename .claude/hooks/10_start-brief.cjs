#!/usr/bin/env node
// 재개 프로토콜 (SessionStart) — 세션 기동 시 생존 문서 4종의 로드를 확인하고 work-pin을 재부착한다.
// 기동 시 현재 시각 한 줄을 함께 주입한다 — 무인 세션의 시계 추정 제거 (M02 결정 대장 [USER] 2026-08-04).
// 생존 문서 4종: Phase-Steps · work-pin · 결정 대장 · 검증 기록 (뒤 둘은 Phase-Steps 안의 절).
// 재개는 문서로만 한다 — --resume 감지 시 경고를 주입한다 (헌법 금지 사항, SessionStart는 차단 불가).
// 설계 원 기록: AgentDeck 01_Documents/08_Clear-게이트.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'start-brief', ...entry }) + '\n');
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음도 판정은 진행 */ }
const source = input.source || null;

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* 포인터 부재는 결손으로 집계 */ }
const planPath = cfg.planPath ? path.resolve(ROOT, cfg.planPath) : null;
const pinPath = cfg.workPinPath ? path.resolve(ROOT, cfg.workPinPath) : null;

function readOrNull(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
let planText = planPath ? readOrNull(planPath) : null;
const pinText = pinPath ? readOrNull(pinPath) : null;

// 파일 구획: planPath가 _MilestonePreview.md를 가리키면 같은 폴더의 NN_Phase_N.md 실존까지
// 확인 범위에 넣고, 병합 텍스트로 아래 4종 확인을 적용한다. Phase 파일이 0개거나 하나라도
// 판독 불가면 계획 결손으로 집계한다 (fail-closed).
let planFiles = null;
if (planText !== null && planPath && path.basename(planPath) === '_MilestonePreview.md') {
  const dir = path.dirname(planPath);
  const phaseNum = n => Number(n.match(/_Phase_(\d+)\.md$/)[1]);
  let phaseNames = [];
  try {
    phaseNames = fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).sort((a, b) => phaseNum(a) - phaseNum(b));
  } catch (e) { /* 목록 실패 = Phase 파일 0개 */ }
  planFiles = [path.basename(planPath), ...phaseNames];
  if (phaseNames.length === 0) planText = null;
  else {
    const parts = [planText];
    for (const n of phaseNames) {
      const t = readOrNull(path.join(dir, n));
      if (t === null) { planText = null; break; }
      parts.push(t);
    }
    if (planText !== null) planText = parts.join('\n');
  }
}

const checks = {
  'Phase-Steps': !!planText,
  '결정-대장': !!planText && /^## 결정 대장/m.test(planText),
  '검증-기록': !!planText && (planText.match(/^검증 기록$/gm) || []).length >= 1,
  'work-pin': !!pinText && /^## 좌표/m.test(pinText) && /^## 마감 요약/m.test(pinText),
};
const missing = Object.keys(checks).filter(k => !checks[k]);
const verdict = missing.length ? '결손' : 'allow';

const lines = [];
lines.push('[재개 프로토콜] 생존 문서 4종 로드 확인 — 재개는 문서로만 한다 (--resume 금지, 헌법 금지 사항).');
lines.push(`현재 시각: ${ts()} — 문서에 적는 모든 스탬프는 이 시각(과 이후 경과)을 기준으로 한다. 세션 자체의 시계 추정은 금지다.`);
if (source === 'resume') {
  lines.push('⚠️ 이 세션은 --resume(세션 이어붙이기)으로 기동됐다 — 헌법 금지 사항 위반. Context 계승은 Clear 게이트의 취지(확증편향의 시간축 분리)와 정반대다. 세션을 버리고 문서로 재개하라.');
}
lines.push(`① Phase-Steps: ${cfg.planPath || '(포인터 부재)'}${planFiles ? ` (파일 구획 — Phase 파일 ${planFiles.length - 1}개 병합)` : ''} — ${checks['Phase-Steps'] ? '실존' : '결손'}`);
lines.push(`② 결정 대장: ${checks['결정-대장'] ? '절 실존 (Phase-Steps 내)' : '결손'}`);
lines.push(`③ 검증 기록: ${checks['검증-기록'] ? '절 실존 (Phase-Steps 내)' : '결손'}`);
lines.push(`④ work-pin: ${cfg.workPinPath || '(포인터 부재)'} — ${checks['work-pin'] ? '실존' : '결손'}`);
if (missing.length) {
  lines.push(`⚠️ 결손 ${missing.length}건(${missing.join('·')}) — 재개 부적격. 작업 전진 전에 사람에게 보고하라 (fail-closed).`);
} else {
  lines.push('', '--- work-pin 전문 ---', pinText.trim(), '---');
  lines.push('재개 절차: 위 좌표를 기점으로 Phase-Steps의 현재 Phase 절(목표·Steps·DoD·검증 기록)을 읽고 재개하라. 검증 기록 줄 밖의 통과 주장은 무효다.');
}

log({ event: 'SessionStart', session: input.session_id || null, source, verdict, checks, ...(planFiles ? { planFiles } : {}), reason: missing.length ? `생존 문서 결손: ${missing.join('·')}` : '생존 문서 4종 로드 확인 — work-pin 전문 재부착' });

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
}));
process.exit(0);
