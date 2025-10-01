import { serverClient } from '../lib/sanity'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: tsx scripts/query-article.ts <canonical-url>')
    process.exit(1)
  }
  const doc = await serverClient.fetch(
    `*[_type=="article" && canonicalUrl==$url][0]{ _id, title, slug, "isDraft": _id in path("drafts.**") }`,
    { url }
  )
  console.log(doc)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
