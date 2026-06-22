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
