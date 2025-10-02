import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const title = searchParams.get('title') || 'MyTennisNews'
    const description = searchParams.get('description') || 'Tennis news for the global community'

    // Fetch fonts
    const [proximaData] = await Promise.all([
      fetch(new URL('../../public/fonts/proximanova_regular.ttf', import.meta.url)).then((res) => res.arrayBuffer()),
    ])

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            background:
              'radial-gradient(70% 90% at 50% 35%, rgba(99, 102, 241, 0.32) 0%, rgba(10, 10, 12, 0) 55%), radial-gradient(80% 100% at 50% 65%, rgba(168, 85, 247, 0.24) 0%, rgba(10, 10, 12, 0) 60%), linear-gradient(0deg, rgba(5, 5, 6, 1) 0%, rgba(5, 5, 6, 1) 100%)',
            padding: 0,
            fontFamily: 'Proxima Nova',
          }}
        >
          {/* Top border accent */}
          <div
            style={{
              width: '100%',
              height: '4px',
              background: 'linear-gradient(90deg, #a855f7 0%, #6366f1 50%, #a855f7 100%)',
              display: 'flex',
            }}
          />

          {/* Header with logo text */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '48px 64px 0 64px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  display: 'flex',
                }}
              >
                MyTennisNews
              </div>
              <div
                style={{
                  width: '80px',
                  height: '2px',
                  background: 'linear-gradient(90deg, #a855f7 0%, transparent 100%)',
                  display: 'flex',
                }}
              />
            </div>
            <div
              style={{
                fontSize: '16px',
                color: '#71717a',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              TENNIS NEWS
            </div>
          </div>

          {/* Main content area */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '0 64px',
              gap: '24px',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: '64px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                display: 'flex',
                maxWidth: '900px',
              }}
            >
              {title}
            </div>

            {/* Separator */}
            <div
              style={{
                width: '120px',
                height: '1px',
                background: 'linear-gradient(90deg, #a855f7 0%, #6366f1 100%)',
                display: 'flex',
              }}
            />

            {/* Description */}
            <div
              style={{
                fontSize: '28px',
                color: '#a1a1aa',
                lineHeight: 1.4,
                display: 'flex',
                maxWidth: '800px',
              }}
            >
              {description}
            </div>
          </div>

          {/* Footer with grid pattern and metadata */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '32px 64px 48px 64px',
              borderTop: '1px solid #27272a',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '32px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '16px',
                  color: '#71717a',
                  display: 'flex',
                }}
              >
                www.mytennisnews.com
              </div>
              <div
                style={{
                  width: '4px',
                  height: '4px',
                  background: '#52525b',
                  borderRadius: '50%',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '16px',
                  color: '#71717a',
                  display: 'flex',
                }}
              >
                The tennis newsletter
              </div>
            </div>
            <div
              style={{
                fontSize: '14px',
                color: '#52525b',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              Real-time coverage
            </div>
          </div>

          {/* Bottom accent border */}
          <div
            style={{
              width: '100%',
              height: '4px',
              background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #6366f1 100%)',
              display: 'flex',
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Proxima Nova',
            data: proximaData,
            weight: 400,
            style: 'normal',
          },
        ],
      }
    )
  } catch (error: any) {
    console.error('OG image generation failed:', error)
    return new Response(`Failed to generate image: ${error?.message || 'Unknown error'}`, {
      status: 500,
    })
  }
}
