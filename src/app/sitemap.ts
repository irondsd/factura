import type { MetadataRoute } from 'next'
import { siteUrl } from './config/meta'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Only genuinely public, logged-out-visible pages belong here. Everything
  // else (/bills, /insights, /profile, …) is the authenticated app and is
  // disallowed in robots.ts. Add public marketing routes here as they ship.
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
