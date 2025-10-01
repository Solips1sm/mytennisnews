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
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'photoresources.wtatennis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.atptour.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a1.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a2.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a3.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a4.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'mytennisnews.com',
          },
        ],
        destination: 'https://www.mytennisnews.com/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = config.resolve.alias ?? {}
    if (!config.resolve.alias['#async_hooks']) {
      config.resolve.alias['#async_hooks'] = 'node:async_hooks'
    }
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : []
      externals.push({
        sleep: 'commonjs sleep',
        'sleep/build/Release/node_sleep.node': 'commonjs sleep/build/Release/node_sleep.node',
      })
      config.externals = externals
    }
    return config
  },
}

module.exports = nextConfig
