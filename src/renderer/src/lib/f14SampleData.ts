/**
 * f14SampleData.ts — F14 정적 샘플 데이터.
 *
 * PermissionModal/QuestionModal 데모용. window.api 0.
 */

/** PermissionModal 샘플 */
export const SAMPLE_PERMISSION = {
  toolName: 'Bash',
  summary: 'rm -rf /tmp/agentdeck-build && mkdir -p /tmp/agentdeck-build',
}

/** QuestionModal 질문 옵션 타입 */
export interface QuestionOption {
  label: string
  description?: string
}

/** QuestionModal 단일 질문 타입 */
export interface AgentQuestion {
  header?: string
  question: string
  options: QuestionOption[]
  multiSelect?: boolean
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
