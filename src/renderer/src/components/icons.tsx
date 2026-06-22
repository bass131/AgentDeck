/**
 * icons.tsx — 공용 벡터 아이콘 (F2-01). 이모지 금지(UI_GUIDE 안티슬롭).
 *
 * Icon 베이스(viewBox 24, stroke=currentColor) + props로 size/stroke 조절.
 * 색은 currentColor 상속(부모 텍스트색) — 인라인 색상 0.
 */
import type { SVGProps, ReactNode, JSX } from 'react'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & {
  /** px 크기 (기본 18) */
  size?: number
  /** stroke 두께 (기본 1.6) */
  stroke?: number
}

function Icon({
  size = 18,
  stroke = 1.6,
  children,
  ...rest
}: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconChevRight = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const IconChevLeft = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
)

export const IconFolderOpen = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" />
    <path d="M3 7v10a2 2 0 0 0 2 2h12.2a2 2 0 0 0 1.94-1.5l1.6-6A2 2 0 0 0 18.8 9H7.06a2 2 0 0 0-1.94 1.5z" />
  </Icon>
)

export const IconFile = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M13 3v5h5" />
  </Icon>
)

export const IconSearch = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
)

export const IconPlus = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconX = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const IconDots = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
)

export const IconEye = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconBolt = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
  </Icon>
)

export const IconPencil = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icon>
)

export const IconSpark = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />
  </Icon>
)

export const IconImage = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </Icon>
)

export const IconArrowUp = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
)

export const IconChevDown = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const IconCheck = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 6" />
  </Icon>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

/** 서버/데이터센터 (MCP) */
export const IconServer = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="2" y="3" width="20" height="6" rx="2" />
    <rect x="2" y="12" width="20" height="6" rx="2" />
    <circle cx="6" cy="6" r="1" />
    <circle cx="6" cy="15" r="1" />
  </Icon>
)

/** 책/도서 (Skill) */
export const IconBook = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Icon>
)

/** 코드 괄호 (LSP) */
export const IconCode = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
)

/** 새로고침 화살표 */
export const IconRefresh = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
)

/** 휴지통/삭제 */
export const IconTrash = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Icon>
)

/** 닫기(X) — Settings 모달 헤더용 별칭 */
export const IconClose = IconX

/** 앱 아이콘(클로드 스파크) — 버전 탭 nav 아이콘 */
export const IconClaude = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
    <path d="M8 12l2.5 2.5L16 9" />
  </Icon>
)

/** 대비/테마 (Appearance) */
export const IconContrast = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 1 0 18" />
  </Icon>
)

/** 단일 에이전트 모드 (sb-mode 토글) */
export const IconSquare = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
  </Icon>
)

/** 멀티 에이전트 모드 (sb-mode 토글) */
export const IconGrid = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </Icon>
)

/** 세션 행 컨텍스트 메뉴 트리거 (⋯, sb-item .more) */
export const IconMore = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

/** 시계 (sched 큐 헤더, 예약 전송 버튼) */
export const IconClock = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </Icon>
)

/** 파일 텍스트 (slash /init 명령어 아이콘) */
export const IconFileText = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M13 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Icon>
)

/** 압축/컴팩트 (slash /compact 명령어 아이콘) */
export const IconCompress = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 14h6v6M20 10h-6V4" />
    <path d="M14 10l7-7M3 21l7-7" />
  </Icon>
)

/** 방패 체크 (slash /security-review 명령어 아이콘) */
export const IconShieldChk = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 2l8 3v5c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
)

/** 오른쪽으로 두 개의 꺾쇠 (RecentFiles 오른쪽 탭 닫기) */
export const IconChevsRight = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 6l6 6-6 6" />
    <path d="M13 6l6 6-6 6" />
  </Icon>
)

/** 다른 탭 닫기 (RecentFiles ctx-menu) */
export const IconCloseOthers = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M18 6L6 18" />
    <path d="M8 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
)

/** 작은 X (RecentFiles cf-x 닫기 버튼) */
export const IconX2 = (p: IconProps): JSX.Element => (
  <Icon {...p} stroke={2.2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

/** 봇/에이전트 아이콘 (AgentPanel 서브에이전트 기본 아이콘) */
export const IconBot = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M12 2v3" />
    <circle cx="12" cy="5" r="2" />
    <path d="M8 11V9a4 4 0 0 1 8 0v2" />
    <path d="M9 15h.01M15 15h.01" />
  </Icon>
)

/** 목록 (AgentPanel 할일 섹션 헤더) */
export const IconList = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </Icon>
)

/** Git 브랜치 (탐색기 git 버튼, GitModal 헤더) */
export const IconGitBranch = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 3v12" />
    <path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </Icon>
)

/** 최대화 (GitModal / 파일뷰어 헤더) */
export const IconMax = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </Icon>
)

/** 이전 크기로 복원 (GitModal / 파일뷰어 헤더, 최대화 해제) */
export const IconRestore = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="10" y1="14" x2="21" y2="3" />
    <line x1="3" y1="21" x2="14" y2="10" />
  </Icon>
)

/** 정보 (PromptModal 노트) */
export const IconInfo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Icon>
)

/** 전송(종이비행기) (AskModal 컴포저) */
export const IconSend = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </Icon>
)

/** 경고 삼각형 (EngineGate / AppUpdateGate error 상태) */
export const IconAlert = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
)
