// M10 G5 — Windows 토스트는 AppUserModelID가 있는 앱에서만 뜬다. Electron 문서(tutorial/notifications)대로 개발 중에는
// 실행 파일 경로를 id로 쓴다. 패키지 빌드는 설치기가 바로 가기와 함께 정한 id를 쓰므로 덮지 않는다.

export function devAppUserModelId(env: { platform: string; isPackaged: boolean; execPath: string }): string | null {
  return env.platform === 'win32' && !env.isPackaged ? env.execPath : null
}

export function applyDevAppUserModelId(
  app: { isPackaged: boolean; setAppUserModelId: (id: string) => void },
  platform: string = process.platform,
  execPath: string = process.execPath,
): void {
  const id = devAppUserModelId({ platform, isPackaged: app.isPackaged, execPath })
  if (id !== null) app.setAppUserModelId(id)
}
