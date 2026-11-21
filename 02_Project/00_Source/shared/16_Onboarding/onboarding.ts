export const ONBOARDING_CHANNELS = {
  ONBOARDING_GH_CHECK: 'onboarding.ghCheck',
  ONBOARDING_OPEN_GH_INSTALL: 'onboarding.openGhInstall',
} as const

// 렌더러는 주소를 보내지 못한다 — 열기 채널은 이 주소 하나만 연다
export const GH_INSTALL_URL = 'https://cli.github.com'
export const GH_CHECK_TIMEOUT_MS = 5000

// gh 실행 파일의 경로·환경 값은 싣지 않는다
export type GhCheckResult =
  | { state: 'present'; version: string | null }
  | { state: 'absent' }
  | { state: 'timeout' }
