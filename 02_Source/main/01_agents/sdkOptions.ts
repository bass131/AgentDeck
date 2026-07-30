/**
 * sdkOptions.ts — Claude SDK query 옵션 조립 (RF1-followup P03: ClaudeCodeBackend에서 분리)
 *
 * 단일책임(SRP): AgentRunInput + run-level 의존(canUseTool/skillOverrides/mcpDenied/onUserDialog)을
 *   받아 SDK query() options 객체를 만든다. 단발(_runPump)·지속세션(_runPersistentPump) 펌프가
 *   *완전히 동일한* 옵션 블록을 각자 인라인으로 만들던 것을 한 함수로 합쳐(DRY) 드리프트를 막는다.
 *
 * 격리 원칙(ADR-003·CRITICAL): SDK 고유 형상(preset/append, settings/settingSources,
 *   supportedDialogKinds, refusal_fallback_prompt)은 이 파일 내부에만. 외부 계약/renderer엔
 *   누출 금지. (UC1-P02, ADR-032 ④: disallowedTools/'Workflow' 차단 계산은 이 파일에서
 *   제거됐다 — Workflow 상시 노출 + canUseTool 턴별 게이트[permissionCoordinator.ts]로 이동.)
 * 신뢰경계(CRITICAL): systemPrompt 내용을 로그에 출력하지 않는다. API 키는 SDK가 env에서 자동 처리.
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { buildQueryOptions } from './runArgs'
import { fallbackNotice } from './modelFallback'
import type { CanUseToolFn } from './permissionCoordinator'
import type { AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'

// ── cwd 신뢰경계 검증 ──────────────────────────────────────────────────────────

/**
 * req.workspaceRoot(renderer가 IPC로 넘긴, untrusted 경로 문자열)를 SDK cwd로 쓰기 전 검증한다
 * (LR1 Phase03 갈래B-2, trust-boundary). renderer는 폴더가 삭제·이동돼도 옛 경로를 그대로
 * 들고 있을 수 있어, main이 재검증 없이 SDK에 넘기면 resume이 엉뚱한 cwd-slug에서 세션을
 * 못 찾거나 오작동한다.
 *
 * 절대경로 + 실존 디렉토리일 때만 그대로 사용. 그 외(미전달/상대경로/존재하지 않는 경로/파일)는
 * process.cwd()로 폴백 — 유효 케이스·undefined 케이스는 현행과 동일(회귀 0).
 */
export function resolveSafeCwd(workspaceRoot?: string): string {
  if (!workspaceRoot || !isAbsolute(workspaceRoot)) return process.cwd()
  try {
    if (!existsSync(workspaceRoot)) return process.cwd()
    if (!statSync(workspaceRoot).isDirectory()) return process.cwd()
    return workspaceRoot
  } catch {
    return process.cwd()
  }
}

// ── Workflow 게이트 고지 ───────────────────────────────────────────────────────

/**
 * AgentDeck 고유의 Workflow 턴별 게이트 사실을 모델에 알린다.
 *
 * **남긴 이유**: 이 게이트는 모델이 알아낼 수 없는 *환경 사실*이다. AgentDeck은 SDK가 노출한
 * Workflow 도구를 canUseTool에서 `orchestration` 토글로 턴마다 하드 거부한다
 * (permissionCoordinator.ts의 ORCHESTRATION_TOOLS 게이트 — auto/bypass 조기허용보다 앞).
 * SDK의 Workflow 도구 설명에는 이 앱 토글이 없으므로, 고지가 없으면 모델은 OFF 턴에
 * 호출을 시도하고 사용자는 이유 모를 거부만 본다.
 *
 * **이전 버전에서 지운 것**: 원래 이 상수는 "오케스트레이터로 행동하라 / Task로 위임하라 /
 * 병렬로 여러 개 띄워라 / TodoWrite로 계획을 세워라 / 혼자 다 하지 말고 위임을 선호하라"까지
 * 담은 1,100자였다. 그 다섯 항목은 전부 **모델 능력 보정**이다 — 약한 모델이 위임을 안 하던
 * 시절의 보조바퀴이고, Opus 5는 지시 없이도 한다. 능력 보정 지시는 공짜가 아니다: 모든 세션의
 * systemPrompt에 상주하고, 모델의 자체 판단과 충돌하면 오히려 나쁜 쪽으로 끌어당긴다.
 * 남긴 건 "모델이 알 수 없는 것" 하나뿐이다.
 *
 * **상시 합성하는 이유**: held-open 세션(REPL)은 systemPrompt를 세션 생성 시 한 번 고정한다 —
 * 이후 턴에 토글이 켜져도 append를 바꿀 수 없다. 그래서 "지금 켜져 있다"가 아니라 "이런 턴에서만
 * 쓸 수 있다"는 조건부 서술로 항상 넣는다. 실제 허용/거부는 canUseTool이 턴마다 라이브 판정한다.
 *
 * CRITICAL(ADR-003): 이 상수는 어댑터 내부에만. 인터페이스·IPC·renderer에 누출 금지.
 */
export const WORKFLOW_GATE_NOTICE =
  'AgentDeck gates the Workflow tool per turn. It runs only on turns where the user has UltraCode ' +
  'toggled on (a persistent toggle) or asked for it in this message (mentioning "UltraCode" or ' +
  '"/workflows"); on any other turn the app denies the call before it starts, so do not attempt one. ' +
  'When the gate is open, each Workflow invocation still requires explicit user approval. ' +
  'The Task tool is not gated this way and is available on every turn.'

// ── 대화 연속성 안내 (resume disclaimer 억제) ───────────────────────────────────

/**
 * MEMORY_CONTINUITY_GUIDE (LR1 §8 · ADR-029 연장 — ADR-013 순수충실서 의도적 이탈, resume 세션 한정):
 * resume으로 이전 맥락이 복원된 대화에서 모델이 "과거 대화 기억 못 한다"는 거짓 disclaimer를 뱉지 않도록 하는 안내.
 * resumeSessionId가 있을 때만 systemPrompt.append에 합성한다. (컨텍스트 없는 내용 confabulation 방지 문구 포함)
 *
 * CRITICAL(ADR-003): 이 상수는 어댑터 내부에만. 인터페이스·IPC·renderer에 누출 금지.
 * orchestration 여부와 독립 — 비orchestration + resume 조합에도 반드시 합성돼야 한다.
 */
export const MEMORY_CONTINUITY_GUIDE = [
  '[대화 연속성]',
  '이 대화는 세션 재개(resume)로 이어지고 있습니다. 당신의 컨텍스트에 보이는 이전 메시지들은',
  '이 사용자와 실제로 나눈 대화이며, 앱이 재시작·날짜 변경을 넘어 자동으로 복원한 것입니다.',
  '그것을 당신의 기억으로 취급해 자연스럽게 이어가세요. 사용자가 "이전 대화 기억해?"처럼 물어도,',
  '컨텍스트에 이전 메시지가 있는 한 "과거 대화를 기억하지 못한다"고 답하지 마세요 — 실제로 기억하고',
  '있으니 그 내용에 근거해 답하면 됩니다. 단, 컨텍스트에 실제로 없는 내용은 지어내지 말고 모른다고 하세요.',
].join('\n')

// ── refusal-fallback 다이얼로그 핸들러 ─────────────────────────────────────────

/**
 * onUserDialog 콜백이 반환하는 SDK 다이얼로그 응답.
 */
type DialogResult =
  | { behavior: 'cancelled' }
  | { behavior: 'completed'; result: string }

/**
 * onUserDialog 콜백 시그니처.
 */
export type OnUserDialogFn = (
  dlg: { dialogKind: string; payload?: Record<string, unknown> }
) => Promise<DialogResult>

/**
 * makeRefusalFallbackHandler가 의존하는 normalizer 최소 형상(구조적 타입).
 * RunEventNormalizer를 직접 import하지 않아 결합을 느슨하게 유지한다.
 */
interface RefusalNormalizer {
  incrementPendingFallback(): void
  resetCurTextId(): void
  readonly curTextId: string | null
}

/**
 * refusal_fallback_prompt 자동 수락 onUserDialog 핸들러 생성 (Phase 32).
 *
 * SDK가 Fable 5 안전정책 거부 시 이 dialog를 발화한다. 선언하지 않으면 turn이 그냥 죽음.
 * 선언 + auto-accept('retry_fallback') → 폴백 모델로 재시도.
 *
 * 동작:
 *  - dialogKind !== 'refusal_fallback_prompt' → 'cancelled'(SDK 기본동작 적용).
 *  - refusal_fallback_prompt → pendingFallback 카운터 증가(system 경로 dedup) + model-fallback push
 *    (retractMessageId = 현재 텍스트 블록 id) + curTextId 리셋 + 'completed'/retry_fallback.
 *
 * 신뢰경계: payload.originalModel/fallbackModel/apiRefusalCategory string만 추출.
 *   raw payload 객체를 events/logs에 흘리지 않는다.
 *
 * @param normalizer pendingFallback 카운터 + curTextId 접근(RunEventNormalizer 호환).
 * @param push model-fallback 이벤트를 events 큐로 내보내는 콜백.
 */
export function makeRefusalFallbackHandler(
  normalizer: RefusalNormalizer,
  push: (event: AgentEvent) => void
): OnUserDialogFn {
  return async (dlg) => {
    // 미지원 dialogKind → 'cancelled'(SDK 계약: 기본동작 적용).
    if (dlg.dialogKind !== 'refusal_fallback_prompt') {
      return { behavior: 'cancelled' as const }
    }
    const p = dlg.payload ?? {}
    // dedup 카운터 증가: system 경로가 나중에 같은 폴백을 emit하면 카운터 감소만 함.
    normalizer.incrementPendingFallback()
    push({
      type: 'model-fallback',
      fromModel: typeof p['originalModel'] === 'string' ? p['originalModel'] : '',
      toModel: typeof p['fallbackModel'] === 'string' ? p['fallbackModel'] : '',
      text: fallbackNotice(p['originalModel'], p['fallbackModel'], p['apiRefusalCategory']),
      // 거부 직전 스트리밍 중이던 버블 id (재시도 답변이 새 버블로 시작되도록).
      // null이면 이미 열린 버블 없음(텍스트 출력 전 거부).
      retractMessageId: normalizer.curTextId,
    })
    normalizer.resetCurTextId()
    return { behavior: 'completed' as const, result: 'retry_fallback' }
  }
}

// ── SDK 옵션 조립 ──────────────────────────────────────────────────────────────

/**
 * Claude SDK query() options 객체를 조립한다.
 *
 * 단발·지속세션 펌프가 공용으로 호출한다(prompt만 호출부에서 따로 전달).
 *
 * @param req 실행 요청(model/effort/mode/workspaceRoot/systemPrompt/orchestration/resumeSessionId).
 * @param abortController SDK 스트림/도구 중단 신호.
 * @param canUseTool 권한 게이트 콜백(PermissionCoordinator.makeCanUseTool 산출).
 * @param skillOverrides disabled skill 'off' 맵 또는 null(미포함).
 * @param mcpDenied deniedMcpServers 목록 또는 null(미포함).
 * @param onUserDialog refusal-fallback 핸들러(makeRefusalFallbackHandler 산출).
 */
export function buildClaudeSdkOptions(params: {
  req: AgentRunInput
  abortController: AbortController
  canUseTool: CanUseToolFn
  skillOverrides: Record<string, 'off'> | null
  mcpDenied: { serverName: string }[] | null
  onUserDialog: OnUserDialogFn
}): Record<string, unknown> {
  const { req, abortController, canUseTool, skillOverrides, mcpDenied, onUserDialog } = params

  // SDK 옵션 빌드 (run-args의 allowlist 검증)
  const optionsPatch = buildQueryOptions({
    model: req.model,
    effort: req.effort,
    mode: req.mode
  })

  const permissionMode = optionsPatch.permissionMode ?? 'default'

  // systemPrompt append 합성. 여기 들어가는 건 **모델이 스스로 알 수 없는 것만**이다 —
  // 능력 보정 지시(위임하라·계획하라·병렬로 하라)는 WORKFLOW_GATE_NOTICE 주석에 적은 이유로 지웠다.
  //  - userAppend: 사용자가 전달한 커스텀 프롬프트(trim 후 빈 문자열이면 undefined).
  //  - WORKFLOW_GATE_NOTICE: 상시(orchestration 값과 무관) — held-open 세션은 append를 세션
  //    생성 시 한 번만 고정하므로 나중에 토글이 켜져도 못 넣는다.
  //  - MEMORY_CONTINUITY_GUIDE: resumeSessionId 있을 때만.
  const userAppend = req.systemPrompt?.trim() || undefined
  const appendStr = ([
    userAppend,
    WORKFLOW_GATE_NOTICE,
    req.resumeSessionId ? MEMORY_CONTINUITY_GUIDE : undefined,
  ].filter(Boolean) as string[]).join('\n\n') || undefined

  return {
    ...optionsPatch,
    // cwd (LR1 Phase03 갈래B-2, trust-boundary): workspaceRoot는 renderer가 넘긴 untrusted 경로 —
    // 실존 절대경로 디렉토리일 때만 사용, 아니면 process.cwd() 폴백(resolveSafeCwd).
    cwd: resolveSafeCwd(req.workspaceRoot),
    // env (GAP1 P04, session_state 옵트인): SDK query `env` 옵션은 서브프로세스 환경을
    // 통째로 "대체"한다(merge 아님, sdk.d.ts:1391-1409) — 반드시 process.env를 스프레드해
    // PATH/HOME/ANTHROPIC_API_KEY 등 상속 변수를 보존한 뒤 옵트인 플래그만 얹는다.
    // CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1은 probe②b 실측(2026-07-13)으로 확정된
    // session_state_changed 방출 조건 — 이 env 없이는 SDK가 이 신호를 아예 보내지 않는다.
    // 전역 오염 금지: process.env 자체는 건드리지 않고 이 옵션 객체 스코프에만 반영한다.
    env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' },
    abortController,
    // Phase 33 M5: includePartialMessages:true → stream_event 델타 수신 활성화.
    includePartialMessages: true,
    // GAP1 P05 (S-04, sdk.d.ts:1582): includeHookEvents:true → hook_started/hook_progress/
    // hook_response 시스템 메시지 방출 활성화(probe①도 이 옵션으로 캡처, 2026-07-13).
    // graceful degradation: 미지원 SDK 버전은 이 옵션 키를 조용히 무시한다(query 옵션
    // unknown key는 무해) — 별도 버전 sniff 불요. SessionStart/Setup 훅은 이 옵션과
    // 무관하게 상시 방출되므로(sdk.d.ts:1577) 훅이 도착하지 않는 세션에서도 소비측
    // (renderer 훅 콕핏)은 빈 타임라인으로 정상 degrade — 크래시/undefined 접근 없음.
    includeHookEvents: true,
    // systemPrompt: preset 'claude_code' + append. WORKFLOW_GATE_NOTICE가 상시 합성되므로
    // appendStr은 사실상 항상 존재하지만, 조건부 spread를 남겨 append:undefined를 SDK에 넘기지 않는다.
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(appendStr ? { append: appendStr } : {})
    },
    // disallowedTools 계산 없음(UC1-P02, ADR-032 ④): Workflow는 항상 모델에 노출된다.
    // 턴별 허용/거부는 canUseTool 게이트(permissionCoordinator.makeCanUseTool)가 라이브로 판정.
    // resume (Phase 1 맥락 복구, REPL_TRANSITION): resumeSessionId 있으면 세션 resume.
    ...(req.resumeSessionId ? { resume: req.resumeSessionId } : {}),
    // settings 핀 (canUseTool 발화 전제 + skillOverrides + deniedMcpServers):
    // 사용자 전역 settings.json의 permissions.defaultMode가 canUseTool 전에 선승인하지
    // 못하도록 composer가 고른 모드를 inline settings로 핀한다.
    settings: {
      permissions: { defaultMode: permissionMode },
      ...(skillOverrides ? { skillOverrides } : {}),
      ...(mcpDenied ? { deniedMcpServers: mcpDenied } : {})
    },
    settingSources: ['user', 'project', 'local'],
    canUseTool,
    // refusal-fallback 폴백 다이얼로그 자동 수락 (Phase 32).
    supportedDialogKinds: ['refusal_fallback_prompt'],
    onUserDialog,
  }
}
