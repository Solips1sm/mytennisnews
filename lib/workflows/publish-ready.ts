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

export async function publishReadyArticles(options: PublishOptions = {}): Promise<PublishSummary> {
  const logger = options.logger ?? console
  const drafts: Array<Record<string, any>> = await serverClient.fetch(
    `*[_type == "article" && _id in path('drafts.**') && defined(aiFinal.body) && aiFinal.body != ""]{
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

  if (options.dryRun) {
    drafts.forEach((draft) => logger.log('[publish] Would publish', draft._id))
    return { totalCandidates, published: 0, skipped: totalCandidates, errors: 0 }
  }

  let published = 0
  let skipped = 0
  let errors = 0

  for (const draft of drafts) {
    const draftId = draft._id as string
    const publishedId = draftId.replace(/^drafts\./, '')
    const slug = draft.slug?.current
    if (!slug) {
      logger.warn('[publish] Skipping draft without slug', draftId)
      skipped++
      continue
    }
    const publishedAt = draft.publishedAt || new Date().toISOString()
    const doc = sanitizePublishedDoc(draft, publishedId, publishedAt)
    try {
      await serverClient.createOrReplace(doc)
      await serverClient.patch(draftId).set({ status: 'published', publishedAt }).commit()
      logger.log('[publish] Published', publishedId)
      published++
    } catch (err: any) {
      logger.error('[publish] Failed to publish', draftId, err?.message || err)
      errors++
    }
  }

  return { totalCandidates, published, skipped, errors }
}
