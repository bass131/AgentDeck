/**
 * modelLabel.ts — 원시 모델 ID → 표시 이름·색 (renderer)
 *
 * main 쪽에 같은 규칙의 변환기(`01_agents/modelFallback.ts`)가 있지만 renderer는
 * contextIsolation 때문에 프로세스 경계 너머 모듈을 import할 수 없어 규칙만 복제한다.
 * 새 모델 패밀리를 추가하면 두 파일을 함께 갱신해야 한다 — 대신 이쪽은 fs·네트워크 없이
 * 순수 문자열 변환만 하므로 복제 비용이 낮다.
 *
 * main 버전과의 의도적 차이: main은 불일치 입력에 '다른 모델'이라는 완결된 한국어 문구로
 * 폴백한다(거부-폴백 배너 문장에 들어가므로). 여기서는 짧은 메타 표기라 원문 ID를 그대로
 * 보여주는 편이 정보 손실이 없다.
 */
import { KNOWN_MODELS } from '../../../shared/knownModels'
import { MODELS } from './pickerOptions'

/**
 * 알려진 패밀리 이름 집합 — `KNOWN_MODELS`의 full ID에서 파생한다
 * ('claude-opus-5' → 'opus').
 *
 * 패밀리 목록을 여기 따로 적으면 어휘가 늘 때 한쪽만 갱신되어 라벨·색 매핑이 조용히
 * 실패한다. 이전 구현은 같은 이유로 피커 목록(`MODELS`)의 id에서 패밀리를 뽑았는데,
 * 그 id가 짧은 별칭('opus')에서 full ID('claude-opus-5')로 바뀌면서 그 방식이 깨졌다
 * (정규식이 `claude-(claude-opus-5)-(\d+)` 꼴이 된다). 어휘의 형상이 바뀌어도 견디도록
 * full ID를 파싱해서 뽑는다.
 */
const FAMILIES: readonly string[] = [
  ...new Set(
    KNOWN_MODELS.map((id) => id.split('-')[1]).filter((f): f is string => Boolean(f))
  )
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 모델 ID 매칭 정규식.
 *
 * 뒤에 붙는 것들을 의도적으로 무시한다 — 날짜 접미사('claude-haiku-4-5-20251001')와
 * 컨텍스트 셀렉터('claude-opus-4-8[1m]')가 실제로 관측되며(SDK@0.3.201 실측, 2026-07-30),
 * 둘 다 세대를 바꾸지 않으므로 라벨에 나타날 이유가 없다.
 *
 * 매 호출 시 재구성한다(캐시 없음) — 정적 상수 파생이라 비용이 무시할 수준이고,
 * 테스트가 어휘를 런타임에 확장해도 즉시 반영돼야 한다.
 */
function buildModelIdPattern(): RegExp {
  const familyIds = FAMILIES.map(escapeRegExp).join('|')
  return new RegExp(`claude-(${familyIds})-(\\d+)(?:-(\\d{1,2}))?`, 'i')
}

/**
 * 원시 모델 ID → 표시 이름. 라벨은 항상 "패밀리명 + 버전"이다(영호 요구) — 패밀리명 단독
 * 표기는 어느 세대인지 알려주지 않으므로 만들지 않는다. 정규식이 패밀리 뒤에 메이저 버전을
 * 필수로 요구하므로 매칭되는 한 버전 없는 라벨은 생성될 수 없다.
 *
 * 'claude-opus-5' → 'Opus 5', 'claude-haiku-4-5-20251001' → 'Haiku 4.5',
 * 'claude-opus-4-8[1m]' → 'Opus 4.8'.
 * 패턴 불일치(미지 모델) → 원문 그대로. undefined/빈 문자열 → undefined.
 */
export function modelLabel(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return family + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * 원시 모델 ID → 패밀리 정체성 색(CSS 변수 토큰, 예: 'var(--gold)').
 *
 * 신규 색 발명 0 — 피커 팔레트(`MODELS`)의 색을 재사용한다. 피커에 없는 세대
 * (claude-opus-4-8 등 레거시 별칭 해석 결과)도 같은 패밀리의 색을 물려받는다.
 * 패턴 불일치/미지정 → undefined(호출측이 중립 회색으로 폴백).
 */
export function modelFamilyColor(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = buildModelIdPattern().exec(id)
  if (!m) return undefined
  const family = m[1].toLowerCase()
  return MODELS.find((opt) => opt.id.split('-')[1] === family)?.color
}

/**
 * "조기 별칭" 판별 — 모델이 아직 확정되지 않은 상태.
 *
 * 서브에이전트의 `SubAgentInfo.model`은 생성 즉시 조기 스냅샷(Task tool의 `input.model`)을
 * 담을 수 있고, 그 값은 원시 ID가 아니라 버전 없는 짧은 별칭('opus' 등)이다.
 * `modelLabel()`은 이 별칭을 패턴에 못 걸어 원문 그대로 폴백하는데, 그러면 버전 없는
 * 패밀리명이 배지에 노출된다. 소비 측(`SubAgentModelBadge`)은 이 함수가 true면 배지를
 * 아예 렌더하지 않고, 실측 원시 ID가 도착하면 자연스럽게 배지가 등장한다.
 *
 * 별칭 목록에 없는 완전 미지의 문자열은 여기 해당하지 않는다 — 그런 값은 원문 그대로
 * 표시된다(정보 손실 없음).
 */
export function isBareModelAlias(id: string | undefined): boolean {
  if (!id) return false
  return FAMILIES.some((family) => family === id.toLowerCase())
}
