export type AIPostDraft = {
  title: string
  excerpt?: string
  body: string
}

export type GenerateOptions = {
  minChars?: number
  styleGuidelines?: string
}

export interface AIGenerator {
  readonly name: string
  generateVariant(input: {
    sourceTitle: string
    sourceBody: string
    context?: string
    images?: string[]
    videos?: string[]
  }, opts?: GenerateOptions): Promise<AIPostDraft>
  finalize(input: {
    variants: AIPostDraft[]
    sourceTitle: string
    sourceBody: string
    context?: string
  }, opts?: GenerateOptions): Promise<AIPostDraft & { provider?: string; model?: string }>
}
