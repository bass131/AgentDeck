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
