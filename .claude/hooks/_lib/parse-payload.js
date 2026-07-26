// parse-payload.js — hook stdin JSON → shell 할당문 출력 (hook-common.sh parse_hook_payload용).
// 2026-07-04: python이 이 머신에서 MS Store 스텁(실체 없음)이라 전 hook이 무력화됐던 것을
// 실측 발견 → node(Electron 프로젝트 필수 의존)로 전환. 출력은 shlex.quote 동등 단일따옴표 인용.
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c)).on('end', () => {
  let d;
  try {
    d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return; // 파싱 실패 = 출력 0 (호출측이 빈 출력을 실패 신호로 읽는다)
  }
  // ⚠️ 객체가 아니면 payload가 아니다 (HR2 P05 reviewer 🟡-1).
  // `JSON.parse("5")`·`"문자열"`·`[]`는 파싱에 성공하지만 tool_input이 없어 5줄이 전부
  // 빈 값으로 나갔고, 호출측은 그걸 **파싱 성공**으로 읽어 TOOL_NAME이 빈 채 진행했다
  // — 봉인 검사가 통째로 건너뛰어졌다. `null`만 우연히 TypeError로 걸렸던 것뿐이다.
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return;
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
