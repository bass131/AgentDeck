import './shell.css'

/**
 * 3-pane 셸 (Phase 01 골격).
 * 좌: 파일탐색기 / 중앙: 대화 / 우: 에이전트 상태.
 * Phase 05(renderer-shell)에서 각 pane에 실제 컴포넌트가 채워진다.
 * ⚠️ 백엔드 라벨은 고정 텍스트, 토큰 게이지는 빈 placeholder (B8/A3=M2).
 */
export default function Shell(): JSX.Element {
  return (
    <div className="shell">
      <header className="titlebar">
        <span className="workspace">AgentDeck</span>
        <span className="spacer" />
        <span className="backend">엔진: Claude Code</span>
        <span className="gauge" aria-hidden />
      </header>

      <div className="panes">
        <aside className="pane left">
          <div className="pane-head">탐색기</div>
          <div className="pane-empty">폴더를 여세요</div>
        </aside>

        <main className="pane center">
          <div className="pane-head">대화</div>
          <div className="pane-empty">에이전트에게 작업을 지시하세요</div>
        </main>

        <aside className="pane right">
          <div className="pane-head">에이전트 상태</div>
          <div className="pane-empty">진행 중 작업 없음</div>
        </aside>
      </div>

      <footer className="statusbar">
        <span>
          <span className="dot" />준비됨
        </span>
        <span>변경 0</span>
        <span>main</span>
      </footer>
    </div>
  )
}
