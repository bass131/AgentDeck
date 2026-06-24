/**
 * SubAgentFullscreen.tsx — 서브에이전트 풀스크린 상세 뷰 (Phase 37 #3, R2).
 *
 * SubAgentModal(F10-02) body 시각구조(sa-* 클래스: activity 섹션 + 도구 sec) 이식 +
 * transcript 타임라인 섹션 추가.
 * FullscreenOverlay(P-4 공통셸) 재사용 — 블러/Esc/바깥클릭은 FullscreenOverlay 제공.
 *
 * SubAgentModal 컴포넌트 삭제 금지(F10-02 시각자산).
 *
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 * 인라인 색상 0 — CSS 변수 토큰만.
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

function TranscriptItemRow({ item }: { item: SubAgentTranscriptItem }): JSX.Element {
  if (item.kind === 'text') {
    return (
      <div className="saf-tr-text">
        {item.text}
      </div>
    )
  }
  if (item.kind === 'thinking') {
    return (
      <div className="saf-tr-thinking">
        {item.text}
      </div>
    )
  }
  /* kind === 'tool' */
  return (
    <div className={'saf-tr-tool ' + (item.status ?? 'queued')}>
      <span className="saf-tr-verb">{item.verb}</span>
      {item.target && <span className="saf-tr-target">{item.target}</span>}
      <span className="saf-tr-st">
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

  const doneCount = agent.tools.filter((t) => t.status !== 'running').length
  const transcript = agent.transcript ?? []

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

      {/* 활동/결과 섹션 — SubAgentModal body 이식 */}
      {agent.activity && (
        <div className="sa-card-sec">
          <div className="sa-card-lbl">
            {agent.status === 'done' ? '결과' : '설명'}
          </div>
          <div className="sa-card-md">{agent.activity}</div>
        </div>
      )}

      {/* 도구 섹션 — SubAgentModal body 이식 */}
      <div className="sa-card-sec">
        <div className="sa-card-lbl">
          도구 {doneCount}/{agent.tools.length}
        </div>
        {agent.tools.length ? (
          <div className="sa-tools">
            {agent.tools.map((t) => (
              <div className={'sa-tool ' + t.status} key={t.id}>
                <span className="sa-tool-verb">{t.verb}</span>
                <span className="sa-tool-target">{t.target}</span>
                <span className="sa-tool-st">
                  {t.status === 'running' ? (
                    <span className="spin" />
                  ) : t.status === 'done' ? (
                    <IconCheck size={12} />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ag-empty">사용한 도구가 없어요</div>
        )}
      </div>

      {/* transcript 타임라인 섹션 — 신규 */}
      <div className="sa-card-sec">
        <div className="sa-card-lbl">
          실행 기록{transcript.length > 0 ? ' (' + transcript.length + '개)' : ''}
        </div>
        {transcript.length ? (
          <div className="saf-transcript">
            {transcript.map((item, i) => (
              <TranscriptItemRow key={i} item={item} />
            ))}
          </div>
        ) : (
          <div className="ag-empty">아직 기록이 없어요</div>
        )}
      </div>
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
