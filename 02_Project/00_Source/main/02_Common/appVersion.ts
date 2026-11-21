import { version } from '../../../../package.json'

// app.getVersion()은 `electron out/main/index.js` 실행에서 Electron 버전을 돌려준다
export const APP_VERSION: string = version
