// shell-tokens.js — stdin의 셸 명령 문자열을 토큰으로 분해(한 줄 = 한 토큰).
// python shlex.split 대체(MS Store 스텁 문제 — parse-payload.js 참조). 근사 구현:
// 단일/이중 따옴표·백슬래시 이스케이프 처리, 공백 분리. 따옴표 불균형 = 출력 0
// (shlex ValueError와 동등 — 호출측은 토큰 0개면 exit 0).
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c)).on('end', () => {
  const s = Buffer.concat(chunks).toString('utf8');
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
    if (ch === "'" || ch === '"') { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (has) { tokens.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch; has = true;
  }
  if (quote) return; // 불균형 따옴표 — 판정 불가, 토큰 0
  if (has) tokens.push(cur);
  for (const t of tokens) console.log(t);
});
