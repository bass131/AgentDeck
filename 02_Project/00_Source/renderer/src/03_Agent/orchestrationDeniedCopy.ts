import type { OrchestrationDeniedReason } from '../../../shared/agentEvents'

export const DEFAULT_ORCHESTRATION_DENIED_COPY =
  'UltraCode 오케스트레이션 호출이 차단됐어요 — 컴포저의 UltraCode 토글을 확인해 주세요.'

export const ORCHESTRATION_DENIED_COPY: Record<OrchestrationDeniedReason, string> = {
  'orchestration-off':
    'UltraCode가 꺼져 있어 오케스트레이션 호출이 차단됐어요 — 컴포저의 UltraCode 토글을 켜면 사용할 수 있어요.',
}

export function copyForOrchestrationDenied(reason: string): string {
  return (ORCHESTRATION_DENIED_COPY as Record<string, string>)[reason] ?? DEFAULT_ORCHESTRATION_DENIED_COPY
}
