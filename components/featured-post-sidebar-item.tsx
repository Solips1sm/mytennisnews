interface FeaturedPostSidebarItemProps {
  imageSrc: string
  imageAlt: string
  title: string
  href?: string
  publishedAt?: string
}

import { formatFriendlyDate, formatLocalDetailed } from '@/lib/utils'

export function FeaturedPostSidebarItem({ imageSrc, imageAlt, title, href, publishedAt }: FeaturedPostSidebarItemProps) {
  return (
    <a className="group/meta flex items-center gap-4 rounded-md p-1 hover:bg-accent/30" href={href || '#'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc || '/placeholder.svg'} alt={imageAlt} width={64} height={64} className="aspect-square rounded-md object-cover" />
      <div className="min-w-0">
        <h4 className="text-sm leading-snug font-medium line-clamp-2">{title}</h4>
        {publishedAt ? (
          <span className="relative inline-block text-xs text-muted-foreground align-baseline">
            <span className="block opacity-100 filter blur-0 transition-all duration-[600ms] group-hover/meta:opacity-0 group-hover/meta:blur-[2px]">
              {formatFriendlyDate(publishedAt)}
            </span>
            <span
              className="pointer-events-none absolute inset-0 flex items-center opacity-0 filter blur-[2px] transition-all duration-[600ms] group-hover/meta:opacity-100 group-hover/meta:blur-0 whitespace-nowrap"
              title={new Date(publishedAt).toString()}
            >
              {formatLocalDetailed(publishedAt)}
            </span>
          </span>
        ) : null}
      </div>
    </a>
  )
}
