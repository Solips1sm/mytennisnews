import 'dotenv/config'
import { serverClient } from '../lib/sanity'

async function main() {
  const slug = 'a-little-bit-wiser-in-season-s-final-surge-andreeva-is-putting-l-079360'
  const query = '*[_type=="article" && slug.current==$slug][0]'
  const doc = await serverClient.fetch(query, { slug })
  if (!doc) {
    console.error('Document not found for slug', slug)
    return
  }
  console.log('AI Final present:', Boolean(doc.aiFinal))
  if (doc.aiFinal) {
    console.log('AI Final title:', doc.aiFinal.title)
    console.log('AI Final excerpt length:', doc.aiFinal.excerpt?.length || 0)
    console.log('AI Final body length:', doc.aiFinal.body?.length || 0)
    if (doc.aiFinal.body) {
      console.log('AI Final body preview:', doc.aiFinal.body.slice(0, 400))
    }
  }
  console.log('Doc ID:', doc._id)
  console.log('Has body array:', Array.isArray(doc.body))
  if (Array.isArray(doc.body)) {
    const embedBlocks = doc.body.filter((block: any) => JSON.stringify(block).toLowerCase().includes('insta'))
    console.log('Embed block count (insta search):', embedBlocks.length)
    if (embedBlocks.length) {
      console.dir(embedBlocks[0], { depth: 4 })
    }
  }
  const externalHtml: string | undefined = doc.externalHtml
  if (externalHtml) {
    console.log('externalHtml length:', externalHtml.length)
    const lower = externalHtml.toLowerCase()
    const idxInstagram = lower.indexOf('instagram')
    const idxInstgrm = lower.indexOf('instgrm')
    console.log('contains instagram:', idxInstagram !== -1 || idxInstgrm !== -1)
    const idx = idxInstagram !== -1 ? idxInstagram : idxInstgrm
    if (idx !== -1) {
      console.log('instagram snippet:', externalHtml.slice(Math.max(0, idx - 120), Math.min(externalHtml.length, idx + 400)))
    }
  } else {
    console.log('No externalHtml present')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
