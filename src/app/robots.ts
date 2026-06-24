import type { MetadataRoute } from 'next'
import { siteUrl } from './config/meta'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        // No trailing slashes: routes are /login, /profile, etc. (trailingSlash
        // is off), and a prefix without the slash blocks both forms.
        disallow: [
          '/api',
          '/login',
          '/profile',
          '/bills',
          '/insights',
          '/builder',
          '/parsers',
          '/properties',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
