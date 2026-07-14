/**
 * SubAgentFullscreen.tsx — 서브에이전트 풀스크린 상세 = 하위 채팅 세션 뷰 (F-E, FB1 P06).
 *
 * 사용자 요구: SubAgent 클릭 → 상세를 Claude Code CLI처럼 **채팅 대화 형태**로.
 *  - 작업 지시(role)를 대화 시작 메시지로(위임 프롬프트, user 역할).
 *  - 서브에이전트의 흐름(transcript: 사고/텍스트/도구)을 채팅 메시지로 순서대로.
 *  - 최종 답변(activity, reducer가 정제)을 마지막 에이전트 메시지로(raw JSON 아님).
 *  - 라이브: 부모가 store에서 id로 조회한 agent를 prop으로 넘겨 transcript가 실시간 누적.
 *
 * ── GAP1 P14 sub-B (2026-07-15) — 본문 추출 ──────────────────────────────────
 * 대화 본문(패널 3단 셸 + task/tool/thinking/text 채팅 렌더 + 진행중/빈 대화)은
 * SubAgentChatStream.tsx로 추출 — 스플릿 그리드 셀(SubAgentCell)과 공동 소비한다.
 * 이 파일은 풀스크린 고유분만 소유: FullscreenOverlay 셸 + 카드 헤더(.ma-p-head —
 * row1 dot/이름/상태 pill + row2 role/모델 배지) + 도구요약(.ma-p-scope).
 * DOM 문법·클래스는 추출 전과 동일(subagent-fullscreen.test.tsx 회귀 잠금 green 유지).
 *
 * ── 영호 지시(2026-07-04) — 멀티 워크스페이스 패널 카드 문법 이식 ──────────────────
 * "SubAgent 상세 표현을 멀티에이전트 패널을 재활용해서 디자인을 세부화하자."
 * 신규 색·토큰·keyframe 0 목표 — 00_shell/panel/PanelView.tsx + MultiWorkspace.css의
 * `.ma-p-*` 카드 문법을 그대로 이식(literal 재사용)한다. MultiWorkspace.css는 layout/
 * Shell.tsx가 MultiWorkspace.tsx를 정적 import하며 항상 로드되므로 새 import 없이도
 * 전역에 있지만, 이 파일이 실제로 그 클래스에 의존한다는 걸 명시하려고 직접 import한다.
 *
 * 이식한 요소(헤더 — 본문 이식분 주석은 SubAgentChatStream.tsx로 이동):
 *   - 헤더: `.ma-p-head`(카드 헤더 셸) > `.ma-p-row1`(dot 상태점 + 제목 + spacer + 상태
 *     pill `.ma-status`) + `.ma-p-row2`(role 텍스트 + 모델 배지, 있을 때만).
 *     `.ma-p-dot`/`.ma-status`는 PanelView의 LiveStatus 매핑과 동형: running→working
 *     (패널이 "작업 중"에 쓰는 것과 같은 색), done→done, queued→기본(무클래스, 회색).
 *   - 헤더 아이콘 사각형(구 `.saf-ic`, saIcon())은 폐기 — 패널 헤더엔 그런 아이콘이
 *     없다(카드 문법에 없는 걸 억지로 유지하지 않는다). 상태는 dot+pill로 충분히 전달.
 *   - 도구 이력 요약: `.ma-p-scope`(패널의 "파일 N · 도구 N" 요약 바)를 재사용해
 *     "도구 완료/전체" 1줄 표시(있는 데이터만 — 시작/소요 시간 등은 계약에 없어 미표시).
 *   - 이름 타이포만 전체화면 스케일로 소폭 확대(`.saf-name`이 `.ma-p-title` 위에 font-size/
 *     weight만 오버라이드 — 서체/말줄임/색은 패널 그대로 상속. "전체화면 맥락 스케일
 *     조정은 허용" 지시 반영, 신규 색/토큰 0).
 *   - 채팅화(FB1 P06)·모델 배지(SubAgentModelBadge, 영호 2026-07-04 배지 피드백)는 보존.
 *
 * FullscreenOverlay(P-4 공통셸) 재사용 — 블러/Esc/바깥클릭 제공.
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import type { JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { FullscreenOverlay } from '../common/FullscreenOverlay'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import { SubAgentChatStream, SA_STATUS_LABEL, panelStatusCls } from './SubAgentChatStream'
import '../00_shell/MultiWorkspace.css'
import './SubAgentFullscreen.css'

export function SubAgentFullscreen({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  if (!agent) return null

  // CP1 렌더러 후속(P07 displayName 소비): 사람이 붙인 표시명이 있으면 그걸 우선
  // 노출한다 — NG-1 계약 불변(agent.name=subagent_type은 그대로 별개 필드로 보존,
  // saf-name/제목/버블 이름 어디서도 name 필드 자체를 덮어쓰지 않는다).
  // shared/agent-events.ts SubAgentInfo.displayName JSDoc 참조.
  const displayLabel = agent.displayName ?? agent.name
  // 상태는 이제 헤더 pill(.ma-status)에서 한 번만 표시 — 타이틀바에 중복 병기하지 않는다.
  const title = displayLabel
  const dotCls = panelStatusCls(agent.status)

  const toolsTotal = agent.tools.length
  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length

  return (
    <FullscreenOverlay onClose={onClose} title={title}>
      {/* 카드 셸 — .ma-panel(패널 문법) 그대로 이식. data-slot 미지정 → --panel-accent는
          .ma-panel 자체의 기본값(var(--accent))으로 폴백(신규 색/토큰 0). overflow:hidden은
          하단 모서리 클리핑용(.ma-p-foot 없이 쓰므로 FullscreenOverlay.css .fs-panel과
          동일한 기존 관례 재사용 — 새 개념 아님). */}
      <div className="ma-panel saf-panel">
        <div className="ma-p-head saf-head">
          {/* row1 — 상태점 + 이름(제목급) + 상태 pill (패널 .ma-p-row1 문법 그대로) */}
          <div className="ma-p-row1">
            <span
              className={'ma-p-dot' + (dotCls ? ' ' + dotCls : '')}
              aria-hidden="true"
            />
            <span className="ma-p-title saf-name">{displayLabel}</span>
            <span className="ma-spacer" />
            <span className={'ma-status' + (dotCls ? ' ' + dotCls : '')}>
              <span>{SA_STATUS_LABEL[agent.status]}</span>
            </span>
          </div>
          {/* row2 — role(순수 텍스트, 종속 부제) + 모델 배지(둘 다 없으면 행 자체 미렌더).
              role/모델을 섞지 않는다(영호 육안 피드백 2026-07-04 — 이름/역할/모델 혼입 금지).
              [coordinator 실측 2026-07-04]
                (1) NG-1 원인 = 배선이 아니라 표시 위계 — name(agent 종류)은 위 row1에서
                    제목급(.ma-p-title 확대), role(위임 설명)은 여기서 더 작고 옅은 종속
                    부제로 명확히 분리(SubAgentFullscreen.css .saf-name/.saf-role 참조).
                (2) 배지 타이밍 — 비동기 서브에이전트는 model이 완료 시점에야 도착하므로
                    running 중 배지 부재는 정상. 자리를 미리 예약하지 않는다(SubAgentModelBadge
                    가 model undefined면 null 반환 → 이 행 자체가 폭을 차지하지 않음) —
                    row1(이름/상태)만으로 이미 헤더가 완결돼 보이므로 배지가 나중에 붙어도
                    레이아웃 점프가 작다. */}
          {(agent.role || agent.model) && (
            <div className="ma-p-row2">
              {agent.role && <span className="saf-role">{agent.role}</span>}
              <SubAgentModelBadge model={agent.model} running={agent.status === 'running'} />
            </div>
          )}
        </div>

        {/* 도구 이력 요약(세부화) — 패널 B2 .ma-p-scope 재사용. 데이터 있을 때만. */}
        {toolsTotal > 0 && (
          <div className="ma-p-scope" aria-label="도구 사용 현황">
            <span className="ma-p-scope-item">도구 {toolsDone}/{toolsTotal}</span>
          </div>
        )}

        {/* 대화 스트림 — SubAgentChatStream(P14 sub-B 추출 공용 조각)이 패널 3단 셸
            (.ma-p-body/.ma-p-thread/.ma-p-messages.saf-convo)째로 렌더. */}
        <SubAgentChatStream agent={agent} />
      </div>
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
