export const GITHUB_CHANNELS = {
  GITHUB_STATUS: 'github.status',
  GITHUB_CONNECT: 'github.connect',
  GITHUB_CANCEL: 'github.cancel',
  GITHUB_DISCONNECT: 'github.disconnect',
  GITHUB_OPEN_VERIFICATION: 'github.openVerification',
  GITHUB_STATE: 'github.state',
} as const

// 렌더러가 받는 앱의 GitHub 연결 상태. 토큰과 기기 코드(device_code)는 싣지 않는다.
export type GithubAuthStatus =
  | { phase: 'disconnected'; error?: string }
  | { phase: 'pending'; userCode: string; verificationUri: string; expiresAt: string }
  | { phase: 'connected'; login: string }
