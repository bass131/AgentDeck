import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { buildQueryOptions } from './runArgs'
import { fallbackNotice } from './modelFallback'
import type { CanUseToolFn } from './permissionCoordinator'
import type { AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'

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

export const WORKFLOW_GATE_NOTICE =
  'AgentDeck gates the Workflow tool per turn. It runs only on turns where the user has UltraCode ' +
  'toggled on (a persistent toggle) or asked for it in this message (mentioning "UltraCode" or ' +
  '"/workflows"); on any other turn the app denies the call before it starts, so do not attempt one. ' +
  'When the gate is open, each Workflow invocation still requires explicit user approval. ' +
  'The Task tool is not gated this way and is available on every turn.'

export const MEMORY_CONTINUITY_GUIDE = [
  '[대화 연속성]',
  '이 대화는 세션 재개(resume)로 이어지고 있습니다. 당신의 컨텍스트에 보이는 이전 메시지들은',
  '이 사용자와 실제로 나눈 대화이며, 앱이 재시작·날짜 변경을 넘어 자동으로 복원한 것입니다.',
  '그것을 당신의 기억으로 취급해 자연스럽게 이어가세요. 사용자가 "이전 대화 기억해?"처럼 물어도,',
  '컨텍스트에 이전 메시지가 있는 한 "과거 대화를 기억하지 못한다"고 답하지 마세요 — 실제로 기억하고',
  '있으니 그 내용에 근거해 답하면 됩니다. 단, 컨텍스트에 실제로 없는 내용은 지어내지 말고 모른다고 하세요.',
].join('\n')

type DialogResult =
  | { behavior: 'cancelled' }
  | { behavior: 'completed'; result: string }

export type OnUserDialogFn = (
  dlg: { dialogKind: string; payload?: Record<string, unknown> }
) => Promise<DialogResult>

interface RefusalNormalizer {
  incrementPendingFallback(): void
  resetCurTextId(): void
  readonly curTextId: string | null
}

export function makeRefusalFallbackHandler(
  normalizer: RefusalNormalizer,
  push: (event: AgentEvent) => void
): OnUserDialogFn {
  return async (dlg) => {
    if (dlg.dialogKind !== 'refusal_fallback_prompt') {
      return { behavior: 'cancelled' as const }
    }
    const p = dlg.payload ?? {}
    normalizer.incrementPendingFallback()
    push({
      type: 'model-fallback',
      fromModel: typeof p['originalModel'] === 'string' ? p['originalModel'] : '',
      toModel: typeof p['fallbackModel'] === 'string' ? p['fallbackModel'] : '',
      text: fallbackNotice(p['originalModel'], p['fallbackModel'], p['apiRefusalCategory']),
      retractMessageId: normalizer.curTextId,
    })
    normalizer.resetCurTextId()
    return { behavior: 'completed' as const, result: 'retry_fallback' }
  }
}

export function buildClaudeSdkOptions(params: {
  req: AgentRunInput
  abortController: AbortController
  canUseTool: CanUseToolFn
  skillOverrides: Record<string, 'off'> | null
  mcpDenied: { serverName: string }[] | null
  onUserDialog: OnUserDialogFn
}): Record<string, unknown> {
  const { req, abortController, canUseTool, skillOverrides, mcpDenied, onUserDialog } = params

  const optionsPatch = buildQueryOptions({
    model: req.model,
    effort: req.effort,
    mode: req.mode
  })

  const permissionMode = optionsPatch.permissionMode ?? 'default'

  const userAppend = req.systemPrompt?.trim() || undefined
  const appendStr = ([
    userAppend,
    WORKFLOW_GATE_NOTICE,
    req.resumeSessionId ? MEMORY_CONTINUITY_GUIDE : undefined,
  ].filter(Boolean) as string[]).join('\n\n') || undefined

  return {
    ...optionsPatch,
    cwd: resolveSafeCwd(req.workspaceRoot),
    env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' },
    abortController,
    includePartialMessages: true,
    includeHookEvents: true,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(appendStr ? { append: appendStr } : {})
    },
    ...(req.resumeSessionId ? { resume: req.resumeSessionId } : {}),
    settings: {
      permissions: { defaultMode: permissionMode },
      ...(skillOverrides ? { skillOverrides } : {}),
      ...(mcpDenied ? { deniedMcpServers: mcpDenied } : {})
    },
    settingSources: ['user', 'project', 'local'],
    canUseTool,
    supportedDialogKinds: ['refusal_fallback_prompt'],
    onUserDialog,
  }
}
