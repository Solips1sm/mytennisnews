export interface SourceLogo {
  src: string
  alt: string
  className?: string
}

const mappings = [
  {
    test: (hostOrName: string) => /(^|\.)espn\.com$/i.test(hostOrName) || /espn/i.test(hostOrName),
    logo: { src: '/logos/espn.svg', alt: 'ESPN', className: 'object-contain p-0.5' } as SourceLogo,
  },
  {
    test: (hostOrName: string) => /(^|\.)atptour\.com$/i.test(hostOrName) || /\batp\b/i.test(hostOrName),
    logo: { src: '/logos/atp.svg', alt: 'ATP Tour', className: 'object-contain p-0.5' } as SourceLogo,
  },
  {
    test: (hostOrName: string) => /(^|\.)wtatennis\.com$/i.test(hostOrName) || /\bwta\b/i.test(hostOrName),
    logo: { src: '/logos/wta.svg', alt: 'WTA', className: 'object-contain p-0.5' } as SourceLogo,
  },
]

export function resolveSourceLogo(canonicalUrl?: string, sourceName?: string): SourceLogo | undefined {
  const host = (() => {
    if (!canonicalUrl) return undefined
    try {
      return new URL(canonicalUrl).hostname
    } catch {
      return undefined
    }
  })()
  const key = host || sourceName || ''
  for (const m of mappings) {
    if (m.test(key)) return m.logo
  }
  return undefined
}
