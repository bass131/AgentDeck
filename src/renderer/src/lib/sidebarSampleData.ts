/**
 * sidebarSampleData.ts — F8 사이드바 정적 샘플 데이터.
 *
 * 새 IPC 0. window.api/store 호출 절대 금지. 순수 상수.
 * 실데이터 연결은 M4에서 IPC/store로 승격될 예정.
 */

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
  /** 동적 사용자 색: 토큰 부적합(사용자별 고유 색) → 인라인 허용(안티슬롭 예외, F8 설계 주석). */
  avatarColor: string
}

/** 샘플 세션 목록: running 1 · done 1 · idle 나머지, hasPrompt 1개. */
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

/** 샘플 사용자 정보. */
export const SAMPLE_USER: SampleUser = {
  name: '개발자',
  avatarText: 'D',
  avatarColor: '#6366f1', // 고정 샘플 hex — 동적 사용자별 색이므로 토큰 비적용(설계 예외)
}
