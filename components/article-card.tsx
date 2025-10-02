import Link from 'next/link'
import { Badge } from '@/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { estimateReadTime } from '@/lib/utils'
import { resolveSourceLogo } from '@/lib/logo-resolver'

type Props = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  source?: { name?: string; url?: string }
  canonicalUrl?: string
  publishedAt?: string
  tags?: Array<{ _id: string; name: string }>
  leadImageUrl?: string
}

export function ArticleCard({ _id, title, slug, excerpt, source, canonicalUrl, publishedAt, tags, leadImageUrl }: Props) {
  const readTime = estimateReadTime(excerpt || title || '')
  const logo = resolveSourceLogo(canonicalUrl, source?.name)
  return (
    <li key={_id} className="group p-0 transition-colors">
      {slug ? (
        <Link href={`/${slug}`} className="block p-4 hover:bg-accent/30">
          <div className="space-y-3">
            {leadImageUrl ? (
              <div className="relative overflow-hidden rounded-md aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={leadImageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
                  <h3 className="font-ui truncate">
                <span className="hover:underline">{title}</span>
          </h3>
          {excerpt ? (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{excerpt}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {publishedAt ? <time dateTime={publishedAt}>{new Date(publishedAt).toLocaleDateString()}</time> : null}
            {source?.name && canonicalUrl ? (
              <a href={canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                <Avatar className="h-6 w-6">
                  {logo ? (
                    <AvatarImage src={logo.src} alt={logo.alt} className={logo.className} />
                  ) : (
                    <AvatarImage src={'/placeholder.svg?height=24&width=24'} alt={source.name || ''} />
                  )}
                  <AvatarFallback>{(source.name || 'S').split(' ').map((n) => n[0]).join('').slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span>{source.name} ↗</span>
              </a>
            ) : null}
            {tags?.slice(0, 3).map((t) => (
              <Badge key={t._id} className="border-muted-foreground/30 text-muted-foreground">{t.name}</Badge>
            ))}
            <span aria-hidden="true">•</span>
            <span>{readTime} read</span>
            </div>
          </div>
            </div>
          </div>
        </Link>
      ) : (
        <a href={canonicalUrl} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-accent/30">
          <div className="space-y-3">
            {leadImageUrl ? (
              <div className="relative overflow-hidden rounded-md aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={leadImageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                  <h3 className="font-ui truncate">
                  <span className="hover:underline">{title}</span>
                </h3>
                {excerpt ? (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{excerpt}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {publishedAt ? <time dateTime={publishedAt}>{new Date(publishedAt).toLocaleDateString()}</time> : null}
                  {source?.name && canonicalUrl ? (
                    <span className="underline underline-offset-2">{source.name} ↗</span>
                  ) : null}
                  {tags?.slice(0, 3).map((t) => (
                    <Badge key={t._id} className="border-muted-foreground/30 text-muted-foreground">{t.name}</Badge>
                  ))}
                  <span aria-hidden="true">•</span>
                  <span>{readTime} read</span>
                </div>
              </div>
            </div>
          </div>
        </a>
      )}
    </li>
  )
}
