// 앱이 기기 인증으로 받은 토큰을 main 안에서 읽는 한 길. 출처(토큰 저장)는 조립 지점이 넣는다 — 이 모듈은 electron을 모른다.
// 토큰은 gh·git 자식 프로세스의 환경(GH_TOKEN)으로만 넘긴다. 이 프로세스의 process.env에는 넣지 않는다.
// 앱 토큰이 자격이 되는 곳은 github.com 하나다(ghe.com 테넌트·GHES에는 싣지 않는다)
export const GITHUB_HOST = 'github.com'
export const GITHUB_GIT_URL = `https://${GITHUB_HOST}`

let source: () => string | null = () => null

export function setAppTokenSource(fn: () => string | null): void {
  source = fn
}

export function appGithubToken(): string | null {
  try { return source() || null } catch { return null }
}

export function withGhToken(env: NodeJS.ProcessEnv, token: string | null): NodeJS.ProcessEnv {
  return token ? { ...env, GH_TOKEN: token } : env
}
