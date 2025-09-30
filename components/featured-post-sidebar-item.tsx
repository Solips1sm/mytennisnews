interface FeaturedPostSidebarItemProps {
  imageSrc: string
  imageAlt: string
  title: string
  href?: string
  publishedAt?: string
}

import { formatFriendlyDate } from '@/lib/utils'

export function FeaturedPostSidebarItem({ imageSrc, imageAlt, title, href, publishedAt }: FeaturedPostSidebarItemProps) {
  return (
    <a className="flex items-center gap-4 rounded-md p-1 hover:bg-accent/30" href={href || '#'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc || '/placeholder.svg'} alt={imageAlt} width={64} height={64} className="aspect-square rounded-md object-cover" />
      <div className="min-w-0">
        <h4 className="text-sm leading-snug font-medium line-clamp-2">{title}</h4>
        {publishedAt ? (
          <time dateTime={publishedAt} className="text-xs text-muted-foreground">{formatFriendlyDate(publishedAt)}</time>
        ) : null}
      </div>
    </a>
  )
}
