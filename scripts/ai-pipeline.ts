import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import crypto from 'node:crypto'
// load env
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

import { serverClient } from '../lib/sanity'
import { prisma } from '../lib/prisma'
import { OpenAIPipeline } from '../lib/integrations/ai/openai'
import { resolveVariantTargetCount, type DraftVariant } from '../lib/integrations/ai'
import { buildPromptArtifacts } from '../lib/integrations/ai/prompt-context'

type StepTiming = { label: string; ms: number }
type VariantStat = { index: number; titleChars: number; bodyChars: number; paragraphs: number }

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(2)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms}ms`
}

function computeVariantStats(variants: DraftVariant[]): VariantStat[] {
  return variants.map((variant, idx) => {
    const body = variant.body || ''
    return {
      index: idx + 1,
      titleChars: variant.title?.length ?? 0,
      bodyChars: body.length,
      paragraphs: (body.match(/<p>/g) || []).length,
    }
  })
}

async function runPipelineForArticleId(_id: string) {
  const pipelineStart = Date.now()
  const timings: StepTiming[] = []
  const recordTiming = (label: string, ms: number) => timings.push({ label, ms })
  const measure = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    console.info(`[pipeline] ▶ ${label}`)
    const started = Date.now()
    try {
      const result = await fn()
      const elapsed = Date.now() - started
      recordTiming(label, elapsed)
      console.info(`[pipeline] ✔ ${label} (${formatMs(elapsed)})`)
      return result
    } catch (error) {
      const elapsed = Date.now() - started
      recordTiming(`${label} (failed)`, elapsed)
      console.error(`[pipeline] ✖ ${label} failed after ${formatMs(elapsed)}`)
      throw error
    }
  }

  const doc = await measure('Fetch Sanity document', async () => {
    const query = `*[_id==$id]{..., source->{name}}[0]`
    return serverClient.fetch(query, { id: _id }) as Promise<any>
  })
  if (!doc) throw new Error(`Article not found: ${_id}`)

  console.info(`[pipeline] Document title: ${doc.title}`)
  if (doc.slug?.current) console.info(`[pipeline] Document slug: ${doc.slug.current}`)
  const sourceName = doc.source?.name || doc.sourceName || doc.source_name
  if (sourceName) console.info(`[pipeline] Source: ${sourceName}`)
  const title: string = doc.title
  const excerpt: string | undefined = doc.excerpt
  const resolvedArtifacts = await measure('Build prompt artifacts', async () => {
    const artifactsInner = buildPromptArtifacts({
      body: doc.body,
      externalHtml: doc.externalHtml,
      canonicalUrl: doc.canonicalUrl,
      leadImageUrl: doc.leadImageUrl,
    })
    console.info('[pipeline] Artifact summary', {
      bodyTextChars: artifactsInner.bodyText?.length ?? 0,
      linkReferences: artifactsInner.linkReferences?.length ?? 0,
      mediaReferences: artifactsInner.mediaReferences?.length ?? 0,
    })
    return artifactsInner
  })
  const bodyText: string | undefined = resolvedArtifacts.bodyText
  const context = [doc.source?.name ? `Source: ${doc.source?.name}` : null, doc.canonicalUrl ? `URL: ${doc.canonicalUrl}` : null]
    .filter(Boolean)
    .join(' | ')
  if (context) console.info('[pipeline] Context:', context)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY missing')
  const model = process.env.AI_MODEL || 'gpt-4o-mini'
  const ai = new OpenAIPipeline(apiKey, model, {
    onUsage: (event) => {
      console.info('[ai] usage event', {
        label: event.label,
        totalTokens: event.totalTokens,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        durationMs: event.durationMs,
      })
    },
  })
  console.info(`[pipeline] Using AI provider ${ai.name} model=${model}`)

  const desiredVariantCount = resolveVariantTargetCount(sourceName)
  console.info(`[pipeline] Variant target count: ${desiredVariantCount}`)
  const rawVariants = await measure('Generate draft variants', async () => ai.generateVariants({
    title,
    excerpt,
    bodyText,
    context,
    linkReferences: resolvedArtifacts.linkReferences,
    mediaReferences: resolvedArtifacts.mediaReferences,
  }, desiredVariantCount))
  const variants = ai.finalizeDrafts(rawVariants, {
    linkReferences: resolvedArtifacts.linkReferences,
    mediaReferences: resolvedArtifacts.mediaReferences,
  })
  const variantStats = computeVariantStats(variants)
  console.table(variantStats, ['index', 'titleChars', 'bodyChars', 'paragraphs'])
  if (variantStats.length) {
    const bodyChars = variantStats.map((s) => s.bodyChars)
    const avg = bodyChars.reduce((sum, val) => sum + val, 0) / variantStats.length
    console.info('[pipeline] Variant body char summary', {
      average: Math.round(avg),
      min: Math.min(...bodyChars),
      max: Math.max(...bodyChars),
    })
  }

  const finalDraft = await measure('Synthesize final draft', async () => ai.synthesizeFinal(rawVariants, {
    title,
    excerpt,
    bodyText,
    context,
    linkReferences: resolvedArtifacts.linkReferences,
    mediaReferences: resolvedArtifacts.mediaReferences,
  }))
  console.info('[pipeline] Final draft stats', {
    titleChars: finalDraft.title?.length ?? 0,
    excerptChars: finalDraft.excerpt?.length ?? 0,
    bodyChars: finalDraft.body?.length ?? 0,
    paragraphs: (finalDraft.body?.match(/<p>/g) || []).length,
  })

  await measure('Persist AI output to Sanity', async () => {
    const patch: any = {
      aiVariants: variants.map((v: DraftVariant) => ({ _key: crypto.randomBytes(8).toString('hex'), ...v })),
      aiFinal: { ...finalDraft, provider: ai.name, model, createdAt: new Date().toISOString() },
    }
    await serverClient.patch(_id).set(patch).commit()
    await serverClient.patch(_id).set({ status: 'review' }).commit()
  })

  const usageSummary = ai.getUsageSummary()
  const totalElapsedMs = Date.now() - pipelineStart
  return {
    variantsGenerated: variants.length,
    variantStats,
    finalHasBody: !!finalDraft?.body,
    finalBodyChars: finalDraft.body?.length ?? 0,
    finalDraft,
    usage: usageSummary,
    timings,
    totalElapsedMs,
  }
}

async function main() {
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: tsx scripts/ai-pipeline.ts <id|drafts.id|slug:my-slug|structure:article;docId|Studio URL>')
    console.error(' Tip (PowerShell): quote arguments with semicolons, e.g. "article;abcd1234"')
    process.exit(1)
  }

  async function resolveId(input: string): Promise<string> {
    let arg = input.trim()
    // Allow passing full Studio URL
    const idx = arg.indexOf('/structure/')
    if (/^https?:\/\//i.test(arg) && idx > -1) {
      arg = decodeURIComponent(arg.slice(idx + '/structure/'.length))
    }
    // Allow prefix structure:
    if (arg.startsWith('structure:')) arg = arg.slice('structure:'.length)
    // Extract after type;id pattern
    if (arg.includes(';')) {
      const parts = arg.split(';')
      arg = parts[1] || parts[0]
    }
    // Handle slug: prefix
    if (arg.startsWith('slug:')) {
      const slug = arg.slice('slug:'.length)
      // Prefer draft if exists
      const query = `{
        draft: *[_type=="article" && slug.current==$slug && _id in path('drafts.**')][0]._id,
        pub: *[_type=="article" && slug.current==$slug && !(_id in path('drafts.**'))][0]._id
      }`
      const found = await serverClient.fetch(query, { slug })
      return found?.draft || found?.pub || ''
    }
    // Try as-is
    const doc = await serverClient.getDocument(arg)
    if (doc) return arg
    // Try draft prefix
    if (!arg.startsWith('drafts.')) {
      const draftId = `drafts.${arg}`
      const d = await serverClient.getDocument(draftId)
      if (d) return draftId
    }
    return arg // Let caller error out meaningfully
  }

  const id = await resolveId(raw)
  const result = await runPipelineForArticleId(id)
  console.info(`[pipeline] Completed in ${formatMs(result.totalElapsedMs)} (variants=${result.variantsGenerated})`)
  console.table(result.timings.map((t) => ({ step: t.label, duration: formatMs(t.ms) })))

  const usageTotals = result.usage.totals
  console.info('[pipeline] Token usage totals', {
    requests: usageTotals.requests,
    promptTokens: usageTotals.promptTokens,
    completionTokens: usageTotals.completionTokens,
    totalTokens: usageTotals.totalTokens,
    averageTokensPerRequest: usageTotals.averageTokensPerRequest,
    averageLatencyMs: usageTotals.averageLatencyMs,
  })
  if (Object.keys(result.usage.byLabel).length) {
    const rows = Object.entries(result.usage.byLabel).map(([label, data]) => ({
      label,
      requests: data.requests,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
      avgTokens: Number(data.averageTokensPerRequest.toFixed(1)),
      avgLatencyMs: Number(data.averageLatencyMs.toFixed(0)),
    }))
    console.table(rows)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
