import type { JSX } from 'react'
import { getProviderBrand } from '../../lib/providerBrand'
import { getTheme } from '../../lib/theme'
import { IconClaude, type IconProps } from './icons'

export interface ProviderBrandIconProps extends IconProps {
  provider?: string
}

export function ProviderBrandIcon({ provider = 'claude-code', size, ...rest }: ProviderBrandIconProps): JSX.Element {
  const brand = getProviderBrand(provider, getTheme())
  if (brand.kind === 'logo') {
    const px = size ?? 18
    return <img src={brand.src} alt={brand.alt} width={px} height={px} aria-hidden="true" />
  }
  return <IconClaude size={size} {...rest} />
}
