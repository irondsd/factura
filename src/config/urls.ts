// Single source of truth for the site's own origin and the external links that
// would otherwise be hardcoded across components, metadata, and structured data.
// Change the domain or fork the repo in one place here.
//
// Note: the localized prose in the i18n dictionaries (privacy/security/FAQ
// answer bodies) inlines some of these links as raw HTML and can't import this
// module — keep those occurrences in sync by hand.

/** Canonical production origin, no trailing slash. */
export const siteUrl = "https://factura.uno";

/** Public source repository. */
export const githubUrl = "https://github.com/irondsd/factura";

/** Where to file a private security advisory. */
export const githubSecurityAdvisoryUrl = `${githubUrl}/security/advisories/new`;

/** Contact addresses on the site's domain. */
export const contactEmail = {
  privacy: "privacy@factura.uno",
  security: "security@factura.uno",
} as const;
