import Link from 'next/link'
import type { CSSProperties } from 'react'
import { PortableText } from '@portabletext/react'
import { RichExternalContent } from './rich-external-content'
import { FullscreenImage } from '@/components/fullscreen-image'
import { ArticleBodyWithSideNav } from '@/components/article-body-with-side-nav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/ui/button'
import { ExternalLink, Clock } from 'lucide-react'
import { ShareButton } from '@/components/share-button'
import { ReactionButtons } from '@/components/reaction-buttons'
import { ArticleSideNav } from '@/components/article-side-nav'
import { resolveSourceLogo } from '@/lib/logo-resolver'

type Tag = { _id: string; name: string; slug?: string }
type Article = {
  _id: string
  title: string
  excerpt?: string
  body?: any
  aiBody?: string
  aiCreatedAt?: string
  externalHtml?: string
  leadImageUrl?: string
  mediaCredits?: string
  canonicalUrl?: string
  source?: { name?: string; url?: string; license?: string }
  authors?: string[]
  tags?: Tag[]
  publishedAt?: string
  timestampText?: string
}

export function ArticleContent({ article }: { article: Article }) {
  const articleStyle = { '--article-content-max': 'clamp(85%, 88%, 1200px)' } as CSSProperties
  const contentBoundsStyle = { maxWidth: 'var(--article-content-max)' } as CSSProperties
  const hostname = (() => {
    try {
      return article.canonicalUrl ? new URL(article.canonicalUrl).hostname : undefined
    } catch {
      return undefined
    }
  })()
  const isESPN = hostname?.includes('espn.com') || /espn/i.test(article.source?.name || '')
  const logo = resolveSourceLogo(article.canonicalUrl, article.source?.name)
  const formattedDate = article.publishedAt
    ? new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(article.publishedAt))
    : undefined
  return (
  <article className="relative mx-auto w-full max-w-[1335px] px-2 sm:px-3 lg:px-4 xl:px-6" style={articleStyle}>
      <header className="mb-2 md:mb-3">
        <h1 className="text-2xl font-ui font-semibold tracking-tight sm:text-3xl">{article.title}</h1>
        {/* Meta area: Row 1 = identity; Row 2 = time/meta left + actions right; Row 3 = tags */}
        <div className="mt-1 md:mt-2 flex flex-wrap items-center gap-2 sm:gap-2 text-[13px] text-muted-foreground">
          {/* Row 1: source identity (avatar + name) + actions (mobile only rightmost) */}
          <div className="order-1 flex items-center gap-1 md:gap-2 min-w-0 w-full">
            <Avatar className="h-8 w-8">
              {logo ? (
                <AvatarImage src={logo.src} alt={logo.alt} className={logo.className} />
              ) : article.source?.url ? (
                <AvatarFallback>{article.source?.name?.[0] || '?'}</AvatarFallback>
              ) : (
                <AvatarFallback>?</AvatarFallback>
              )}
            </Avatar>
            {article.source?.name && article.canonicalUrl ? (
              <a
                href={article.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {article.source.name}
              </a>
            ) : (
              <span>{article.source?.name}</span>
            )}
            {/* Mobile-only actions inline with source, rightmost */}
            <div className="ml-auto flex items-center gap-1 sm:hidden">
              {article.canonicalUrl ? (
                <a href={article.canonicalUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="secondary" className="h-8 px-2 text-xs">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Source
                  </Button>
                </a>
              ) : null}
              <ShareButton
                title={article.title}
                url={article.canonicalUrl}
                size="sm"
                variant="outline"
                copyLabel="Copy"
                compact
                className="h-8"
              />
            </div>
          </div>
          {/* Row 2: meta/time left + actions right (always rightmost on all breakpoints) */}
          {(article.authors && article.authors.length) || (article.timestampText || formattedDate) ? (
            <div className="order-2 basis-full flex items-center gap-2">
              <div className="article-meta inline-flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-0.5">
              {article.authors && article.authors.length ? (
                <ul className="authors m-0 flex list-none items-center gap-2 p-0">
                  {article.authors.map((a) => (
                    <li key={a} className="leading-none">
                      <Badge className="author rounded-full">
                        {a}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {article.timestampText || formattedDate ? (
                <span className="timestamp inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {article.timestampText ? (
                    <span>{article.timestampText}</span>
                  ) : (
                    <time dateTime={article.publishedAt}>{formattedDate}{isESPN ? ' ET' : ''}</time>
                  )}
                </span>
              ) : null}
              </div>
              {/* Desktop/tablet-only actions rightmost */}
              <div className="ml-auto hidden sm:flex items-center gap-2">
                {article.canonicalUrl ? (
                  <a href={article.canonicalUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="secondary" className="h-8 px-2 text-xs">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Read the Source
                    </Button>
                  </a>
                ) : null}
                <ShareButton
                  title={article.title}
                  url={article.canonicalUrl}
                  size="sm"
                  variant="outline"
                  copyLabel="Copy link"
                  className="h-8"
                />
              </div>
            </div>
          ) : null}
          {/* Tags: Row 3 on small (full width); inline on sm+ */}
          {article.tags && article.tags.length ? (
            <div className="order-3 basis-full sm:order-none sm:basis-auto flex flex-wrap items-center gap-1 sm:ml-2">
              {article.tags.slice(0, 3).map((t) => (
                <Badge key={t._id} className="rounded-full">
                  {t.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {article.excerpt ? <p className="mt-4 text-muted-foreground font-ui">{article.excerpt}</p> : null}

      {article.leadImageUrl ? (
        <div className="mt-3 md:mt-6 mx-auto w-full max-w-none" style={contentBoundsStyle}>
          <FullscreenImage
            src={article.leadImageUrl}
            alt={article.title}
            caption={undefined}
            credit={article.mediaCredits}
            canonicalUrl={article.canonicalUrl}
            rounded
          />
        </div>
      ) : null}

      {article.aiBody ? (
        <ArticleBodyWithSideNav html={article.aiBody} sourceHost={hostname} primaryImageUrl={article.leadImageUrl} />
      ) : article.externalHtml ? (
        <ArticleBodyWithSideNav html={article.externalHtml} sourceHost={hostname} primaryImageUrl={article.leadImageUrl} />
      ) : article.body ? (
        <div className="prose prose-neutral dark:prose-invert mt-3 md:mt-6 text-2xl mx-auto w-full max-w-none" style={contentBoundsStyle}>
          <PortableText value={article.body} />
        </div>
      ) : null}


      <div className="mt-4 md:mt-10 flex items-center justify-between gap-3">
        {/* Back to articles link */}
        <Link
          href="/"
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' gap-2 inline-flex items-center'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to articles
        </Link>

        {/* Reactions inline on the right */}
        <div className="ml-auto">
          <ReactionButtons articleId={article._id} />
        </div>
      </div>
    </article>
  )
}
