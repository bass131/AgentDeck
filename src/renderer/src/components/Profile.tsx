/**
 * Profile.tsx — 닉네임 + 아바타 색 온보딩 화면 (F12-03).
 *
 * 원본 AgentCodeGUI Profile.tsx 1:1 시각 이식 + 적응.
 *
 * 적응 (디자인-우선, 새 IPC 0):
 *   - props { initial, onEnter } — 시각(로컬). 실 저장 = M5.
 *   - window.api 호출 0.
 *   - ⚠️ TitleBar 중첩 회피: 원본은 자체 <TitleBar>를 렌더하나
 *     우리 Shell이 이미 TitleBar 렌더 → Profile은 TitleBar 생략.
 *     login-body만 렌더 (Shell win 위 오버레이로 띄움).
 *
 * avatarColor/swatch 인라인 동적색 허용 (사용자별 고유 색 → 토큰 부적합,
 * F8/F12-03 설계 예외, 안티슬롭 비위반).
 * 그 외 인라인 색상 0.
 *
 * CRITICAL: 인라인 색상 0 (avatarColor/swatch 예외). window.api 0.
 */
import { useState, type JSX } from 'react'
import { AVATAR_PALETTE } from '../lib/avatarColor'
import { IconCode } from './icons'
import './Profile.css'

// ── 피처 목록 (원본 동일) ───────────────────────────────────────────────
const svg = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const FEATURES = [
  {
    icon: (
      <svg {...svg}>
        <rect x={3} y={4} width={18} height={16} rx={2.5} />
        <path d="M3 8.5h18" />
        <path d="M9.5 12l-2 2.5 2 2.5" />
        <path d="M14.5 12l2 2.5-2 2.5" />
      </svg>
    ),
    text: '여러 코드 에디터 동시 연결',
  },
  {
    icon: (
      <svg {...svg}>
        <rect x={4} y={8} width={16} height={12} rx={3} />
        <path d="M12 8V4.5" />
        <circle cx={12} cy={3.5} r={1} />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M9 13v2" />
        <path d="M15 13v2" />
      </svg>
    ),
    text: '에이전트 작업 투명하게 추적',
  },
  {
    icon: (
      <svg {...svg}>
        <path d="M22 12h-4l-3 8-6-16-3 8H2" />
      </svg>
    ),
    text: '변경 사항 실시간 추적',
  },
  {
    icon: (
      <svg {...svg}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1-3.6A8.4 8.4 0 1 1 21 11.5z" />
      </svg>
    ),
    text: '대화 내역 저장',
  },
]

// ── 사용자 프로필 타입 ──────────────────────────────────────────────────
export interface UserProfile {
  nickname: string
  color: string
}

export interface ProfileProps {
  /** 저장된 프로필 (재방문) 또는 null (첫 방문) */
  initial: UserProfile | null
  /** 입장하기 클릭 시 콜백 */
  onEnter: (profile: UserProfile) => void
}

/**
 * Profile — 닉네임 + 아바타 색 선택 폼.
 *
 * ⚠️ 자체 TitleBar 없음 — Shell이 이미 렌더.
 * login-body 만 렌더 (풀윈도우 오버레이는 Shell이 제어).
 */
export function Profile({ initial, onEnter }: ProfileProps): JSX.Element {
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [color, setColor] = useState(initial?.color ?? AVATAR_PALETTE[0])

  const trimmed = nickname.trim()
  // 이니셜: 닉네임 첫 글자 대문자, 없으면 '?'
  const avatarText = trimmed.slice(0, 1).toUpperCase() || '?'
  const returning = !!initial

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!trimmed) return
    onEnter({ nickname: trimmed, color })
  }

  return (
    <div className="login-body">
      {/* 브랜드 패널 */}
      <div className="lg-brand">
        <div className="top">
          <div className="mark">
            <IconCode size={21} stroke={2.2} />
          </div>
          <div className="wd">
            AgentDeck<span className="sub">Coding Agent · v1.0</span>
          </div>
        </div>
        <div className="mid">
          <div className="head">
            코드 곁의 <em>AI 에이전트</em>,<br />
            터미널 없이 화면으로.
          </div>
          <ul className="feats">
            {FEATURES.map((f, i) => (
              <li key={i}>
                <span className="fi">{f.icon}</span> {f.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 폼 패널 */}
      <div className="lg-form-wrap">
        <form className="lg-form" onSubmit={submit} autoComplete="off">
          <div className="title">{returning ? '다시 오셨네요' : '시작하기'}</div>
          <div className="desc">
            {returning
              ? '닉네임과 색은 언제든 바꿀 수 있어요.'
              : '표시할 닉네임과 아바타 색을 정해 주세요.'}
          </div>

          {/* 아바타 미리보기 */}
          <div className="pf-preview">
            {/* avatarColor 인라인: 사용자별 동적 색 → 토큰 부적합 (F12-03 설계 예외). */}
            <div className="pf-ava" style={{ background: color }}>
              {avatarText}
            </div>
            <div className="pf-preview-meta">
              <div className="pf-preview-name">{trimmed || '닉네임'}</div>
              <div className="pf-preview-sub">미리보기</div>
            </div>
          </div>

          {/* 닉네임 필드 */}
          <div className="field">
            <label htmlFor="nickname">닉네임</label>
            <div className="ctrl">
              <span className="ic">
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx={12} cy={8} r={4} />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <input
                id="nickname"
                type="text"
                placeholder="예: 홍길동"
                autoFocus
                maxLength={20}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          </div>

          {/* 아바타 색 스와치 */}
          <div className="field">
            <label>아바타 색</label>
            <div className="pf-swatches">
              {AVATAR_PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={'pf-swatch' + (c === color ? ' on' : '')}
                  /* avatarColor 인라인: 동적 사용자 색 → 토큰 부적합 (설계 예외). */
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`색상 ${c}`}
                  aria-pressed={c === color}
                >
                  {c === color && (
                    <svg
                      width={13}
                      height={13}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={3.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 입장하기 */}
          <button type="submit" className="submit" disabled={!trimmed}>
            입장하기
            <svg
              width={17}
              height={17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

export default Profile
