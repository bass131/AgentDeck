/**
 * PermissionCard.tsx — 도구 사용 승인 요청 인라인 카드 (BF3 Phase 06, ADR-030).
 *
 * ADR-030(영호 확정 2026-07-03): 원본 미러 중앙 모달(PermissionModal, `.q-overlay` 풀오버레이)을
 * 폐기하고 컴포저 바로 위 인라인 카드로 전환한다 — 권한 대기 중에도 ■(중단) 버튼이 항상
 * 노출·클릭 가능해야 하고(BF2 probe S2' 요구), 대화 맥락을 가리지 않아야 한다(Claude Desktop
 * 패턴). LoopStatusBanner의 "pending 없으면 null" 한 자리 배너 패턴을 그대로 준용한다.
 *
 * 단일챗(Conversation.tsx)·멀티패널(PanelView.tsx) 양쪽에 동일 컴포넌트를 마운트한다
 * (1 컴포넌트 2 마운트 지점 — 로직 중복 금지, Phase 06 멀티패널 배선 요구). 데이터 흐름은
 * pendingPermission 슬롯 + onRespond 콜백뿐 — window.api 호출은 호출부(store 액션/훅)에서만.
 *
 * 키보드(숫자 1·2·3·Esc): 카드 자신의 DOM 컨테이너에만 native keydown 리스너를 붙인다
 * (window/document 전역 리스너 금지). 리스너를 컨테이너 노드 자체에 addEventListener하면
 * 브라우저 이벤트 버블링 구조상 그 서브트리 밖에서 발생한 keydown은 애초에 도달하지 않는다 —
 * 그래서 (a) 컴포저 등 카드 밖 입력에서 타이핑 중인 숫자키가 오발동하지 않고, (b) 멀티패널에서
 * 카드 2개가 동시에 떠 있어도 "포커스(=DOM focus)가 가 있는 카드"만 반응한다(전역 리스너였다면
 * 두 인스턴스가 같은 keydown을 동시에 받아 중복 응답하는 문제가 생겼을 것).
 * 마운트 시 다른 입력(textarea/input/contenteditable)에 포커스가 없을 때만 카드에 자동
 * 포커스해 "클릭 없이 바로 숫자키" 편의를 보존하되, 사용자가 예약 메시지를 타이핑 중(22d 큐)
 * 이면 포커스를 뺏지 않는다(ADR-030 "모달의 강제 집중력 상실" 트레이드오프의 완화책).
 *
 * CRITICAL: window.api 0 — 순수 프레젠테이션 + 로컬 키보드. 응답은 부모(onRespond)에 위임.
 * 인라인 색상 0 — 예외: q-num 배경색만 PERM_CHOICES 고정 팔레트 상수(F8 avatarColor 예외와
 * 동일 근거: 고정 팔레트 상수, window.api 0, 주석 교차참조).
 *
 * reviewer 🟡 봉합(BF3 P06 스크린샷 전 게이트):
 *   - informed-consent: 구 모달의 선택지 설명("이번 세션 동안 이 도구를 자동 허용해요" 등)이
 *     PERM_CHOICES.desc로 복원 — 버튼 title/aria-label + 라벨 아래 작은 캡션(.perm-card-opt-desc)
 *     으로 시각 노출(카드 밀도는 opt당 2줄로 소폭 증가하되 3버튼 균일해 레이아웃 왜곡 없음).
 *   - aria-live: 카드 루트에 aria-live="polite" — 컴포저 포커스를 뺏지 않는 정책(아래 자동
 *     포커스 가드)은 유지하되, 스크린리더 사용자에게는 카드 등장을 통지해야 하므로 별도 부여.
 */
import { useEffect, useRef, type JSX } from 'react'
import { IconShieldChk } from '../common/icons'
import type { PendingPermission } from '../../store/reducer'
import './PermissionCard.css'

/** 권한 응답 종류 — shared PermissionResponse['behavior']와 동형(값 그대로 전달). */
export type PermissionChoice = 'allow' | 'allow_always' | 'deny'

// 고정 팔레트 상수 — q-num 배경 인라인 허용 (F8 avatarColor 예외와 동일 근거)
// desc: 구 모달(PermissionModal)의 선택지 설명 복원 — informed consent(reviewer 🟡 봉합).
// title/aria-label(항상 노출) + .perm-card-opt-desc 캡션(시각 노출) 양쪽에 쓰인다.
const PERM_CHOICES: { key: PermissionChoice; label: string; desc: string; color: string }[] = [
  { key: 'allow',        label: '허용',       desc: '이번 한 번만 실행을 허용해요',            color: 'var(--green)'  },
  { key: 'allow_always', label: '항상 허용',  desc: '이번 세션 동안 이 도구를 자동 허용해요', color: 'var(--accent)' },
  { key: 'deny',         label: '거부',       desc: '이 작업을 실행하지 않아요',              color: 'var(--red)'    },
]

/** 입력 필드(텍스트/에디터블) 포커스 여부 — 자동 포커스가 컴포저 타이핑을 뺏지 않도록 가드. */
function isInputFocused(): boolean {
  const ae = document.activeElement as HTMLElement | null
  return !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)
}

export interface PermissionCardProps {
  /** 대기 중인 권한 요청 — null이면 카드 미렌더(LoopStatusBanner "none→null" 패턴 준용). */
  pending: PendingPermission | null
  /** 사용자 선택 콜백 — 응답 IPC/슬롯 정리는 호출부(store 액션/panelSession 훅)가 담당. */
  onRespond: (choice: PermissionChoice) => void
}

export function PermissionCard({ pending, onRespond }: PermissionCardProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)

  // onRespond는 호출부(Conversation.tsx/PanelView.tsx)에서 매 렌더 새로 만들어지는 인라인
  // 콜백이라 참조가 매번 바뀐다 — ref로 최신값만 따로 들고, 아래 keydown 이펙트의 deps에서는
  // 뺀다. 그래야 스트리밍 중 부모가 재렌더될 때마다(pending 자체는 안 바뀌었는데) 이펙트가
  // 재실행돼 리스너를 떼었다 다시 붙이거나 포커스를 반복 재탈취하는 것을 막는다.
  const onRespondRef = useRef(onRespond)
  onRespondRef.current = onRespond

  // 카드 컨테이너 스코프 keydown — window/document 전역 리스너 금지(위 주석 참조).
  // deps=[pending]만 — 새 권한 요청이 도착할 때(pending 참조 교체)만 재실행.
  useEffect(() => {
    if (!pending) return
    const el = rootRef.current
    if (!el) return

    // 자동 포커스: 다른 입력에 포커스가 없을 때만(컴포저 예약메시지 타이핑 보존).
    if (!isInputFocused()) el.focus()

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        // Esc → 거부. preventDefault 금지(모달 체인 Esc 회귀 방지 정책은 useGlobalShortcuts 참조 —
        // 이 카드는 모달이 아니지만 동일 관례를 유지한다).
        onRespondRef.current('deny')
        return
      }
      const n = parseInt(e.key, 10)
      if (Number.isInteger(n) && n >= 1 && n <= PERM_CHOICES.length) {
        e.preventDefault()
        onRespondRef.current(PERM_CHOICES[n - 1].key)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  return (
    <div
      className="perm-card"
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label="도구 사용 승인 요청"
      aria-live="polite"
    >
      <div className="perm-card-head">
        <span className="perm-card-ic" aria-hidden="true">
          <IconShieldChk size={17} />
        </span>
        <div className="perm-card-text">
          <span className="perm-card-title">도구 사용 승인 요청</span>
          {pending.toolName && <span className="perm-card-tool">{pending.toolName}</span>}
        </div>
      </div>

      {pending.summary && <div className="perm-card-sum">{pending.summary}</div>}

      <div className="perm-card-opts">
        {PERM_CHOICES.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className="perm-card-opt"
            data-perm-choice={c.key}
            title={c.desc}
            aria-label={`${c.label} — ${c.desc}`}
            onClick={() => onRespond(c.key)}
          >
            {/* q-num: QuestionModal.css 공유 구조 스타일(코로케이션, 상단 주석 참조) —
                배경만 고정 팔레트 상수 인라인(F8 avatarColor 예외와 동일 근거) */}
            <span className="q-num" style={{ background: c.color, color: 'var(--on-accent)' }}>
              {i + 1}
            </span>
            <span className="perm-card-opt-text">
              <span className="perm-card-opt-label">{c.label}</span>
              <span className="perm-card-opt-desc">{c.desc}</span>
            </span>
          </button>
        ))}
        <span className="perm-card-hint">숫자 키 · Esc 거부</span>
      </div>
    </div>
  )
}

export default PermissionCard
