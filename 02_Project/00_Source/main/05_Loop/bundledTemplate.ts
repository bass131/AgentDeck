// M09 G2 — 앱 번들에 실은 템플릿. electron-vite(main)는 JSON import를 모듈로 묶으므로 실행 때 파일을 읽지 않는다.
// loadTemplate은 텍스트를 받으므로 번들 값을 다시 직렬화해 넘긴다. 해시는 정규 직렬화의 sha256이라 파일 본문의 해시와 같다.
// 화면·IPC 연결은 G3다. 지금 이 진입점을 부르는 것은 openLoop뿐이다.
import programDev from './templates/program-dev.json'
import { loadTemplate, type TemplateLoad } from './template'

export const BUNDLED_TEMPLATE_ID = 'program-dev'

export function loadBundledTemplate(): TemplateLoad {
  return loadTemplate(JSON.stringify(programDev))
}
