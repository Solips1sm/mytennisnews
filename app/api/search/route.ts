import { NextResponse } from 'next/server'
import { groq } from 'next-sanity'
import { getClient } from '@/lib/sanity'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)))
    if (!q) return NextResponse.json({ items: [] })

    const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'
    const client = getClient(isPreview)

    const query = groq`*[_type == "article" && !(_id in path('drafts.**')) && (
      title match $q || excerpt match $q || source->name match $q || count(tags[@->name match $q]) > 0
    )] | order(coalesce(publishedAt, _updatedAt) desc)[0...$limit]{
      _id,
      title,
      "slug": slug.current,
      excerpt,
      leadImageUrl,
      canonicalUrl,
      publishedAt,
      source->{name, url},
      tags[]->{_id, name}
    }`

    const items = await client.fetch(query, { q: `*${q}*`, limit })
    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Search failed' }, { status: 500 })
  }
}
