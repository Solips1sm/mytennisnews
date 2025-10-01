import React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MyTennisNews — Tennis news for the global community'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

const backgroundGradient = 'linear-gradient(135deg, #0f172a 10%, #1d4ed8 90%)'

const baseWrapperStyle: React.CSSProperties = {
  width: size.width,
  height: size.height,
  background: backgroundGradient,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  color: '#f8fafc',
  padding: '64px 72px',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const headline = searchParams.get('title')?.slice(0, 160) || 'Tennis stories for the global community'
  const secondary = searchParams.get('subtitle')?.slice(0, 200) ||
    'Personal tennis coverage, daily context, and curated analysis for every fan.'

  const wrapper = React.createElement(
    'div',
    { style: baseWrapperStyle },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 24 } },
      React.createElement(
        'div',
        {
          style: {
            width: 96,
            height: 96,
            borderRadius: 28,
            background: 'rgba(15, 118, 110, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 54,
            fontWeight: 700,
            letterSpacing: '-0.03em',
          },
        },
        'MTN'
      ),
      React.createElement(
        'div',
        { style: { fontSize: 38, fontWeight: 600, letterSpacing: '-0.02em' } },
        'MyTennisNews'
      )
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 24 } },
      React.createElement(
        'div',
        { style: { fontSize: 72, fontWeight: 700, lineHeight: 1.05 } },
        headline
      ),
      React.createElement(
        'div',
        { style: { fontSize: 34, color: 'rgba(226, 232, 240, 0.9)', maxWidth: 900 } },
        secondary
      )
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 28,
          color: 'rgba(148, 163, 184, 0.9)',
        },
      },
      React.createElement('span', null, 'mytennisnews.com'),
  React.createElement('span', null, 'Community-powered tennis coverage every day.')
    )
  )

  return new ImageResponse(wrapper, {
    ...size,
  })
}
