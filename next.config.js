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
}

module.exports = nextConfig
