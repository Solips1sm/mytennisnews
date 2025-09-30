/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: '2mb',
    },
    serverComponentsExternalPackages: [
      '@sanity',
      '@sanity/client',
      '@sanity/color',
      '@sanity/types',
      'next-sanity',
      'groq',
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = config.resolve.alias ?? {}
    if (!config.resolve.alias['#async_hooks']) {
      config.resolve.alias['#async_hooks'] = 'node:async_hooks'
    }
    return config
  },
}

module.exports = nextConfig
