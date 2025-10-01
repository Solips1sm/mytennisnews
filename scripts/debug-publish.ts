import 'dotenv/config'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { serverClient } from '../lib/sanity'

loadEnv({ path: path.resolve(process.cwd(), '.env'), override: false })
loadEnv({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  const query = `*[_type == "article" && _id in path("drafts.**") && length(coalesce(aiFinal.body, "")) > 0 && status != "published"]{_id, status, slug, aiFinal}[0...10]`
  const docs = await serverClient.fetch(query)
  console.log('draft candidates:', docs.length)
  for (const doc of docs) {
    console.log(doc._id, doc.status, doc.slug?.current, typeof doc.aiFinal?.body, doc.aiFinal?.body?.slice?.(0, 80))
  }

  const publishedQuery = `*[_type == "article" && !(_id in path("drafts.**")) && length(coalesce(aiFinal.body, "")) > 0]{_id, status, slug, aiFinal}[0...5]`
  const publishedDocs = await serverClient.fetch(publishedQuery)
  console.log('published docs with aiFinal:', publishedDocs.length)
  for (const doc of publishedDocs) {
    console.log('published:', doc._id, doc.status)
  }

  const anyAiFinal = await serverClient.fetch(
    `*[_type == "article" && defined(aiFinal)][0]{_id, status, aiFinal}`
  )
  console.log('sample with aiFinal field:', anyAiFinal)

  if (anyAiFinal?._id) {
    try {
  const verifyQuery = `*[_id == "${anyAiFinal._id}"]{_id, status, cond: _id in path("drafts.**"), bodyLength: length(coalesce(aiFinal.body, "")), notPublished: status != "published"}`
      const verify = await serverClient.fetch(verifyQuery)
      console.log('verify condition breakdown:', verify)
    } catch (error) {
      console.error('verify query failed', error)
    }
  }

  const baseCount = await serverClient.fetch(`count(*[_type == "article" && _id in path("drafts.**")])`)
  const nonEmpty = await serverClient.fetch(`count(*[_type == "article" && _id in path("drafts.**") && length(coalesce(aiFinal.body, "")) > 0])`)
  const notPublished = await serverClient.fetch(`count(*[_type == "article" && _id in path("drafts.**") && length(coalesce(aiFinal.body, "")) > 0 && status != "published"])`)
  console.log('counts -> base', baseCount, 'nonEmpty', nonEmpty, 'notPublished', notPublished)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
