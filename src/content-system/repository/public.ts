import "server-only";
import type { ContentDocument, ContentSection, ContentSummary } from "../types";
import type { ContentRepository } from "./contract";
import { ciFixtureContentRepository } from "./ci-fixtures";

/** Loads PostgreSQL only when a production request actually needs content.
 * A static import would construct the database client even in a CI fixture
 * build, obscuring the guarantee that CI needs no DATABASE_URL at all. */
class LazyPostgresContentRepository implements ContentRepository {
  private async repository(): Promise<ContentRepository> {
    return (await import("./postgres")).postgresContentRepository;
  }

  async getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null> {
    return (await this.repository()).getByPath(section, slug);
  }

  async listPublished(section: ContentSection): Promise<ContentSummary[]> {
    return (await this.repository()).listPublished(section);
  }

  async listPubliclyRenderable(
    section: ContentSection,
  ): Promise<ContentSummary[]> {
    return (await this.repository()).listPubliclyRenderable(section);
  }
}

/** CI opts into deterministic code-owned fixtures. Every other environment,
 * including Vercel production and previews, reads the live CMS database. */
export const publicContentRepository: ContentRepository =
  process.env.CI_CONTENT_FIXTURES === "1"
    ? ciFixtureContentRepository
    : new LazyPostgresContentRepository();
