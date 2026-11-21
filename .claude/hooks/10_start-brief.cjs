#!/usr/bin/env node
// 재개 프로토콜 (SessionStart) — 생존 문서 4종의 로드를 확인하고 work-pin과 현재 시각 한 줄을 주입한다(헌법 2조).
// 시각을 주입하는 이유는 무인 세션이 시계를 추정하지 않게 하려는 것이다.
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

// planPath가 _MilestonePreview.md면 같은 폴더의 NN_Phase_N.md를 병합해 확인한다.
// Phase 파일이 0개거나 하나라도 못 읽으면 계획 결손이다 (fail-closed).
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
lines.push('[재개 프로토콜] 생존 문서 4종 로드 확인 — 재개의 정본은 문서다 (헌법 2조).');
lines.push(`현재 시각: ${ts()} — 문서에 적는 모든 스탬프는 이 시각(과 이후 경과)을 기준으로 한다. 세션 자체의 시계 추정은 금지다.`);
if (source === 'resume') {
  lines.push('이 세션은 --resume(세션 이어붙이기)으로 기동됐다 — 문맥을 이어받았어도 통과 여부는 기억이 아니라 검증 기록 줄에서 다시 읽어라 (헌법 2조).');
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

// 병합 감시는 세션이 닫히면 사라진다(헌법 11조) — pin의 현재 goal 줄이 「병합 대기」와 PR 번호를 말하면 다시 걸라는 한 줄을 주입한다.
// 현재 goal 줄만 읽어 옛 PR 번호를 집지 않는다. compact는 같은 세션이라 감시가 살아 있으니 다시 걸라고 하지 않는다.
let mergeWatchPr = null;
if (!missing.length && source !== 'compact') {
  const goalLine = (pinText.match(/^- 현재 goal:.*$/m) || [''])[0];
  const m = goalLine.match(/병합\s*대기[\s,(·—–-]{0,6}PR\s*#?(\d{1,9})\b/) || goalLine.match(/PR\s*#?(\d{1,9})\s*(?:의\s*)?병합\s*대기/);
  if (m) {
    mergeWatchPr = Number(m[1]);
    lines.push(`[병합 감시] pin의 현재 goal 줄이 PR ${mergeWatchPr}의 병합 대기를 말한다(goal PR이든 마일스톤 PR이든 — 종류는 gh pr view로 읽는다). 메인 세션이고 이 PR의 감시가 이미 돌고 있지 않을 때만 백그라운드로 걸어라: node 99_Others/Dashboard/wait-merge.mjs ${mergeWatchPr} — 끝나면 gh pr view로 다시 읽는다. MERGED면 종결 기록을 하고, goal PR이면 같은 마일스톤의 다음 goal로 가고 마일스톤 PR이면 거기서 멈춘다(다음 마일스톤은 열지 않는다). CLOSED면 기록 없이 사용자에게 알린다. ERROR면 아직 열려 있을 때 한 번 다시 걸고, 또 ERROR면 사용자에게 알린다 (헌법 11조).`);
  }
}

log({ event: 'SessionStart', session: input.session_id || null, source, verdict, checks, ...(planFiles ? { planFiles } : {}), ...(mergeWatchPr ? { mergeWatchPr } : {}), reason: missing.length ? `생존 문서 결손: ${missing.join('·')}` : '생존 문서 4종 로드 확인 — work-pin 전문 재부착' });

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
}));
process.exit(0);
