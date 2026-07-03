// parse-payload.js — hook stdin JSON → shell 할당문 출력 (hook-common.sh parse_hook_payload용).
// 2026-07-04: python이 이 머신에서 MS Store 스텁(실체 없음)이라 전 hook이 무력화됐던 것을
// 실측 발견 → node(Electron 프로젝트 필수 의존)로 전환. 출력은 shlex.quote 동등 단일따옴표 인용.
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c)).on('end', () => {
  let d;
  try {
    d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return; // 파싱 실패 = 출력 0 (호출측 eval '' — 기존 semantics 유지)
  }
  const ti = d.tool_input || {};
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return "'" + s.replace(/'/g, "'\\''") + "'";
  };
  const out = [
    ['TOOL_NAME', d.tool_name],
    ['HOOK_EVENT', d.hook_event_name],
    ['TOOL_INPUT_COMMAND', ti.command],
    ['TOOL_INPUT_FILE_PATH', ti.file_path],
    ['AGENT_TYPE', d.agent_type],
  ];
  console.log(out.map(([k, v]) => k + '=' + q(v)).join('\n'));
});
