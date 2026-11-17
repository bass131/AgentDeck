// 컨트롤 패널 (M07 G5) — G8 설계 `01_Milestones/M06_SelfDev/81_G8-컨트롤-설계/30_노드-구조.md` 「공통 GUI」.
// 노드를 지점별로 묶어 보이고, 잠금이 풀린 노드만 켜고 끈다. 토글은 다음 실행부터 반영된다.
// 맨 위의 바뀜 경고는 둘이다 — controls.json 봉인(확인 버튼)과 엔진 봉인(G4, 그 엔진 다시 고르기).
import { useState, useEffect, useCallback, type JSX } from 'react'
import { IconAlert } from '@renderer/02_Common/icons'
import type { ControlsState, ControlNodeView } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import './ControlsView.css'

const POINTS: { id: ControlNodeView['point']; label: string; sub: string }[] = [
  { id: 'canUseTool', label: '도구 호출 판정', sub: '권한 콜백 — 위에서부터 보고, 처음 정한 노드가 이긴다. 아무도 정하지 않으면 카드다.' },
  { id: 'permissionRules', label: '세션 규칙', sub: '세션을 열 때 넣는 인라인 거부 규칙' },
  { id: 'preToolUse', label: '도구 호출 전 훅', sub: 'SDK 훅 콜백 — 실패하거나 시간을 넘기면 막는다' },
]

const JUDGE: Record<ControlNodeView['judge'], string> = { rule: '규칙', model: '모델', human: '사람' }
const RESULT: Record<string, string> = { allow: '허용', ask: '카드', deny: '거부', notify: '통보', transition: '상태 전이' }

function engineWarning(engine: ControlsState['engine']): { text: string; reselect: boolean } | null {
  const v = engine.active ? `v${engine.active}` : '고른 엔진'
  switch (engine.seal) {
    case 'mismatch':
      return { text: `${v}이 앱 밖에서 바뀌어 번들 엔진을 쓰고 있습니다. 지금 내용을 확인했다면 다시 고르세요.`, reselect: engine.active !== null }
    case 'missing':
      return { text: `${v}의 봉인이 없어 번들 엔진을 쓰고 있습니다. 이 엔진을 쓰려면 다시 고르세요.`, reselect: engine.active !== null }
    case 'below-floor':
      return { text: `${v}이 번들 엔진보다 낮아 번들 엔진을 씁니다.`, reselect: false }
    case 'restart':
      return { text: `다시 고른 ${v}은 앱을 재시작하면 쓰입니다.`, reselect: false }
    default:
      return null
  }
}

interface NodeRowProps {
  node: ControlNodeView
  frozen: boolean
  onToggle: (node: ControlNodeView) => void
}

function NodeRow({ node, frozen, onToggle }: NodeRowProps): JSX.Element {
  const disabled = node.locked || frozen
  return (
    <div className={'ext-item ctl-node' + (node.enabled ? '' : ' off')}>
      <div className="ext-main">
        <div className="ext-top">
          <span className="ext-name">{node.name}</span>
          <span className={'ctl-badge prot-' + node.protection.toLowerCase()}>{node.protection}</span>
          <span className="ctl-badge">{JUDGE[node.judge]}</span>
          {node.locked && <span className="ctl-badge lock">잠금</span>}
        </div>
        <div className="ext-desc">
          결과: {node.results.map((r) => RESULT[r] ?? r).join(' · ')}
          {node.timeoutMs !== null && ` · 시간 상한 ${node.timeoutMs / 1000}초`}
          {' · '}
          <code>{node.id}</code>
        </div>
      </div>
      <button
        type="button"
        className={'skill-toggle' + (node.enabled ? ' on' : '')}
        role="switch"
        aria-checked={node.enabled}
        aria-label={node.name + (node.locked ? ' (잠금)' : node.enabled ? ' 끄기' : ' 켜기')}
        disabled={disabled}
        onClick={() => onToggle(node)}
      >
        <span className="skill-knob" />
      </button>
    </div>
  )
}

export function ControlsView(): JSX.Element {
  const [state, setState] = useState<ControlsState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setState(await ipc.settings.controlsState())
    } catch (err) {
      setError(`컨트롤 상태를 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (node: ControlNodeView): Promise<void> => {
      setError(null)
      const r = await ipc.settings.setControlEnabled({ id: node.id, enabled: !node.enabled })
      if (!r.ok) setError(r.error ?? '바꾸지 못했습니다.')
      await load()
    },
    [load]
  )

  const confirm = useCallback(async (): Promise<void> => {
    setError(null)
    const r = await ipc.settings.confirmControls()
    if (!r.ok) setError(r.error ?? '확인하지 못했습니다.')
    await load()
  }, [load])

  const reselectEngine = useCallback(
    async (version: string): Promise<void> => {
      setError(null)
      const r = await ipc.engine.setActive({ version })
      if (!r.ok) setError(r.error ?? '엔진을 다시 고르지 못했습니다.')
      await load()
    },
    [load]
  )

  const tampered = state !== null && state.status !== 'none' && state.status !== 'ok'
  const engineWarn = state ? engineWarning(state.engine) : null

  return (
    <>
      <div className="set-h1">컨트롤</div>
      <div className="set-h1-sub">
        에이전트의 도구 호출을 판정하는 노드들입니다. 잠금이 풀린 노드는 끌 수 있고, 끄면 그 호출이 카드로 와서 더 엄격해집니다.
      </div>

      {tampered && (
        <div className="ctl-warn" role="alert">
          <IconAlert size={16} />
          <div className="ctl-warn-main">
            <div>컨트롤 설정(controls.json)이 앱 밖에서 바뀌었습니다. 확인할 때까지 Claude 실행이 열리지 않습니다.</div>
            <div className="ctl-warn-sub">아래 켜짐 상태가 지금 파일 내용입니다. 이대로 쓰려면 확인하세요.</div>
          </div>
          <button type="button" className="inst-btn" onClick={() => void confirm()}>
            지금 내용으로 확인
          </button>
        </div>
      )}

      {engineWarn && (
        <div className="ctl-warn" role="alert">
          <IconAlert size={16} />
          <div className="ctl-warn-main">{engineWarn.text}</div>
          {engineWarn.reselect && state?.engine.active && (
            <button type="button" className="inst-btn" onClick={() => void reselectEngine(state.engine.active as string)}>
              이 엔진 다시 고르기
            </button>
          )}
        </div>
      )}

      {error && <div className="ctl-error">{error}</div>}

      {state === null ? (
        <div className="set-empty">불러오는 중...</div>
      ) : (
        POINTS.map((p) => {
          const nodes = state.nodes.filter((n) => n.point === p.id)
          if (nodes.length === 0) return null
          return (
            <div className="sec" key={p.id} data-point={p.id}>
              <div className="set-h2">{p.label}</div>
              <div className="set-note ctl-point-sub">{p.sub}</div>
              <div className="ext-list">
                {nodes.map((n) => (
                  <NodeRow key={n.id} node={n} frozen={tampered} onToggle={(x) => void toggle(x)} />
                ))}
              </div>
            </div>
          )
        })
      )}

      <div className="set-note">
        토글은 다음 실행부터 반영됩니다. 이어지는 세션은 새로 열 때 반영됩니다. 저장소 훅(<code>.claude/hooks/</code>)은 여기서 바꾸지 않습니다.
      </div>
    </>
  )
}
