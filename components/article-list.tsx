import { ArticleCard } from './article-card'

type Article = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  canonicalUrl?: string
  publishedAt?: string
  source?: { name?: string; url?: string }
  leadImageUrl?: string
  readingChars?: number
}

export function ArticleList({ articles }: { articles: Article[] }) {
  if (!articles?.length) return <p className="text-muted-foreground">No articles yet. Add some in the CMS.</p>
  return (
    <ul className="grid gap-1 rounded-md border divide-y md:divide-y-0 md:grid-cols-2 lg:grid-cols-3">
      {articles.map((a) => (
        <ArticleCard key={a._id} {...a} />
      ))}
    </ul>
  )
}
