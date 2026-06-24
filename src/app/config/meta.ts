import { Metadata } from 'next'

export const siteUrl = 'https://factura.uno'
const siteName = 'Factura'
const title = 'Factura — your bill ledger'
const description =
  'Upload PDF bills, parse charges and meter data, and track household spending, utilities, and consumption over time. Factura is your bill ledger for electricity, gas, water, and home expenses.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s — Factura',
  },
  description,
  applicationName: siteName,
  authors: [{ name: 'Factura' }],
  creator: 'Factura',
  publisher: 'Factura',
  category: 'finance',
  keywords: [
    'bill ledger',
    'bill tracker',
    'utility bill tracker',
    'PDF bill parser',
    'household expense tracker',
    'electricity usage tracker',
    'water consumption tracker',
    'gas bill tracking',
    'home utilities dashboard',
    'recurring bill history',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName,
    title,
    description,
    locale: 'en_US',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Factura — your bill ledger',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/twitter-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: 'default',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
}
