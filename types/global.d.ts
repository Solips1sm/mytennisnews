/// <reference types="jsdom" />

declare module '*.css' {
	const content: Record<string, string>
	export default content
}

declare module '*.scss' {
	const content: Record<string, string>
	export default content
}

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void
	}
}

export {}