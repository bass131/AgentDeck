/**
 * SubAgentInline.tsx — 서브에이전트 채팅 인라인 카드 (F-G).
 *
 * Claude Code CLI처럼 채팅 thread 안에서 서브에이전트가 도는 걸 동적으로 보여준다.
 * 단일·멀티 공통: thread의 {kind:'subagent', id} 마커 위치에 렌더. 데이터(agent)는
 * 부모가 state.subagents(단일=store, 멀티=session.state)에서 id로 조회해 prop으로 전달 —
 * 부모 리렌더마다 최신 agent가 흘러와 라이브 갱신된다. 클릭 → onOpen(id)로 상세(라이브) 열기.
 *
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 * 인라인 색상 0 — CSS 변수 토큰만.
 */
import { memo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { IconCheck, IconChevRight, IconSearch, IconFile, IconBot } from '../common/icons'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import './SubAgentInline.css'

const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

function saIcon(name: string, size: number): JSX.Element {
  const n = name.toLowerCase()
  if (n.includes('explore') || n.includes('search') || n.includes('탐색'))
    return <IconSearch size={size} />
  if (n.includes('verify') || n.includes('test') || n.includes('검증'))
    return <IconCheck size={size} />
  if (n.includes('build') || n.includes('구현') || n.includes('code') || n.includes('file'))
    return <IconFile size={size} />
  return <IconBot size={size} />
}

export const SubAgentInline = memo(function SubAgentInline({
  agent,
  onOpen,
}: {
  /** state.subagents에서 부모가 id로 조회한 라이브 데이터. 미발견(undefined)이면 미렌더. */
  agent: SubAgentInfo | undefined
  onOpen: (id: string) => void
}): JSX.Element | null {
  if (!agent) return null

  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length
  // 현재 활동: 실행 중 도구가 있으면 그 동작, 없으면 activity 요약
  const runningTool = agent.tools.find((t) => t.status === 'running')
  const activity = runningTool
    ? `${runningTool.verb}${runningTool.target ? ' ' + runningTool.target : ''}`.trim()
    : (agent.activity ?? '')

  return (
    <button
      type="button"
      className={'sa-inline ' + agent.status}
      onClick={() => onOpen(agent.id)}
      aria-busy={agent.status === 'running' ? 'true' : undefined}
      title="클릭하여 대화 상세 보기"
    >
      <span className="sa-inline-ic" aria-hidden="true">
        {agent.status === 'running' ? <span className="spin" /> : saIcon(agent.name, 15)}
      </span>
      <div className="sa-inline-main">
        <div className="sa-inline-head">
          <span className="sa-inline-name">{agent.name}</span>
          {agent.role && <span className="sa-inline-role">{agent.role}</span>}
          {/* 모델 배지(영호 육안 피드백 2026-07-04) — 상세를 열지 않아도 어떤 모델이
              뛰는지 보이게 노출 지점 확대. 공간이 좁으니 compact 변주(라벨은 그대로). */}
          <SubAgentModelBadge model={agent.model} running={agent.status === 'running'} compact />
          <span className={'sa-inline-status ' + agent.status}>
            {agent.status === 'done' && <IconCheck size={11} />}
            {SA_STATUS_LABEL[agent.status]}
          </span>
        </div>
        {activity && <div className="sa-inline-activity">{activity}</div>}
        {agent.tools.length > 0 && (
          <div className="sa-inline-tools">도구 {toolsDone}/{agent.tools.length}</div>
        )}
      </div>
      <IconChevRight className="sa-inline-chev" size={15} />
    </button>
  )
})

export default SubAgentInline
