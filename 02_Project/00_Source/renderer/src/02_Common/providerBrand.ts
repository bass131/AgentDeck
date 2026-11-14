import type { Theme } from './theme'
import claudeSparkClay from '../assets/brand/claude-spark-clay.svg'
import openaiBlossomBlack from '../assets/brand/openai-blossom-black.svg'
import openaiBlossomWhite from '../assets/brand/openai-blossom-white.svg'

export interface ProviderBrandLogo {
  kind: 'logo'
  src: string
  alt: string
  displayName: string
}

export interface ProviderBrandFallback {
  kind: 'fallback'
  displayName: string
}

export type ProviderBrandDescriptor = ProviderBrandLogo | ProviderBrandFallback

export function getProviderBrand(providerId: string, theme: Theme): ProviderBrandDescriptor {
  if (providerId === 'claude-code') {
    return { kind: 'logo', src: claudeSparkClay, alt: '', displayName: 'Claude' }
  }
  if (providerId === 'codex') {
    const src = theme === 'dark' ? openaiBlossomWhite : openaiBlossomBlack
    return { kind: 'logo', src, alt: '', displayName: 'Codex' }
  }
  return { kind: 'fallback', displayName: providerId }
}
