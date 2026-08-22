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

/** Where a reproducible bug or a feature request belongs. */
export const githubIssuesUrl = `${githubUrl}/issues`;

/** Contact addresses on the site's domain. */
export const contactEmail = {
  support: "support@factura.uno",
  privacy: "privacy@factura.uno",
  security: "security@factura.uno",
} as const;

/** Terms the compiled tables on /estadisticas and /investigaciones are offered
 * under, named for both the `Dataset` markup and the sources block that a
 * reader sees.
 *
 * What is licensed here is Factura's work: the series as this site compiles,
 * converts, joins and ranks them. The underlying official figures are facts and
 * stay their producers' — `creator` in the markup and `<Fuentes />` on the page
 * name them, and their own terms are theirs to state. A page whose numbers
 * travel under different terms overrides this with `dataset.license`. */
export const dataLicense = {
  url: "https://creativecommons.org/licenses/by/4.0/",
  name: "CC BY 4.0",
} as const;
