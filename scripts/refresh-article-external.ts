import 'dotenv/config'

import { serverClient } from '../lib/sanity'
import { htmlToPlainText } from '../lib/integrations/util/number-preserver'
import { extractArticle } from '../lib/integrations/extractors/article'

async function run() {
  const id = process.argv[2]
  if (!id) {
    console.error('Usage: npx tsx scripts/refresh-article-external.ts <documentId>')
    process.exit(1)
  }

  const draftId = `drafts.${id}`
  const doc = await serverClient.fetch<{ _id: string; canonicalUrl?: string }>(
    `*[_id == $id || _id == $draftId][0]{_id, canonicalUrl}`,
    { id, draftId }
  )

  if (!doc) {
    console.error(`Article ${id} not found`)
    process.exit(1)
  }

  if (!doc.canonicalUrl) {
    console.error(`Article ${id} is missing a canonicalUrl`)
    process.exit(1)
  }

  const url = doc.canonicalUrl
  let bodyHtml: string | undefined
  let bodyText: string | undefined

  try {
    const extracted = await extractArticle(url)
    if (!extracted?.bodyHtml) {
      console.error(`Extractor returned no bodyHtml for ${url}`)
      process.exit(1)
    }
    bodyHtml = extracted.bodyHtml
    bodyText = extracted.bodyText || htmlToPlainText(extracted.bodyHtml)
  } catch (err) {
    console.error(`Failed to extract content for ${url}`)
    console.error(err)
    process.exit(1)
  }

  if (!bodyHtml) {
    console.error('No bodyHtml computed; aborting patch')
    process.exit(1)
  }

  await serverClient
    .patch(doc._id)
    .set({ externalHtml: bodyHtml, externalText: bodyText || htmlToPlainText(bodyHtml) })
    .commit({ autoGenerateArrayKeys: true })

  console.log(`Updated externalHtml for ${doc._id}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})