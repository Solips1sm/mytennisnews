import localFont from 'next/font/local'

export const uiFont = localFont({
  src: [
    { path: '../public/fonts/proximanova_regular.ttf', weight: '400', style: 'normal' },
  ],
  variable: '--font-ui',
  display: 'swap',
})

export const bodyFont = localFont({
  src: [
    { path: '../public/fonts/FreightTextProBook.ttf', weight: '400', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
})
