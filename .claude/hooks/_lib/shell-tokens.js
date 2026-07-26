// shell-tokens.js — stdin의 셸 명령 문자열을 토큰으로 분해(한 줄 = 한 토큰).
// python shlex.split 대체(MS Store 스텁 문제 — parse-payload.js 참조). 근사 구현:
// 단일/이중 따옴표·백슬래시 이스케이프 처리, 공백 분리.
//
// ⚠️ HR2 P05(2026-07-25): 셸 주석(#) 선처리 + 불균형 시 fail-closed로 전환.
// 옛 구현은 따옴표 불균형에 출력 0을 냈고(shlex ValueError 모사), supervisor-guard ②절의
// `[ ${#TOKENS[@]} -eq 0 ] && exit 0`이 그것을 **통과**로 해석해 실행 경계가 열렸다:
//   `git add . # it's fine`  → bash는 # 이후를 버리고 `git add .`를 정상 실행하는데
//                              주석 안의 짝 없는 아포스트로피 때문에 토큰이 0이 됐다.
// shell-policy.mjs와 **같은 결함을 공유하던 두 번째 지점**이라 같은 처방을 적용한다.
const chunks = [];

// POSIX상 주석은 *단어 시작 위치*의 #부터 줄 끝까지. 단어 중간의 #(a#b)은 주석이 아니다.
function stripComments(s) {
  let out = '';
  let quote = null;
  let esc = false;
  let atWordStart = true;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; atWordStart = false; continue; }
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"') esc = true;
      atWordStart = false;
      continue;
    }
    if (ch === '\\') { out += ch; esc = true; atWordStart = false; continue; }
    if (ch === "'" || ch === '"') { out += ch; quote = ch; atWordStart = false; continue; }
    if (ch === '#' && atWordStart) {
      while (i < s.length && s[i] !== '\n') i += 1;
      out += '\n';
      atWordStart = true;
      continue;
    }
    out += ch;
    atWordStart = /[\s;&|(]/.test(ch);
  }
  return out;
}

function tokenize(s, ignoreQuotes) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let esc = false;
  let has = false;
  for (const ch of s) {
    if (esc) { cur += ch; esc = false; has = true; continue; }
    if (quote === "'") {
      if (ch === "'") quote = null; else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\') esc = true;
      else cur += ch;
      continue;
    }
    if (ch === '\\') { esc = true; has = true; continue; }
    if (ch === "'" || ch === '"') {
      if (!ignoreQuotes) quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has) { tokens.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch; has = true;
  }
  if (has) tokens.push(cur);
  return { tokens, unbalanced: Boolean(quote) };
}

process.stdin.on('data', (c) => chunks.push(c)).on('end', () => {
  const cleaned = stripComments(Buffer.concat(chunks).toString('utf8'));
  const parsed = tokenize(cleaned, false);
  // 판정 불가여도 토큰 0을 내지 않는다 — 따옴표를 일반 문자로 보고 best-effort 재분해.
  const tokens = parsed.unbalanced ? tokenize(cleaned, true).tokens : parsed.tokens;
  for (const t of tokens) console.log(t);
});
