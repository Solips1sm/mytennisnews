export type DraftVariant = {
  title: string
  excerpt?: string
  body: string
}

export type GenerateArticleOptions = {
  strategy?: 'single' | 'variant' | 'final'
  variantHint?: string
  label?: string
  temperature?: number
  retryTemperature?: number
  minTarget?: number
  variants?: DraftVariant[]
}

export type GenerateArticleBundleOptions = {
  variantCount?: number
  variantHints?: string[]
  sourceName?: string | null
}

export type LinkReference = {
  text: string
  url: string
  context?: string
  order?: number
  token?: string
}

export type MediaReference = {
  token: string
  type: 'image' | 'video' | 'embed'
  url?: string
  description?: string
  caption?: string
  html?: string
  context?: string
  order?: number
}

export interface AIPipelineProvider {
  name: string
  generateArticle(input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }, options?: GenerateArticleOptions): Promise<DraftVariant>
  generateArticleBundle?(input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }, options?: GenerateArticleBundleOptions): Promise<{ variants: DraftVariant[]; final: DraftVariant }>
}
