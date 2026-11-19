// 패널 하네스 — 패널 카드(PanelView) 여러 장을 세션 기계(usePanelSlot)에 붙여 그린다.
// M10 G1에서 멀티 에이전트 화면을 지웠지만, 패널 세션 기계·PanelView는 G3 세션 탭이 다시 쓰려고 남겼다.
// 그 기계를 보던 시험은 멀티 화면 대신 이 하네스로 그린다. 패널 한 장은 `.ma-panel[data-slot=n]`이다(PanelView 그대로).
import type { JSX } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { PanelView } from '@renderer/05_Conversation/PanelView'
import { usePanelSlot } from '@renderer/03_Agent/state/panelSession'
import { useAppStore, selectWorkspaceRoot, selectProjectFiles } from '@renderer/00_App/appStore'

export interface PanelHarnessOptions {
  // 패널 세션 범위 id — 세션 키는 multi:<sessionId>:slot:<n>(sessionKeys 그대로)
  sessionId?: string
  // 그릴 패널 수 — 슬롯 0..count-1
  count?: number
  onSlashAsk?: () => void
  onOpenImage?: (images: string[], index: number) => void
}

const noop = (): void => {}

function HarnessSlot({ sessionId, slot, onSlashAsk, onOpenImage }: { sessionId: string; slot: number } & PanelHarnessOptions): JSX.Element {
  const session = usePanelSlot(sessionId, slot)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const projectFiles = useAppStore(selectProjectFiles)
  return (
    <PanelView
      slot={slot}
      panel={{ title: `패널 ${slot + 1}`, status: 'idle', cwd: workspaceRoot ?? '', ctxPct: 0 }}
      session={session}
      workspaceRoot={workspaceRoot}
      onExpand={noop}
      onPrompt={noop}
      onPickFolder={noop}
      mentionFiles={projectFiles}
      onSlashAsk={onSlashAsk}
      onOpenImage={onOpenImage}
    />
  )
}

export function PanelHarness({ sessionId = 'harness', count = 4, onSlashAsk, onOpenImage }: PanelHarnessOptions): JSX.Element {
  return (
    <div className="panel-harness">
      {Array.from({ length: count }, (_, slot) => (
        <HarnessSlot key={slot} sessionId={sessionId} slot={slot} onSlashAsk={onSlashAsk} onOpenImage={onOpenImage} />
      ))}
    </div>
  )
}

export function renderPanels(opts: PanelHarnessOptions = {}): RenderResult {
  return render(<PanelHarness {...opts} />)
}
