import type { MetadataRoute } from 'next'

import { getClient } from '@/lib/sanity'
import { ARTICLES_SITEMAP } from '@/lib/queries'
import { ensureHttpsUrl } from '@/lib/utils'

export const revalidate = 60 * 60 // refresh sitemap hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = ensureHttpsUrl(process.env.NEXT_PUBLIC_SITE_URL, 'https://www.mytennisnews.com') ||
    'https://www.mytennisnews.com'
  const baseOrigin = baseUrl.replace(/\/$/, '')
  const client = getClient(false)
  const articles = await client.fetch<Array<{ slug: string; publishedAt?: string; _updatedAt?: string }>>(ARTICLES_SITEMAP)

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => {
  const url = `${baseOrigin}/${article.slug}`
    const lastUpdated = article.publishedAt || article._updatedAt || new Date().toISOString()
    return {
      url,
      lastModified: lastUpdated,
      changeFrequency: 'daily',
      priority: 0.6,
    }
  })

  return [
    {
      url: `${baseOrigin}/`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    ...articleEntries,
  ]
}
