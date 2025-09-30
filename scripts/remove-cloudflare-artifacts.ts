import 'dotenv/config'
import crypto from 'node:crypto'
import readline from 'node:readline'
import type { ChallengeDetection } from '../lib/integrations/util/challenge-detector'
import { detectChallenge } from '../lib/integrations/util/challenge-detector'
import { portableTextToPlain } from '../lib/integrations/ai/prompt-context'
import { prisma } from '../lib/prisma'
import { serverClient } from '../lib/sanity'

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex')
}

type ArticleDoc = {
  _id: string
  title?: string
  slug?: { current?: string }
  canonicalUrl?: string
  externalHtml?: string | null
  body?: any
  status?: string
  _updatedAt?: string
}

type SuspectDoc = ArticleDoc & {
  challenge: ChallengeDetection | null
  bodyFlag: boolean
}

const PROMPT_CONFIRM = 'Type CLEAN to permanently remove the listed documents (or anything else to abort): '

function toLowerFlags(input: string | null | undefined): string {
  return (input || '').trim().toLowerCase()
}

function hasBodyChallenge(body: any): boolean {
  const plain = portableTextToPlain(body)
  if (!plain) return false
  const lowered = plain.toLowerCase()
  if (!lowered.includes('cloudflare')) return false
  return lowered.includes('just a moment') || lowered.includes('verify you are human') || lowered.includes('ray id')
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans) }))
}

async function deleteLedgerFor(doc: ArticleDoc) {
  if (!doc.canonicalUrl) return
  const hash = hashUrl(doc.canonicalUrl)
  const deleted = await prisma.ingestedItem.deleteMany({ where: { externalId: hash } })
  if (deleted.count > 0) {
    console.log(`- Cleared ${deleted.count} ledger record(s) for ${doc.canonicalUrl}`)
  }
}

async function cleanDocuments(docs: SuspectDoc[], options: { dryRun: boolean; deletePublished: boolean }) {
  const { dryRun, deletePublished } = options
  if (!docs.length) {
    console.log('No documents contained Cloudflare challenge artifacts. ✅')
    return
  }

  console.log(`Identified ${docs.length} article(s) containing Cloudflare or bot-challenge artifacts.`)
  for (const doc of docs) {
    const scope = doc._id.startsWith('drafts.') ? 'draft' : 'published'
    const reason = doc.challenge
      ? `${doc.challenge.type} (${doc.challenge.indicator})`
      : doc.bodyFlag
        ? 'body-text flag'
        : 'unknown flag'
    console.log(`• [${scope}] ${doc.title || doc.slug?.current || doc._id} → ${reason}`)
  }

  if (dryRun) {
    console.log('\nDry run only. Set DRY_RUN=false (or pass --apply) to perform cleanup.')
    return
  }

  const actionable = docs.filter((doc) => doc._id.startsWith('drafts.') || deletePublished)
  const reviewOnly = docs.filter((doc) => !doc._id.startsWith('drafts.') && !deletePublished)

  if (!actionable.length && reviewOnly.length) {
    console.log('\nOnly published documents were flagged. Re-run with --delete-published to remove them.')
  }

  if (reviewOnly.length) {
    console.log('\nThe following published articles will be scrubbed (externalHtml cleared, status→review):')
    for (const doc of reviewOnly) {
      console.log(`• ${doc.title || doc.slug?.current || doc._id}`)
    }
  }

  if (actionable.length) {
    console.log('\nThe following documents will be deleted:')
    for (const doc of actionable) {
      console.log(`• ${doc.title || doc.slug?.current || doc._id}`)
    }
  }

  const confirmation = await prompt(`\n${PROMPT_CONFIRM}`)
  if (toLowerFlags(confirmation) !== 'clean') {
    console.log('Aborted. No changes were made.')
    return
  }

  if (actionable.length) {
    const tx = serverClient.transaction()
    for (const doc of actionable) {
      tx.delete(doc._id)
    }
    await tx.commit()
    for (const doc of actionable) {
      await deleteLedgerFor(doc)
    }
    console.log(`Deleted ${actionable.length} document(s).`)
  }

  if (reviewOnly.length) {
    for (const doc of reviewOnly) {
      await serverClient
        .patch(doc._id)
        .set({ externalHtml: null, status: 'review' })
        .setIfMissing({ body: [] })
        .unset(['aiFinal', 'aiVariants'])
        .commit()
      await deleteLedgerFor(doc)
    }
    console.log(`Scrubbed ${reviewOnly.length} published article(s).`)
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = process.env.DRY_RUN !== 'false' && !args.has('--apply')
  const includePublished = args.has('--include-published') || process.env.CF_INCLUDE_PUBLISHED === 'true'
  const deletePublished = args.has('--delete-published') || process.env.CF_DELETE_PUBLISHED === 'true'

  const filter = includePublished
    ? '_type == "article" && (defined(externalHtml) || defined(body))'
    : '_id in path("drafts.**") && _type == "article" && (defined(externalHtml) || defined(body))'

  console.log('Scanning Sanity for challenge artifacts...')
  const docs = await serverClient.fetch<ArticleDoc[]>(
    `*[_type == "article" && ${filter}] { _id, title, slug, canonicalUrl, externalHtml, body, status, _updatedAt }`
  )

  const suspects: SuspectDoc[] = []
  for (const doc of docs) {
    const challenge = detectChallenge(doc.externalHtml)
    const bodyFlag = hasBodyChallenge(doc.body)
    if (challenge || bodyFlag) {
      suspects.push({ ...doc, challenge, bodyFlag })
    }
  }

  await cleanDocuments(suspects, { dryRun, deletePublished })
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch {}
  })
