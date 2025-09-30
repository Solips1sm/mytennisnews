import * as React from 'react'
import { cn } from '@/lib/utils'

export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} {...props} />
}

export function AvatarImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { alt = '', ...rest } = props
  return <img alt={alt} {...rest} className={cn('h-full w-full object-cover', props.className)} />
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('flex h-full w-full items-center justify-center bg-muted text-muted-foreground', className)}
      {...props}
    />
  )
}
