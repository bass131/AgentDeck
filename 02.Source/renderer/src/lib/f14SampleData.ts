/**
 * f14SampleData.ts — F14 정적 샘플 데이터.
 *
 * PermissionModal/QuestionModal 데모용. window.api 0.
 *
 * G2: QuestionOption / AgentQuestion 은 shared canonical(agent-events.ts)에서 import.
 * 이 파일은 타입을 re-export 하여 기존 import 경로를 비파괴적으로 유지한다.
 */

// shared canonical에서 타입을 가져와 re-export (단일 진실 공급원 준수)
export type { QuestionOption, AgentQuestion } from '../../../shared/agent-events'
import type { AgentQuestion } from '../../../shared/agent-events'

/** PermissionModal 샘플 */
export const SAMPLE_PERMISSION = {
  toolName: 'Bash',
  summary: 'rm -rf /tmp/agentdeck-build && mkdir -p /tmp/agentdeck-build',
}

/** QuestionModal 샘플 (다중 질문) */
export const SAMPLE_QUESTIONS: AgentQuestion[] = [
  {
    header: '작업 범위',
    question: '어떤 파일을 수정할까요?',
    options: [
      { label: 'src/main.ts', description: '메인 프로세스 진입점' },
      { label: 'src/renderer/index.ts', description: '렌더러 진입점' },
      { label: 'package.json', description: '패키지 설정' },
    ],
    multiSelect: false,
  },
  {
    header: '배포 방식',
    question: '빌드 후 어떻게 배포할까요?',
    options: [
      { label: 'npm run package', description: 'NSIS 설치 exe 생성' },
      { label: 'npm run build', description: '번들만 생성' },
    ],
    multiSelect: true,
  },
]
