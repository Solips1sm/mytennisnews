export type DraftVariant = {
  title: string
  excerpt?: string
  body: string
}

export type LinkReference = {
  text: string
  url: string
  context?: string
}

export type MediaReference = {
  token: string
  type: 'image' | 'video' | 'embed'
  url?: string
  description?: string
  caption?: string
  html?: string
}

export interface AIPipelineProvider {
  name: string
  generateVariants(input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }, count: number): Promise<DraftVariant[]>
  synthesizeFinal(variants: DraftVariant[], input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }): Promise<DraftVariant>
}

export function resolveVariantTargetCount(sourceName?: string | null): number {
  const normalized = (sourceName || '').toLowerCase()
  if (!normalized) return 5
  if (normalized.includes('espn')) return 4
  if (normalized.includes('atp') || normalized.includes('wta')) return 3
  return 5
}
