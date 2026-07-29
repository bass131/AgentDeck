/**
 * sdkFixtures.ts — Claude Agent SDK 메시지 픽스처 공용 팩토리 (RS1 P02)
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────────
 *   `99_Others/tests/agents/**` 의 테스트들은 대부분 "직전 테스트를 복사해서 조금 고치는"
 *   방식으로 자라났다. 그 결과 `mkResult` / `mkInit` / `mkAssistantText` 같은 셋업 팩토리가
 *   수십 개 파일에 복제됐고, 복제본끼리 이미 서로 어긋나기 시작했다(실측: `uuid` 끝자리가
 *   `...000` vs `...001`, `session_id` 가 `sess-test` / `sess-p12` / `sess-lm1`,
 *   `apiKeySource` 가 `'none'` vs `'user'`). 셋업 중복은 프로덕션 코드 중복과 똑같이
 *   드리프트한다 — 이 파일은 그 공통분모를 한 곳으로 모은다.
 *
 * ── 설계 원칙: "기본값 + patch", 통일 금지 ────────────────────────────────────────
 *   각 팩토리는 **가장 흔한 복제본의 형상**을 기본값으로 두고, 파일별 차이는 호출부가
 *   `patch` 인자로 되돌린다. 드리프트를 발견했다고 해서 조용히 "통일"하지 않는다 —
 *   파일별 값 차이가 그 테스트의 의도일 수 있기 때문이다(예: `apiKeySource: 'user'` 는
 *   API 키가 사용자 설정에서 왔음을 전제한 시나리오). patch 로 보존하면 그 차이가
 *   *지워지는* 대신 *한 줄로 드러난다* — 나중에 통일 여부를 따로 판단할 수 있다.
 *
 * ── 신뢰 경계 ────────────────────────────────────────────────────────────────
 *   여기 있는 건 전부 순수 리터럴이다. 실 SDK 호출 0 · 네트워크 0 · 시간/랜덤 0(결정론).
 *   `uuid` 도 고정 문자열이라 랜덤 소스를 타지 않는다.
 *
 * ── 타입에 대해 ──────────────────────────────────────────────────────────────
 *   반환값은 결국 `QueryFn` 이 `AsyncIterable<unknown>` 으로 흘려보내고
 *   `mapClaudeStreamLine(obj: unknown)` 이 받는다 — 즉 소비 지점이 전부 `unknown` 이라
 *   리터럴 타입을 좁게 유지할 실익이 없다. 대신 제네릭 patch 로 호출부가 넘긴 키가
 *   반환 타입에 그대로 남게 해(교차 타입) IDE 자동완성이 죽지 않게 했다.
 */

/** SDK 메시지의 `uuid` 필드 형상(실 SDK 타입과 같은 템플릿 리터럴). */
export type FixtureUuid = `${string}-${string}-${string}-${string}-${string}`

/**
 * 픽스처에서 쓰는 모델 ID.
 *
 * ⚠️ 이 리터럴은 **엔진이 실제로 뱉는 문자열을 흉내 낸 테스트 데이터**다 — AgentDeck 가
 * 사용자에게 노출하는 모델 ID 규범(날짜 접미사 금지)과는 층이 다르다. 실 SDK 응답에
 * 날짜 접미사가 붙어 오던 시절의 형상을 27개 파일이 그대로 복제해 두었고, 그 문자열은
 * 일부 테스트에서 `modelUsage` 키로 참조되므로 **값을 바꾸면 그 테스트들이 깨진다**.
 * 여기 상수로 모아둔 이유는 나중에 한 곳에서 갱신할 수 있게 하기 위함이다.
 */
export const FIXTURE_MODEL_ID = 'claude-haiku-4-5-20251001'

/** patch 인자의 형태 — 기본 형상에 없는 키(SDK 버전별 추가 필드)도 얹을 수 있게 열어 둔다. */
export type FixturePatch = Record<string, unknown>

// ── system/init ──────────────────────────────────────────────────────────────

/**
 * `system`/`init` 메시지. 어댑터는 여기 실린 `session_id` 를 중립 `session` 이벤트로
 * 표면화하고, 그게 재시작 후 resume 의 토대가 된다.
 *
 * 기본값은 복제본 중 **최소 형상**(p09 계열·persistent-pump 관례)이다. 더 많은 필드를
 * 실었던 복제본(claude-backend-sdk 계열의 `betas`/`skills`/`plugins` 등)은 그 키들을
 * patch 로 다시 얹는다 — 최소 형상을 기본으로 잡아야 "기본값이 조용히 필드를 늘려
 * 어댑터 분기를 바꾸는" 사고가 안 난다.
 */
export function mkInit<P extends FixturePatch = FixturePatch>(patch?: P) {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: 'sess-test',
    apiKeySource: 'none',
    cwd: '/tmp',
    tools: [] as string[],
    mcp_servers: [] as unknown[],
    model: FIXTURE_MODEL_ID,
    permissionMode: 'default',
    slash_commands: [] as string[],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as FixtureUuid,
    ...(patch ?? ({} as P)),
  }
}

// ── result(done) ─────────────────────────────────────────────────────────────

/**
 * `result` 메시지(턴 종료 = 중립 `done` 이벤트의 원천). 단발·지속세션 공통.
 *
 * 기본값은 "턴 경계만 확인하는" 가벼운 복제본(usage 10/5, cost 0)이다. 컨텍스트 창이나
 * 토큰 회계를 검증하는 테스트는 `usage` / `modelUsage` / `total_cost_usd` 를 patch 한다.
 */
export function mkResult<P extends FixturePatch = FixturePatch>(patch?: P) {
  return {
    type: 'result' as const,
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'turn',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {} as Record<string, unknown>,
    permission_denials: [] as unknown[],
    errors: [] as unknown[],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

// ── assistant(text) ──────────────────────────────────────────────────────────

/**
 * `assistant` 메시지(text 블록 1개). `patch` 는 **바깥 봉투**(uuid·session_id 등)에
 * 얹히고, 메시지 본문을 바꾸려면 `patch.message` 를 통째로 넘긴다.
 */
export function mkAssistantText<P extends FixturePatch = FixturePatch>(text: string, patch?: P) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }] as unknown[],
      model: FIXTURE_MODEL_ID,
      stop_reason: null as string | null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null as string | null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

// ── assistant(tool_use) / user(tool_result) ──────────────────────────────────

/**
 * `assistant` 메시지(tool_use 블록 1개) — 도구 호출 착수를 모델링한다.
 * 어댑터는 이걸 중립 `tool_call` 이벤트로 정규화한다.
 */
export function mkToolUse<P extends FixturePatch = FixturePatch>(
  id: string,
  name: string,
  input: unknown,
  patch?: P
) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${id}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id, name, input }] as unknown[],
      model: FIXTURE_MODEL_ID,
      stop_reason: 'tool_use' as string | null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null as string | null,
    uuid: `uuid-asst-${id}` as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

/**
 * `user` 메시지(tool_result 블록 1개) — 도구 실행 결과. 어댑터는 중립 `tool_result` 로
 * 정규화한다. 실패 케이스는 `patch` 가 아니라 `content` 쪽 `is_error` 를 쓰던 복제본이
 * 있어, 그 형상이 필요하면 `patch.message` 로 통째 교체한다.
 */
export function mkToolResult<P extends FixturePatch = FixturePatch>(
  id: string,
  content: unknown,
  patch?: P
) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: id, content }] as unknown[],
    },
    parent_tool_use_id: null as string | null,
    uuid: `uuid-user-${id}` as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}
