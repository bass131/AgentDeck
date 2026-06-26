/**
 * SubAgentFullscreen.tsx — 서브에이전트 풀스크린 상세 = 채팅 대화 뷰 (F-E).
 *
 * 사용자 요구: SubAgent 클릭 → 상세를 Claude Code CLI처럼 **채팅 대화 형태**로.
 *  - 작업 지시(role)를 대화 시작 메시지로.
 *  - 서브에이전트의 흐름(transcript: 사고/텍스트/도구)을 채팅 메시지로 순서대로.
 *  - 최종 답변(activity, reducer가 정제)을 마지막 에이전트 메시지로(raw JSON 아님).
 *  - 라이브: 부모가 store에서 id로 조회한 agent를 prop으로 넘겨 transcript가 실시간 누적.
 *
 * FullscreenOverlay(P-4 공통셸) 재사용 — 블러/Esc/바깥클릭 제공.
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { type JSX } from 'react'
import type { SubAgentInfo, SubAgentTranscriptItem } from '../lib/agentSampleData'
import { FullscreenOverlay } from './FullscreenOverlay'
import { IconCheck, IconSearch, IconFile, IconBot } from './icons'
import './SubAgentFullscreen.css'

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

/** 서브에이전트 대화 한 줄 — 텍스트=에이전트 버블, 사고=muted, 도구=도구행. */
function ConvRow({ item, name }: { item: SubAgentTranscriptItem; name: string }): JSX.Element {
  if (item.kind === 'text') {
    return (
      <div className="saf-msg saf-msg--agent">
        <div className="saf-msg-meta">
          <span className="saf-ava" aria-hidden="true">{saIcon(name, 13)}</span>
          <span className="saf-msg-who">{name}</span>
        </div>
        <div className="saf-msg-body">{item.text}</div>
      </div>
    )
  }
  if (item.kind === 'thinking') {
    return (
      <div className="saf-msg saf-msg--thinking">
        <div className="saf-msg-who">생각 중</div>
        <div className="saf-msg-body">{item.text}</div>
      </div>
    )
  }
  /* kind === 'tool' */
  return (
    <div className={'saf-tool-row ' + (item.status ?? 'queued')}>
      <span className="saf-tool-verb">{item.verb}</span>
      {item.target && <span className="saf-tool-target">{item.target}</span>}
      <span className="saf-tool-st">
        {item.status === 'running' && <span className="spin" />}
        {item.status === 'done' && <IconCheck size={12} />}
      </span>
    </div>
  )
}

export function SubAgentFullscreen({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  if (!agent) return null

  const transcript = agent.transcript ?? []
  // 최종 답변(activity)을 대화 마지막 메시지로 — 단, transcript 마지막 text와 같으면 중복 회피.
  const lastText = [...transcript].reverse().find((it) => it.kind === 'text')?.text
  const finalAnswer =
    agent.activity && agent.activity.trim() && agent.activity !== lastText ? agent.activity : ''
  const hasConvo = transcript.length > 0 || finalAnswer.length > 0

  const title = agent.name + ' · ' + SA_STATUS_LABEL[agent.status]

  return (
    <FullscreenOverlay onClose={onClose} title={title}>
      {/* 헤더 메타 — 아이콘 + 이름/역할/상태 */}
      <div className="saf-head">
        <span className={'saf-ic ' + agent.status}>{saIcon(agent.name, 22)}</span>
        <div className="saf-titles">
          <div className="saf-name">{agent.name}</div>
          {agent.role && <div className="saf-role">{agent.role}</div>}
        </div>
        <span className={'saf-status-badge ' + agent.status}>
          {SA_STATUS_LABEL[agent.status]}
        </span>
      </div>

      {/* 채팅 대화 — 작업 지시 → 서브에이전트 흐름 → 최종 답변 (Claude Code CLI식) */}
      <div className="saf-convo">
        {/* 작업 지시(parent → subagent) */}
        {agent.role && (
          <div className="saf-msg saf-msg--task">
            <div className="saf-msg-who">작업</div>
            <div className="saf-msg-body">{agent.role}</div>
          </div>
        )}

        {/* 서브에이전트 흐름(transcript 실시간 누적) */}
        {transcript.map((item, i) => (
          <ConvRow key={i} item={item} name={agent.name} />
        ))}

        {/* 최종 답변(정제된 activity) */}
        {finalAnswer && (
          <div className="saf-msg saf-msg--agent">
            <div className="saf-msg-meta">
              <span className="saf-ava" aria-hidden="true">{saIcon(agent.name, 13)}</span>
              <span className="saf-msg-who">{agent.name}</span>
            </div>
            <div className="saf-msg-body">{finalAnswer}</div>
          </div>
        )}

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
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
