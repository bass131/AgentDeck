/**
 * SubAgentCell.tsx — SubAgent 스플릿 그리드 셀 (GAP1 P14 sub-B).
 *
 * 단일채팅모드 우측 분할 그리드(최대 2컬럼×3행)의 한 칸 — SubAgentFullscreen과 같은
 * 패널 카드 문법(.ma-panel/.ma-p-*)과 같은 대화 스트림(SubAgentChatStream 공용 조각)을
 * 소비하되, 소형 표시면에 맞게 헤더를 축약한다:
 *   - row1: 상태 dot + displayName(?? name) + 상태 pill + **활성/비활성 토글 버튼**
 *     (.ma-p-act 재사용 — PanelView 헤더 액션 버튼과 동형, aria-label/aria-pressed).
 *   - row2(role/모델 배지)는 생략 — 셀은 작고 여러 개가 병렬이라 이름+상태가 1차 정보,
 *     상세(role/모델)는 풀스크린 상세가 담당(P14 브리프 "축약 허용" 재량 판단).
 *   - 도구요약(.ma-p-scope "도구 완료/전체")은 유지 — 진행 감각의 핵심 1줄.
 *   - 이름 스케일 오버라이드(.saf-name 15px) 없음 — 셀은 패널 기본 13.5px 그대로.
 *
 * disabled(활성/비활성 토글)의 의미 — **표시 정책이지 데이터 정책이 아니다**:
 *   - 정책(누가 disabled인가)은 소유하지 않는다 — 부모(배정 정책, sub-C)가 prop으로
 *     내려주고 셀은 onToggle만 올린다(단방향 데이터 흐름).
 *   - disabled=true면 본문 렌더를 **freeze**(React.memo 커스텀 비교자 — 양쪽 frozen이면
 *     재렌더 skip)해 마지막 표시 내용에서 정지 + CSS dim/애니메이션 pause(.sac-off).
 *     store 구독·transcript 누적은 그대로(차단 아님) — 재활성화하면 최신 내용으로 즉시
 *     복귀한다. trade-off: 단순 dim만(계속 갱신)보다 코드가 약간 늘지만, 6셀 동시
 *     스트리밍에서 비활성 셀의 마크다운 재렌더 비용이 0이 된다(60fps 목표에 유리).
 *   - 헤더(dot/pill)는 freeze 대상이 아니다 — 상태는 계속 진실을 보여준다.
 *
 * P14 비범위(함정): 셀별 입력 전송·개별 abort·세션 조작 없음 — 표시 전용.
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { memo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { SubAgentChatStream, SA_STATUS_LABEL, panelStatusCls } from './SubAgentChatStream'
import { IconEye, IconEyeOff } from '../common/icons'
import '../00_shell/MultiWorkspace.css'
import './SubAgentCell.css'

/**
 * 본문 freeze 래퍼 — frozen이 유지되는 동안(prev.frozen && next.frozen) 재렌더를
 * 건너뛰어 마지막 표시 내용에서 정지한다. frozen 해제(또는 진입) 전이 렌더는 통과 →
 * 재활성화 시 최신 agent로 즉시 복귀. 비교자는 순수(부수효과 0).
 */
const FrozenChatStream = memo(
  function FrozenChatStream({ agent }: { agent: SubAgentInfo; frozen: boolean }): JSX.Element {
    return <SubAgentChatStream agent={agent} />
  },
  (prev, next) => prev.frozen && next.frozen
)

export function SubAgentCell({
  agent,
  disabled,
  onToggle,
}: {
  /** store가 라이브 갱신하는 서브에이전트 — transcript가 실시간 누적된다. */
  agent: SubAgentInfo
  /** 창별 표시 비활성(정책은 부모 소유 — 셀은 표시만). */
  disabled: boolean
  /** 헤더 토글 버튼 클릭 → 부모 정책에 위임(셀은 상태를 갖지 않는다). */
  onToggle: () => void
}): JSX.Element {
  const displayLabel = agent.displayName ?? agent.name
  const dotCls = panelStatusCls(agent.status)

  const toolsTotal = agent.tools.length
  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length

  return (
    <div
      className={'ma-panel sac-panel' + (disabled ? ' sac-off' : '')}
      data-subagent-id={agent.id}
    >
      <div className="ma-p-head">
        {/* row1 — 상태점 + 이름 + 상태 pill + 토글(패널 .ma-p-row1 문법 그대로) */}
        <div className="ma-p-row1">
          <span
            className={'ma-p-dot' + (dotCls ? ' ' + dotCls : '')}
            aria-hidden="true"
          />
          <span className="ma-p-title sac-name">{displayLabel}</span>
          <span className="ma-spacer" />
          <span className={'ma-status' + (dotCls ? ' ' + dotCls : '')}>
            <span>{SA_STATUS_LABEL[agent.status]}</span>
          </span>
          {/* 활성/비활성 토글 — .ma-p-act(패널 헤더 액션 버튼) 재사용. aria-pressed는
              "표시 켜짐" 기준(활성=true). 라벨은 누르면 일어날 동작을 서술. */}
          <button
            type="button"
            className="ma-p-act sac-toggle"
            aria-label={disabled ? '창 활성화' : '창 비활성화'}
            aria-pressed={!disabled}
            onClick={onToggle}
          >
            {disabled ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
        </div>
      </div>

      {/* 도구 이력 요약 — 풀스크린과 동형(.ma-p-scope, 있는 데이터만). freeze 밖 —
          헤더처럼 라이브 유지(진행 카운트는 소음이 아니라 상태 신호). */}
      {toolsTotal > 0 && (
        <div className="ma-p-scope" aria-label="도구 사용 현황">
          <span className="ma-p-scope-item">도구 {toolsDone}/{toolsTotal}</span>
        </div>
      )}

      {/* 대화 스트림 — 공용 조각. disabled면 freeze(위 FrozenChatStream 주석). */}
      <FrozenChatStream agent={agent} frozen={disabled} />
    </div>
  )
}

export default SubAgentCell
