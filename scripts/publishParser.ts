import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/index'
import { parserConfigs } from '../src/db/schema'
import { ensureSystemUser, publishPackage } from '../src/server/registry'

/** Maintainer tool: freeze the current draft of a system-owned (official) parser
 * as a new immutable published version, so adopters can upgrade to it.
 *
 * The app's Publish button is owner-only and the official parsers are owned by
 * the system account, so there's no in-app way to release a new official
 * version — this is that path. After running, adopters see "Update to vN" on the
 * Parsers page; clicking it re-adopts the new version and reparses their bills.
 *
 * Usage: npx dotenv -e .env.local tsx scripts/publishParser.ts <slug>
 * Idempotent: re-publishing an already-published version is a no-op.
 */
async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: tsx scripts/publishParser.ts <slug>')
    process.exit(1)
  }
  const ownerId = await ensureSystemUser(db)
  const pkg = await db.query.parserConfigs.findFirst({
    where: and(eq(parserConfigs.slug, slug), eq(parserConfigs.ownerId, ownerId)),
  })
  if (!pkg) {
    console.error(`No system-owned parser with slug "${slug}".`)
    process.exit(1)
  }
  const version = await publishPackage(db, ownerId, pkg.id)
  console.log(`Published "${slug}" v${version.version} (versionId ${version.id}).`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
