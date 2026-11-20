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

function engineWarning(engine: NonNullable<ControlsState['engine']>): { text: string; reselect: boolean } | null {
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

// 바뀜 경고의 문장 — 상태와 파일을 읽을 수 있는지로 갈린다(G5 검수 중요 2·사소 4)
function controlsWarning(state: ControlsState): { main: string; sub: string; confirm: boolean } | null {
  if (state.status === 'error') {
    return {
      main: `컨트롤 설정(controls.json)을 읽지 못했습니다(${state.error ?? '알 수 없는 오류'}). 고칠 때까지 Claude 실행이 열리지 않습니다.`,
      sub: 'userData 폴더의 파일 권한이나 같은 이름의 폴더를 확인한 뒤 이 화면을 다시 여세요.',
      confirm: false,
    }
  }
  if (state.status === 'none' || state.status === 'ok') return null
  return {
    main: '컨트롤 설정(controls.json)이 앱 밖에서 바뀌었습니다. 확인할 때까지 Claude 실행이 열리지 않습니다.',
    sub: state.fileReadable
      ? '아래 켜짐 상태가 지금 파일 내용입니다. 이대로 쓰려면 확인하세요.'
      : '파일이 없거나 읽을 수 없습니다. 확인하면 전부 켬(기본값)으로 다시 씁니다.',
    confirm: true,
  }
}

export function ControlsView(): JSX.Element {
  const [state, setState] = useState<ControlsState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 요청 중인 토글 — 응답 전 두 번 누르면 묵은 켜짐으로 같은 요청이 두 번 나간다(G5 검수 사소 7)
  const [pending, setPending] = useState<string | null>(null)

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
      setPending(node.id)
      try {
        const r = await ipc.settings.setControlEnabled({ id: node.id, enabled: !node.enabled })
        if (!r.ok) setError(r.error ?? '바꾸지 못했습니다.')
        await load()
      } finally {
        setPending(null)
      }
    },
    [load]
  )

  // 확인은 화면에 보인 꺼진 노드를 함께 보낸다 — main은 지금 파일과 같을 때만 봉인한다
  const confirm = useCallback(
    async (seen: ControlsState): Promise<void> => {
      setError(null)
      const disabled = seen.nodes.filter((n) => !n.locked && !n.enabled).map((n) => n.id)
      const r = await ipc.settings.confirmControls({ disabled })
      if (!r.ok) setError(r.error ?? '확인하지 못했습니다.')
      await load()
    },
    [load]
  )

  const reselectEngine = useCallback(
    async (version: string): Promise<void> => {
      setError(null)
      const r = await ipc.engine.setActive({ version })
      if (!r.ok) setError(r.error ?? '엔진을 다시 고르지 못했습니다.')
      await load()
    },
    [load]
  )

  const warn = state ? controlsWarning(state) : null
  const engineWarn = state?.engine ? engineWarning(state.engine) : null

  return (
    <>
      <div className="set-h1">컨트롤</div>
      <div className="set-h1-sub">
        에이전트의 도구 호출을 판정하는 노드들입니다. 잠금이 풀린 노드는 끌 수 있고, 끄면 그 노드가 허용하던 호출이 카드로 옵니다.
        다만 SDK가 먼저 승인하는 호출(Bypass 모드의 모든 호출, 자동 모드에서 SDK 분류기가 승인한 호출, 설정 파일의 허용 규칙,
        SDK가 스스로 안전하다고 보는 명령)은 노드까지 오지 않습니다.
      </div>

      {state && warn && (
        <div className="ctl-warn" role="alert">
          <IconAlert size={16} />
          <div className="ctl-warn-main">
            <div>{warn.main}</div>
            <div className="ctl-warn-sub">{warn.sub}</div>
          </div>
          {warn.confirm && (
            <button type="button" className="inst-btn" onClick={() => void confirm(state)}>
              지금 내용으로 확인
            </button>
          )}
        </div>
      )}

      {engineWarn && (
        <div className="ctl-warn" role="alert">
          <IconAlert size={16} />
          <div className="ctl-warn-main">{engineWarn.text}</div>
          {engineWarn.reselect && state?.engine?.active && (
            <button type="button" className="inst-btn" onClick={() => void reselectEngine(state.engine?.active as string)}>
              이 엔진 다시 고르기
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="ctl-error" role="status" aria-live="polite">
          {error}
        </div>
      )}

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
                  <NodeRow key={n.id} node={n} frozen={warn !== null || pending === n.id} onToggle={(x) => void toggle(x)} />
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
