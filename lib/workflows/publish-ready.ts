import { serverClient } from '../sanity'

type PublishedDoc = Record<string, any> & { _id: string; _type: string; status: string; publishedAt: string }

export type PublishSummary = {
  totalCandidates: number
  published: number
  skipped: number
  errors: number
}

export type PublishOptions = {
  dryRun?: boolean
  logger?: Console
}

function sanitizePublishedDoc(draft: Record<string, any>, publishedId: string, publishedAt: string): PublishedDoc {
  const doc: PublishedDoc = {
    _id: publishedId,
    _type: 'article',
    status: 'published',
    publishedAt,
  }
  for (const [key, value] of Object.entries(draft)) {
    if (key.startsWith('_')) continue
    if (key === 'status' || key === 'publishedAt') continue
    doc[key] = value
  }
  return doc
}

function hasPublishableAiBody(draft: Record<string, any>): boolean {
  const value = draft.aiFinal?.body
  if (!value) return false
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

export async function publishReadyArticles(options: PublishOptions = {}): Promise<PublishSummary> {
  const logger = options.logger ?? console
  const drafts: Array<Record<string, any>> = await serverClient.fetch(
  `*[_type == "article" && _id in path("drafts.**") && length(coalesce(aiFinal.body, "")) > 0 && status != "published"]{
      _id,
      _type,
      title,
      slug,
      publishedAt,
      aiFinal,
      aiVariants,
      canonicalUrl,
      source,
      excerpt,
      leadImageUrl,
      mediaCredits,
      body,
      externalHtml,
      authors,
      tags,
      status
    }`
  )

  const totalCandidates = drafts.length
  if (!totalCandidates) {
    logger.log('[publish] No drafts ready for publication')
    return { totalCandidates, published: 0, skipped: 0, errors: 0 }
  }

  let published = 0
  let skipped = 0
  let errors = 0

  for (const draft of drafts) {
    const draftId = draft._id as string
    const publishedId = draftId.replace(/^drafts\./, '')
    const slug = draft.slug?.current
    const hasBody = hasPublishableAiBody(draft)
    logger.log('[publish] evaluate', {
      draftId,
      slug,
      status: draft.status,
      hasAiBody: hasBody,
    })
    if (!hasBody) {
      logger.warn('[publish] Skipping draft without usable AI body', draftId)
      skipped++
      continue
    }
    if (!slug) {
      logger.warn('[publish] Skipping draft without slug', draftId)
      skipped++
      continue
    }
    const publishedAt = draft.publishedAt || new Date().toISOString()
    const doc = sanitizePublishedDoc(draft, publishedId, publishedAt)
    try {
      if (options.dryRun) {
        logger.log('[publish] Would publish', publishedId)
        skipped++
      } else {
        await serverClient.createOrReplace(doc)
        await serverClient.patch(draftId).set({ status: 'published', publishedAt }).commit()
        logger.log('[publish] Published', publishedId, {
          provider: draft.aiFinal?.provider,
          model: draft.aiFinal?.model,
        })
        published++
      }
    } catch (err: any) {
      logger.error('[publish] Failed to publish', draftId, err?.message || err)
      errors++
    }
  }

  return { totalCandidates, published, skipped, errors }
}
