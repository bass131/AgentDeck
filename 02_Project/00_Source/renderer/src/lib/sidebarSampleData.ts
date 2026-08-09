export type SessionStatus = 'idle' | 'running' | 'done' | 'error'

export interface SessionSummary {
  id: string
  title: string
  status: SessionStatus
  hasPrompt?: boolean
}

export interface SampleUser {
  name: string
  avatarText: string
  avatarColor: string
}

export const SAMPLE_SESSIONS: SessionSummary[] = [
  {
    id: 'sess-1',
    title: 'AuthService 리팩터링',
    status: 'running',
    hasPrompt: true,
  },
  {
    id: 'sess-2',
    title: 'DB 마이그레이션 스크립트',
    status: 'done',
  },
  {
    id: 'sess-3',
    title: 'UI 컴포넌트 테스트 작성',
    status: 'idle',
  },
  {
    id: 'sess-4',
    title: 'API 문서 자동 생성',
    status: 'idle',
  },
  {
    id: 'sess-5',
    title: 'CI/CD 파이프라인 설정',
    status: 'idle',
  },
]

export const SAMPLE_USER: SampleUser = {
  name: '개발자',
  avatarText: 'D',
  avatarColor: '#6366f1',
}
