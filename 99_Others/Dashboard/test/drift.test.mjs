import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { FAIL_RE, LEDGER_HEADER, LEDGER_LINE, PHASE_ANY_RE, PHASE_FULL_RE, RECORD_HEADER, RULES, SECTION_RE, USER_INPUT_RE } from '../lib/markdown.mjs';

// 결정 대장·검증 기록 판정식이 실제 plan-gate 훅 원문과 같은지 확인한다. 저장소가 없으면 건너뛴다.
test('judgement regexes are the same literals as .claude/hooks/20_plan-gate.cjs', async t => {
  let repoPath;
  try { ({ repoPath } = await loadConfig()); } catch { t.skip('config.local.json이 없어 건너뛰어요.'); return; }
  const hook = path.join(repoPath, '.claude', 'hooks', '20_plan-gate.cjs');
  if (!existsSync(hook)) { t.skip('plan-gate 훅이 없어 건너뛰어요.'); return; }
  // 판정부는 _lib/plan-verdict.cjs에 있다. 훅 본체와 판정 모듈을 함께 본다.
  const verdictLib = path.join(repoPath, '.claude', 'hooks', '_lib', 'plan-verdict.cjs');
  const source = readFileSync(hook, 'utf8') + '\n' + (existsSync(verdictLib) ? readFileSync(verdictLib, 'utf8') : '');
  for (const re of [SECTION_RE, PHASE_ANY_RE, PHASE_FULL_RE, RECORD_HEADER, USER_INPUT_RE, FAIL_RE, LEDGER_HEADER, LEDGER_LINE]) {
    assert.ok(source.includes('/' + re.source + '/'), `훅 원문에 /${re.source}/ 가 없어요.`);
  }
  assert.match(source, new RegExp(`FAIL_LIMIT\\s*=\\s*${RULES.failLimit}\\b`));
});
