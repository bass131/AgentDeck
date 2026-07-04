/**
 * modelLabel.ts — 서브에이전트 원시 모델 ID → 표시 이름 변환 (FB2 P07 3단계).
 *
 * shared/agent-events.ts의 SubAgentInfo.model은 원시 모델 ID('claude-opus-4-8')만 담는다
 * (JSDoc: "표시 변환은 이 계약의 책임이 아니다"). main 쪽엔 이미 같은 규칙의 변환기
 * (01_agents/modelFallback.ts의 modelDisplay)가 있지만 renderer는 신뢰경계상 main 모듈을
 * import할 수 없다(contextIsolation — 프로세스 경계 너머 코드 로드 불가). 그래서 표시 규칙만
 * 최소 복제한다(신규 모델 패밀리 추가 시 두 파일 모두 갱신 필요 — 드리프트 트레이드오프,
 * 대신 renderer는 fs/네트워크 없이 순수 문자열 변환만 하므로 복제 비용이 낮다).
 *
 * main 버전과의 의도적 차이: main의 modelDisplay는 빈/불일치 입력에 '다른 모델'이라는
 * 고정 한국어 문구로 폴백한다(거부-폴백 배너 문구용이라 항상 완결된 문장이 필요). 여기서는
 * 서브에이전트 헤더의 짧은 메타 표기라 그럴 필요가 없고, 오히려 목록에 없는 신규/미지 모델도
 * 정보 손실 없이(라벨이 사라지지 않고) 원문 ID 그대로 보이는 편이 안전하다.
 *
 * 영호 추가 요구(2026-07-04): 배지 라벨은 항상 "패밀리명 + 버전 넘버"여야 한다(패밀리명
 * 단독 표기 금지, 예: 'Opus'만 X). MODEL_ID_PATTERN이 이미 family 뒤에 `-(\d+)`(메이저
 * 버전)를 필수로 요구하므로, 알려진 패턴에 매칭되는 한 넘버링이 없는 라벨은 애초에 생성될
 * 수 없다(major만 있고 minor가 없으면 major까지만 표기 — 'claude-fable-5' → 'Fable 5').
 * 실제 값의 출처는 shared/agent-events.ts의 JSDoc대로 SDK `SDKAssistantMessage.message.model`
 * (항상 존재하는 API 실측 버전 ID)이라 라이브에서 넘버링 없는 알려진 패밀리가 들어올 코드
 * 경로 자체가 없다 — modelLabel.test.ts ML5에서 이 계약을 회귀 테스트로 고정한다.
 */
import { MODELS } from './pickerOptions'

const MODEL_ID_PATTERN = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?\b/i

/**
 * 원시 모델 ID → 표시 이름.
 * 'claude-opus-4-8' → 'Opus 4.8', 'claude-haiku-4-5-20251001' → 'Haiku 4.5'(날짜 접미 무시).
 * 패턴 불일치(미지 모델) → 원문 그대로.
 * undefined/빈 문자열 → undefined(호출측이 조건부 렌더로 미표기 처리).
 */
export function modelLabel(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = MODEL_ID_PATTERN.exec(id)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return family + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * 원시 모델 ID → 패밀리 정체성 색(CSS 변수 토큰 문자열, 예: 'var(--gold)').
 *
 * 신규 색 발명 0 — lib/pickerOptions.ts의 MODELS(컴포저 모델 피커 팔레트)와 동일 소스를
 * 재사용한다. 패밀리 id('fable'/'opus'/'sonnet'/'haiku')가 MODEL_ID_PATTERN 캡처 그룹과
 * 정확히 일치하도록 pickerOptions.ts가 설계돼 있어 드리프트 없이 매핑된다(단일 진실원).
 * 패턴 불일치(미지 모델)/미지정 → undefined(호출측이 중립 회색으로 폴백).
 */
export function modelFamilyColor(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = MODEL_ID_PATTERN.exec(id)
  if (!m) return undefined
  const family = m[1].toLowerCase()
  return MODELS.find((opt) => opt.id === family)?.color
}
