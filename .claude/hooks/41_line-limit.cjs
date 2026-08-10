#!/usr/bin/env node
// 문서 250줄 상한 훅 (PostToolUse: Write|Edit|MultiEdit) — 산출 문서(.md) 실측.
// ⚠️ 목표 H로 실측된 구멍 — 프로브를 생략하지 않는다 (M01 Phase-Steps Phase 3 Step 3).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const LINE_LIMIT = 250; // 집행 사본 — 값의 소유자는 노션 01장 문서 길이 규칙 (200 목표 / 250 상한)

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'line-limit', ...entry }) + '\n');
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음이면 판정 불가 */ }
const file = (input.tool_input || {}).file_path || null;
if (!file || !/\.md$/i.test(file)) process.exit(0); // 산출 문서(.md)만 판정 대상

const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
let text = null;
try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { process.exit(0); /* 산출물이 없으면 판정 대상 아님 */ }
const parts = text.split(/\r?\n/);
if (parts[parts.length - 1] === '') parts.pop(); // 말미 개행은 줄로 세지 않는다 (wc -l과 동일)
const count = parts.length;

const base = { event: 'PostToolUse', session: input.session_id || null, tool: input.tool_name || null, file, lines: count, limit: LINE_LIMIT };

if (count > LINE_LIMIT) {
  const reason = `${file} — ${count}줄 > 상한 ${LINE_LIMIT}줄 (노션 01장 문서 길이 규칙). 하위 카테고리 폴더로 분화하라`;
  log({ ...base, verdict: '발화', reason });
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[250줄 훅] ${reason}` }));
  process.exit(0);
}
log({ ...base, verdict: '통과', reason: `${count}줄 ≤ 상한 ${LINE_LIMIT}줄` });
process.exit(0);
