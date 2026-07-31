import { memo, type JSX } from 'react'
import { fileTypeFor } from '../../lib/fileType'
import { IconFile } from '../common/icons'
import './FileBadge.css'

interface FileBadgeProps {
  path: string
  size?: number
}

function FileBadgeInner({ path, size = 15 }: FileBadgeProps): JSX.Element {
  const { label, color } = fileTypeFor(path)

  if (!label) {
    return <IconFile className="ftbadge-generic" size={size} stroke={1.5} />
  }

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
