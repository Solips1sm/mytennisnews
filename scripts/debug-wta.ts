process.env.INGEST_DEBUG_RAW = 'true'
import { extractWTA } from '../lib/integrations/extractors/wta'

const url = 'https://www.wtatennis.com/news/4372887/gauff-withstands-bencic-to-reach-beijing-quarters-punches-ticket-to-wta-finals'

extractWTA(url).then((res) => {
  console.log('raw snippet:', res?._debug?.note)
  console.log('bodyHtml:', res?.bodyHtml?.slice(0, 500))
  process.exit(0)
})
