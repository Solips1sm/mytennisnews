import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			role="navigation"
			aria-label="pagination"
			data-slot="pagination"
			className={cn("mx-auto flex w-full justify-center", className)}
			{...props}
		/>
	)
}

export function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
	return (
		<ul
			data-slot="pagination-content"
			className={cn("flex flex-row items-center gap-1", className)}
			{...props}
		/>
	)
}

export function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
	return <li data-slot="pagination-item" className={cn(className)} {...props} />
}

const baseLink =
	"inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"

export type PaginationLinkProps = React.ComponentProps<typeof Link> & {
	isActive?: boolean
}

export const PaginationLink = React.forwardRef<HTMLAnchorElement, PaginationLinkProps>(
	({ className, isActive, children, ...props }, ref) => {
		return (
			<Link
				ref={ref}
				aria-current={isActive ? "page" : undefined}
				data-slot="pagination-link"
				data-active={isActive ? "true" : undefined}
				className={cn(
					baseLink,
					isActive
						? "border bg-background shadow-xs dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9"
						: "size-9",
					className,
				)}
				{...props}
			>
				{children}
			</Link>
		)
	},
)
PaginationLink.displayName = "PaginationLink"

export const PaginationPrevious = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof Link>>(
	({ className, children, ...props }, ref) => {
		return (
			<Link
				ref={ref}
				aria-label="Go to previous page"
				data-slot="pagination-link"
				className={cn(baseLink, "h-9 py-2 has-[>svg]:px-3 gap-1 px-2.5 sm:pl-2.5", className)}
				{...props}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
				<span className="hidden sm:block">{children ?? "Previous"}</span>
			</Link>
		)
	},
)
PaginationPrevious.displayName = "PaginationPrevious"

export const PaginationNext = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof Link>>(
	({ className, children, ...props }, ref) => {
		return (
			<Link
				ref={ref}
				aria-label="Go to next page"
				data-slot="pagination-link"
				className={cn(baseLink, "h-9 py-2 has-[>svg]:px-3 gap-1 px-2.5 sm:pr-2.5", className)}
				{...props}
			>
				<span className="hidden sm:block">{children ?? "Next"}</span>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
			</Link>
		)
	},
)
PaginationNext.displayName = "PaginationNext"

export function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span aria-hidden data-slot="pagination-ellipsis" className={cn("flex size-9 items-center justify-center", className)} {...props}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-ellipsis size-4"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
			<span className="sr-only">More pages</span>
		</span>
	)
}
