/**
 * FileBadge.tsx — 파일타입 배지 (F2-01).
 *
 * fileTypeFor(path) 결과로 monogram 칩(타입색) 또는 제네릭 IconFile 렌더.
 * 색은 동적 CSS 변수 `--ft`로 주입(타입별 oklch 식별색) — 하드코딩 hex 0.
 */
import { memo, type JSX } from 'react'
import { fileTypeFor } from '../lib/fileType'
import { IconFile } from './icons'
import './FileBadge.css'

interface FileBadgeProps {
  /** 파일 경로(또는 이름) */
  path: string
  /** 배지 한 변 px (기본 15) */
  size?: number
}

function FileBadgeInner({ path, size = 15 }: FileBadgeProps): JSX.Element {
  const { label, color } = fileTypeFor(path)

  if (!label) {
    // 제네릭 — 외곽선 파일 아이콘
    return <IconFile className="ftbadge-generic" size={size} stroke={1.5} />
  }

  // label 길이에 따라 폰트 축소(3자 이상=더 작게)
  const fontScale = label.length >= 3 ? 0.34 : 0.46
  return (
    <span
      className="ftbadge"
      style={{
        ['--ft' as string]: color,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.round(size * fontScale * 10) / 10}px`,
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

export const FileBadge = memo(FileBadgeInner)
export default FileBadge
