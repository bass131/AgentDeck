/**
 * SubAgentModelBadge.tsx — 서브에이전트 모델 배지(칩), 상세/인라인 공유 (영호 육안 피드백 2026-07-04).
 *
 * 피드백: "SubAgent 모델 표기가 너무 단순한데, 디자인도 너무 평범하고, 너무 텍스트에 정적인
 * 표시 위주라 별로네" — 이전(커밋 7030e43)엔 SubAgentFullscreen 헤더의 saf-role에 회색
 * 텍스트로 "role · Opus 4.8"처럼 병기만 했다. 신규 시각 문법 발명 대신 기존 칩 문법을
 * 재사용해 격상한다(UI.md 5장 안티슬롭 — 임의 장식 금지, *쓰는* 토큰만).
 *
 * 재사용한 기존 문법:
 *   - pill 형태: AgentPanel.css `.ag-pill`(상태 pill 관례 — 작은 dot + 텍스트, radius 99px,
 *     surface-2 배경 + line 보더의 중립 칩. AgentPanel.tsx 참조).
 *   - 컬러 도트: ComposerPicker.tsx `.pick-dot`/`.po-dot`(컴포저 모델 피커의 모델별 색 도트,
 *     `style={{ background: option.color }}`로 토큰 문자열을 인라인 주입하는 기존 관례를
 *     그대로 따른다 — 리터럴이 아니라 'var(--gold)' 같은 토큰 참조 문자열이라 UI.md의
 *     "인라인 색상 리터럴 금지"에 저촉되지 않는다).
 *   - 패밀리 정체성 색: lib/pickerOptions.ts MODELS 팔레트(신규 색 0) — 모델 피커와 배지가
 *     동일한 색 정체성을 공유(Fable=gold, Opus=violet, Sonnet=blue, Haiku=teal).
 *   - running pulse(모션): AgentPanel.css `.ag-pill-dot.running`(@keyframes ag-pulse) 재사용.
 *     이 파일(SubAgentInline/Fullscreen)은 이미 `.spin`/`@keyframes spin`(AgentPanel.css 소유)에
 *     암묵 의존하는 기존 관례가 있다(두 컴포넌트 모두 자체 스피너 keyframe을 재선언하지 않음) —
 *     같은 방식으로 ag-pulse도 재선언 없이 그대로 참조한다. 신규 keyframe 0.
 *
 * 노출 지점 확대: SubAgentFullscreen(헤더, 기본 크기) + SubAgentInline(카드, compact 변주) —
 * 두 곳이 이 컴포넌트 하나를 공유해 드리프트를 차단한다.
 *
 * CP1 렌더러 후속(조기 별칭 배지 UX): CP1 P07부터 model이 버전 없는 조기 별칭('opus' 등)일
 * 수 있다 — isBareModelAlias()로 감지해 그 상태에선 배지를 아예 렌더하지 않는다(모델
 * 미확정 취급, lib/modelLabel.ts isBareModelAlias() doc 참조). 신규 시각 문법 발명 없이
 * 기존 "model undefined → null" graceful absent 경로를 재사용.
 *
 * 라벨: lib/modelLabel.ts(포매터, 로직 변경 없음)를 그대로 사용 — "패밀리명 + 버전 넘버"
 * 형식은 그 모듈의 책임(영호 2026-07-04 추가 요구: 패밀리명 단독 표기 금지). compact
 * 변주에서도 라벨 텍스트는 절대 축약하지 않는다(넘버링 소실 금지) — 칩 크기만 축소.
 *
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { type CSSProperties, type JSX } from 'react'
import { modelLabel, modelFamilyColor, isBareModelAlias } from '../../lib/modelLabel'
import './SubAgentModelBadge.css'

export function SubAgentModelBadge({
  model,
  running,
  compact,
}: {
  /** 원시 모델 ID(SubAgentInfo.model). 없으면 미표기(null 반환). */
  model: string | undefined
  /** true면 도트가 살아있는 느낌(ag-pulse 재사용) — 완료 후 정적 배지로 안착. */
  running?: boolean
  /** true면 인라인 카드용 축약 변주(칩 크기만 축소, 라벨 텍스트는 그대로 유지). */
  compact?: boolean
}): JSX.Element | null {
  // CP1 렌더러 후속(조기 별칭 배지 UX): model이 "조기 스냅샷" 그대로의 버전 없는 별칭
  // ('opus' 등)이면 아직 모델 미확정으로 취급해 배지 자체를 숨긴다(기존 undefined 처리와
  // 동일한 graceful absent 재사용 — 신규 시각 문법 0). 실측 원시 ID 도착 시(예:
  // 'claude-opus-4-8') isBareModelAlias가 false가 되어 배지가 자연스럽게 등장한다.
  // modelLabel.ts isBareModelAlias() doc 참조.
  if (isBareModelAlias(model)) return null
  const label = modelLabel(model)
  if (!label) return null
  const color = modelFamilyColor(model)

  return (
    <span
      className={'sa-model-badge' + (running ? ' running' : '') + (compact ? ' compact' : '')}
    >
      <span
        className="sa-model-dot"
        aria-hidden="true"
        style={color ? ({ background: color } as CSSProperties) : undefined}
      />
      <span className="sa-model-txt">{label}</span>
    </span>
  )
}

export default SubAgentModelBadge
