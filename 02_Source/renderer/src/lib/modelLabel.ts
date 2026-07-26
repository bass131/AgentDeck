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
 * 단독 표기 금지, 예: 'Opus'만 X). buildModelIdPattern()이 이미 family 뒤에 `-(\d+)`(메이저
 * 버전)를 필수로 요구하므로, 알려진 패턴에 매칭되는 한 넘버링이 없는 라벨은 애초에 생성될
 * 수 없다(major만 있고 minor가 없으면 major까지만 표기 — 'claude-fable-5' → 'Fable 5').
 *
 * [정정, CP1 렌더러 후속 — reviewer 🟡 봉합] 이 문단은 원래 "실측 message.model만이 유일한
 * 출처라 넘버링 없는 코드 경로가 아예 없다"고 주장했으나, CP1 P07(커밋 7814748)이 조기
 * 스냅샷(Task/Agent tool_use `input.model` — 짧은 별칭 'sonnet'|'opus'|'haiku'|'fable',
 * 버전 없음)을 SubAgentInfo.model에 추가로 흘려보내게 되면서 그 명제가 깨졌다
 * (shared/agent-events.ts SubAgentInfo.model JSDoc 참조 — 출처가 이제 조기 별칭/실측 갱신
 * 두 가지). 즉 라이브에서 넘버링 없는 별칭이 이 필드에 실제로(짧게) 담기는 코드 경로가
 * 생겼다. 거동 자체는 안전하게 유지된다 — buildModelIdPattern()은 'claude-' 접두 + 버전
 * 숫자를 필수로 요구해 별칭엔 매칭되지 않으므로 modelLabel()은 별칭을 원문 그대로 폴백한다
 * (패밀리명 단독 텍스트로 순간 노출될 위험은 소비 측 SubAgentModelBadge가 아래
 * isBareModelAlias()로 배지 자체를 숨겨 차단 — 그 함수 doc 참조). modelLabel.test.ts ML5는
 * "실측 갱신" 경로(4종 현행 실측 ID)가 전부 넘버링을 포함한다는 좁은 계약만 고정하며,
 * "조기 별칭 경로가 없다"는 주장은 더 이상 하지 않는다.
 *
 * CP1 P06 ⑥(단일 출처화): 패밀리 id 목록('fable'/'opus'/'sonnet'/'haiku')을 정규식에
 * 하드코딩하면 pickerOptions.ts의 MODELS(컴포저 피커 팔레트 — 이미 같은 목록의 실질
 * 소유자)와 두 곳에 같은 목록이 존재해 드리프트 위험이 생긴다(신규 모델 패밀리 추가 시
 * MODELS만 갱신하고 여기를 깜빡하면 라벨/색 매핑이 조용히 실패). buildModelIdPattern()이
 * 매 호출 시 MODELS.map(id)에서 동적으로 패턴을 구성해 MODELS를 유일한 출처로 만든다
 * (main/01_agents/modelFallback.ts는 프로세스 경계 너머라 이 단일화 대상이 아니다 —
 * 신뢰경계상 renderer가 import할 수 없으므로 별도 복제를 그대로 유지, 모듈 상단 주석 참조).
 */
import { MODELS } from './pickerOptions'

/**
 * escapeRegExp — 정규식 메타문자 이스케이프(CP1 렌더러 후속, reviewer 🟡 봉합).
 * 현재 MODELS(pickerOptions.ts)의 id들('fable'/'opus'/'sonnet'/'haiku')은 전부 영문
 * 소문자뿐이라 지금 당장 깨질 입력은 없지만, buildModelIdPattern()이 MODELS.map(id)를
 * 그대로 정규식 조각으로 삽입하므로 향후 id에 `.`/`+`/`(` 같은 정규식 메타문자가 섞이면
 * 의도치 않은 패턴 매칭(예: '.'이 임의 문자에 매칭)으로 조용히 깨질 수 있다. 방어적으로
 * 항상 이스케이프한다.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * MODELS(pickerOptions.ts)의 id들로 모델 ID 매칭 정규식을 구성한다.
 * 매 호출 시 재구성(캐시 없음) — MODELS는 정적 상수라 비용이 무시할 수준이고,
 * 테스트가 MODELS를 런타임에 확장해도(단일 출처 검증) 즉시 반영돼야 하기 때문이다.
 */
function buildModelIdPattern(): RegExp {
  const familyIds = MODELS.map((opt) => escapeRegExp(opt.id)).join('|')
  return new RegExp(`claude-(${familyIds})-(\\d+)(?:-(\\d{1,2}))?\\b`, 'i')
}

/**
 * 원시 모델 ID → 표시 이름.
 * 'claude-opus-4-8' → 'Opus 4.8', 'claude-haiku-4-5-20251001' → 'Haiku 4.5'(날짜 접미 무시).
 * 패턴 불일치(미지 모델) → 원문 그대로.
 * undefined/빈 문자열 → undefined(호출측이 조건부 렌더로 미표기 처리).
 */
export function modelLabel(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return family + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * 원시 모델 ID → 패밀리 정체성 색(CSS 변수 토큰 문자열, 예: 'var(--gold)').
 *
 * 신규 색 발명 0 — lib/pickerOptions.ts의 MODELS(컴포저 모델 피커 팔레트)와 동일 소스를
 * 재사용한다. 패밀리 id 목록이 buildModelIdPattern()의 캡처 그룹과 MODELS 자신에서
 * 동적으로 파생되므로 드리프트 없이 매핑된다(단일 진실원, CP1 P06 ⑥).
 * 패턴 불일치(미지 모델)/미지정 → undefined(호출측이 중립 회색으로 폴백).
 */
export function modelFamilyColor(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return undefined
  const family = m[1].toLowerCase()
  return MODELS.find((opt) => opt.id === family)?.color
}

/**
 * isBareModelAlias — CP1 렌더러 후속: "조기 별칭" 판별(모델 미확정 상태).
 *
 * 배경: CP1 P07(커밋 7814748)부터 SubAgentInfo.model이 서브에이전트 생성 즉시 조기
 * 스냅샷(Task/Agent tool_use `input.model`)을 담을 수 있다 — 이 값은 원시 모델 ID가
 * 아니라 버전 없는 짧은 별칭('sonnet'|'opus'|'haiku'|'fable')이다(모듈 상단 주석 정정
 * 문단 참조). modelLabel()은 이 별칭이 buildModelIdPattern()에 안 걸려 원문 그대로
 * ('opus' 등) 폴백하는데, 그 문자열을 배지에 그대로 노출하면 영호 요구("패밀리명 단독
 * 표기 금지")를 사실상 어기는 것처럼 보인다(넘버 없는 패밀리명 텍스트).
 *
 * 해법(신규 시각 문법 0): 이 함수로 "지금 값이 정확히 알려진 패밀리 별칭 그 자체"인지만
 * 판별한다 — MODELS(pickerOptions.ts)의 id와 완전 일치(대소문자 무시)할 때만 true.
 * 소비 측(SubAgentModelBadge)은 true면 배지 자체를 렌더하지 않는다 — undefined 입력과
 * 동일한 기존 "graceful absent" 경로를 재사용(자리 예약 없음), 실측 원시 ID 도착 시
 * 자연스럽게 배지가 등장한다. 완전히 미지의 문자열('future-model-x1' 등, 별칭 목록에
 * 없는 값)은 여기 해당하지 않는다 — 그런 값은 여전히 원문 그대로 배지에 표시된다(ML3/MB3
 * 정보 손실 없음 계약 불변).
 */
export function isBareModelAlias(id: string | undefined): boolean {
  if (!id) return false
  return MODELS.some((opt) => opt.id.toLowerCase() === id.toLowerCase())
}
