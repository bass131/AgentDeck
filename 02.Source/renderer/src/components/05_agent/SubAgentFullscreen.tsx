/**
 * SubAgentFullscreen.tsx — 서브에이전트 풀스크린 상세 = 하위 채팅 세션 뷰 (F-E, FB1 P06).
 *
 * 사용자 요구: SubAgent 클릭 → 상세를 Claude Code CLI처럼 **채팅 대화 형태**로.
 *  - 작업 지시(role)를 대화 시작 메시지로(위임 프롬프트, user 역할).
 *  - 서브에이전트의 흐름(transcript: 사고/텍스트/도구)을 채팅 메시지로 순서대로.
 *  - 최종 답변(activity, reducer가 정제)을 마지막 에이전트 메시지로(raw JSON 아님).
 *  - 라이브: 부모가 store에서 id로 조회한 agent를 prop으로 넘겨 transcript가 실시간 누적.
 *
 * ── 영호 지시(2026-07-04) — 멀티 워크스페이스 패널 카드 문법 이식 ──────────────────
 * "SubAgent 상세 표현을 멀티에이전트 패널을 재활용해서 디자인을 세부화하자."
 * 신규 색·토큰·keyframe 0 목표 — 00_shell/panel/PanelView.tsx + MultiWorkspace.css의
 * `.ma-p-*` 카드 문법을 그대로 이식(literal 재사용)한다. MultiWorkspace.css는 layout/
 * Shell.tsx가 MultiWorkspace.tsx를 정적 import하며 항상 로드되므로 새 import 없이도
 * 전역에 있지만, 이 파일이 실제로 그 클래스에 의존한다는 걸 명시하려고 직접 import한다.
 * `.toollog`(01_conversation/ToolGroup.css)도 같은 이유로 직접 import(reviewer 🟡 2026-07-04
 * — 지금까지 Conversation→ToolGroup 전이 로드에만 의존했던 걸 방어·자기문서화).
 *
 * 이식한 요소:
 *   - 헤더: `.ma-p-head`(카드 헤더 셸) > `.ma-p-row1`(dot 상태점 + 제목 + spacer + 상태
 *     pill `.ma-status`) + `.ma-p-row2`(role 텍스트 + 모델 배지, 있을 때만).
 *     `.ma-p-dot`/`.ma-status`는 PanelView의 LiveStatus 매핑과 동형: running→working
 *     (패널이 "작업 중"에 쓰는 것과 같은 색), done→done, queued→기본(무클래스, 회색).
 *   - 헤더 아이콘 사각형(구 `.saf-ic`, saIcon())은 폐기 — 패널 헤더엔 그런 아이콘이
 *     없다(카드 문법에 없는 걸 억지로 유지하지 않는다). 상태는 dot+pill로 충분히 전달.
 *   - 도구 이력 요약: `.ma-p-scope`(패널의 "파일 N · 도구 N" 요약 바)를 재사용해
 *     "도구 완료/전체" 1줄 표시(있는 데이터만 — 시작/소요 시간 등은 계약에 없어 미표시).
 *   - 대화 스트림: `.ma-p-body`/`.ma-p-thread`/`.ma-p-messages`(패널의 바디/스크롤/
 *     메시지목록 3단 셸)를 대화 컨테이너로 재사용. `.saf-convo`는 스타일을 더 이상
 *     소유하지 않고 안정적인 테스트 훅(마커 클래스)으로만 병기.
 *   - 도구 호출 구조화(세부화): 인접한 tool 트랜스크립트 항목을 lib/subagentChat.ts의
 *     groupSubagentToolRuns()로 런(run) 단위 그룹핑 → 본 채팅이 이미 쓰는 ToolGroup.css
 *     `.toollog`(연속 도구 시각 묶음, 42px 컬럼 정렬)를 그대로 재사용. 구 `.saf-tool-slot`
 *     (아이템당 개별 wrapper)는 폐기.
 *   - 이름 타이포만 전체화면 스케일로 소폭 확대(`.saf-name`이 `.ma-p-title` 위에 font-size/
 *     weight만 오버라이드 — 서체/말줄임/색은 패널 그대로 상속. "전체화면 맥락 스케일
 *     조정은 허용" 지시 반영, 신규 색/토큰 0).
 *   - 채팅화(FB1 P06)·모델 배지(SubAgentModelBadge, 영호 2026-07-04 배지 피드백)는 보존.
 *
 * FB1 P06(기존, 유지): 순서/역할 매핑은 lib/subagentChat.ts(순수 함수, 단위 테스트됨)로
 * 뽑아내고, 렌더링은 본 채팅 컴포넌트를 최대한 재사용한다 — 새 시각 문법 발명 최소화.
 *   - task(위임 프롬프트)/text(응답) → 01_conversation/MessageBubble.tsx(원래 Conversation.tsx
 *     안에 있었으나 이 재사용을 위해 별도 파일로 추출 — 순환참조 회피). user 역할
 *     버블은 name="작업"으로 오버라이드, assistant 역할 버블은 name=agent.name으로 오버라이드.
 *   - tool(도구 호출) → 01_conversation/ToolCallCard.tsx. 서브에이전트 도구 데이터
 *     (SubAgentTranscriptItem)는 이미 정규화된 verb/target만 있고 raw input/result가
 *     없어(shared/agent-events.ts) toolTarget() 파생이 안 되므로 targetOverride로 주입.
 *   - thinking(사고) → 기존 saf-* 전용 마크업 유지(재사용 불가 지점): 메인 채팅의
 *     ThinkingItem은 "현재 진행 중" 애니메이션을 전제하는데, 서브에이전트 transcript의
 *     thinking은 이미 끝난 과거 기록이라 애니메이션을 붙이면 거짓 신호.
 *
 * FullscreenOverlay(P-4 공통셸) 재사용 — 블러/Esc/바깥클릭 제공.
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { useMemo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import {
  buildSubagentChatItems,
  hasSubagentConversation,
  groupSubagentToolRuns,
  type SubagentToolItem,
} from '../../lib/subagentChat'
import { FullscreenOverlay } from '../common/FullscreenOverlay'
import { MessageBubble } from '../01_conversation/MessageBubble'
import { ToolCallCard } from '../01_conversation/ToolCallCard'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import type { ToolCard, ToolCardStatus } from '../../store/reducer'
import '../00_shell/MultiWorkspace.css'
// reviewer 🟡(2026-07-04): .toollog는 이 파일이 직접 소비 — 지금까지 Conversation→ToolGroup
// 전이 로드에만 의존했으므로 MultiWorkspace.css와 동일하게 직접 import로 방어·자기문서화.
import '../01_conversation/ToolGroup.css'
import './SubAgentFullscreen.css'

const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

/** SubAgentInfo.status → 패널 문법(.ma-p-dot/.ma-status) cls 접미사.
 *  PanelView.liveStatus 매핑과 동형: running→working(패널의 "작업 중" 색), done→done,
 *  queued는 접미사 없음(두 클래스 모두 기본값이 이미 중립 회색이라 별도 cls 불필요). */
function panelStatusCls(status: SubAgentInfo['status']): string {
  if (status === 'running') return 'working'
  if (status === 'done') return 'done'
  return ''
}

/** tool 채팅 아이템 → ToolCallCard가 요구하는 ToolCard 셰이프로 최소 변환(shim). */
function toShimToolCard(item: SubagentToolItem): ToolCard {
  // ToolCardStatus엔 'queued'가 없음(SubAgentTool엔 있음) — 시각적으로는 running과
  // 동일하게 취급(스피너)해도 무해: 리듀서가 실제로 'queued'를 만드는 경로가 없다
  // (reducer/tool.ts handleToolCall은 자식 tool을 항상 'running'으로 생성).
  const status: ToolCardStatus = item.status === 'queued' ? 'running' : item.status
  return { id: item.id, name: item.verb, input: undefined, status }
}

export function SubAgentFullscreen({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  // Hooks는 조건부 return보다 위(React 규칙) — agent=null이면 빈 배열로 계산.
  const items = useMemo(() => (agent ? buildSubagentChatItems(agent) : []), [agent])
  // 인접 tool 런 그룹핑(세부화) — .toollog 재사용을 위한 렌더 전용 2차 변환.
  const groups = useMemo(() => groupSubagentToolRuns(items), [items])

  if (!agent) return null

  const hasConvo = hasSubagentConversation(items)
  // 상태는 이제 헤더 pill(.ma-status)에서 한 번만 표시 — 타이틀바에 중복 병기하지 않는다.
  const title = agent.name
  const dotCls = panelStatusCls(agent.status)

  // 마지막 text 아이템 id — 실행 중이면 그 버블만 스트리밍 커서 표시(본 채팅과 동형).
  let lastTextId: string | null = null
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      lastTextId = items[i].id
      break
    }
  }

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
            <span className="ma-p-title saf-name">{agent.name}</span>
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

        {/* 대화 스트림 — 패널 .ma-p-body/.ma-p-thread/.ma-p-messages 3단 셸 재사용.
            .saf-convo는 스타일 없이 안정적 테스트 훅으로만 병기. */}
        <div className="ma-p-body">
          <div className="ma-p-thread">
            <div className="ma-p-messages saf-convo">
              {groups.map((group) => {
                if (group.kind === 'toolgroup') {
                  // 세부화 — 인접 도구 호출을 본 채팅과 동일한 .toollog 묶음으로.
                  return (
                    <div className="toollog" key={group.id}>
                      {group.tools.map((t) => (
                        <ToolCallCard key={t.id} card={toShimToolCard(t)} targetOverride={t.target} />
                      ))}
                    </div>
                  )
                }

                const item = group.item

                if (item.kind === 'task') {
                  return (
                    <div className="saf-msg saf-msg--task" key={item.id}>
                      <MessageBubble role="user" name="작업" content={item.text} />
                    </div>
                  )
                }

                if (item.kind === 'thinking') {
                  // 재사용 불가 지점: 완료된 과거 기록이라 ThinkingItem(애니메이션 전제)은 부적합.
                  return (
                    <div className="saf-msg saf-msg--thinking" key={item.id}>
                      <div className="saf-msg-who">생각 중</div>
                      <div className="saf-msg-body">{item.text}</div>
                    </div>
                  )
                }

                // kind === 'text' — 서브에이전트 응답(중간 또는 최종 답변).
                // 마지막 text이면서 아직 실행 중이면 SmoothMarkdown(스트리밍 커서) 사용.
                const streaming = item.id === lastTextId && agent.status === 'running'
                return (
                  <div className="saf-msg saf-msg--agent" key={item.id}>
                    <MessageBubble role="assistant" name={agent.name} content={item.text} streaming={streaming} />
                  </div>
                )
              })}

              {/* 진행 중 표시 */}
              {agent.status === 'running' && (
                <div className="saf-running">
                  <span className="spin" aria-hidden="true" />
                  <span>서브에이전트가 작업 중…</span>
                </div>
              )}

              {/* 빈 대화 */}
              {!hasConvo && agent.status !== 'running' && (
                <div className="ag-empty">아직 대화가 없어요</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
