import 'dotenv/config'
import { serverClient } from '../lib/sanity'
import pLimit from 'p-limit'
import { preserveNumbersInHtml, htmlToPlainText } from '../lib/integrations/util/number-preserver'

type Doc = { _id: string; _type: string; slug?: { current: string }; canonicalUrl?: string; externalHtml?: string | null }

async function fetchBatch(cursor?: string) {
  const query = `*[_type == "article" && defined(externalHtml) && externalHtml != null && (!_updatedAt || _updatedAt < now())]|order(_updatedAt asc)[0...100]{_id,_type,slug,canonicalUrl,externalHtml}`
  // NOTE: Simplified query; adjust as needed to avoid reprocessing
  return serverClient.fetch<Doc[]>(query)
}

async function main() {
  const limit = pLimit(4)
  let repaired = 0
  const docs = await fetchBatch()
  if (!docs.length) {
    console.log('No candidate docs found to repair.')
    return
  }
  await Promise.all(
    docs.map((doc) => limit(async () => {
      const html = doc.externalHtml || ''
      const fixed = preserveNumbersInHtml(html)
      if (fixed === html) return
      const pt = htmlToPlainText(fixed)
      await serverClient
        .patch(doc._id)
        .set({ externalHtml: fixed, externalText: pt })
        .commit({ autoGenerateArrayKeys: true })
      repaired++
      console.log(`Repaired ${doc._id} (${doc.slug?.current || doc.canonicalUrl || ''})`)
    }))
  )
  console.log(`Done. Repaired ${repaired} docs.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
