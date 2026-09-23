import "server-only";
import {
  INSIGHT_LIMITS,
  type ContentInsight,
} from "@/content-system/insights/types";
import { CONTENT_SECTIONS } from "@/content-system/types";
import { canAuthor } from "@/cms/auth/policy";
import { cmsCategoryStore } from "@/cms/categories/server/store";
import { cmsContentService } from "@/cms/server/service";
import { revalidatePublicInsights } from "@/cms/server/invalidation";
import { cmsPageStore } from "@/cms/server/store";
import {
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import type { CmsActor } from "@/cms/types";
import type { InsightPageOption } from "../types";
import {
  cmsInsightStore,
  type CmsInsightStore,
  type InsightValues,
} from "./store";

// «Destacados»: the rules for creating, editing and deleting them.
//
// Unlike a page, an insight *can* be deleted. It is a pointer with a caption,
// not content with a history: nothing links to it, no revision holds it, and
// taking one down is exactly as reversible as writing it again.

export type InsightInput = {
  pageId: string;
  title: string;
  body: string;
  date: string;
  onHomepage: boolean;
};

type PageExists = (id: string) => Promise<boolean>;

const defaultPageExists: PageExists = async (id) =>
  (await cmsPageStore.findPage(id)) !== null;

export class CmsInsightService {
  constructor(
    private readonly store: CmsInsightStore = cmsInsightStore,
    /** Whether the page an insight names exists — any status. A draft is a
     * fine target: the card stays hidden until the page is published, which
     * lets an insight be written alongside the page it announces. */
    private readonly pageExists: PageExists = defaultPageExists,
    private readonly clock: () => Date = () => new Date(),
    private readonly invalidate: () => void = revalidatePublicInsights,
  ) {}

  /** Membership is the read grant, as it is for authors. */
  list(): Promise<ContentInsight[]> {
    return this.store.list();
  }

  /** Every page an insight may name, in every status, with its primary
   * category already resolved to a label. Drafts are included on purpose —
   * see `pageExists`. */
  async pageOptions(actor: CmsActor): Promise<InsightPageOption[]> {
    const [pages, categories] = await Promise.all([
      cmsContentService.list(actor, { withoutLongMetadata: true }),
      Promise.all(CONTENT_SECTIONS.map((s) => cmsCategoryStore.list(s))),
    ]);
    const labels = new Map(
      categories.flat().map((c) => [`${c.section}:${c.key}`, c.label]),
    );
    return pages
      .map((page) => {
        const primary = page.metadata.categories[0];
        return {
          id: page.id,
          section: page.section,
          title: page.title,
          slug: page.slug,
          status: page.status,
          category: primary
            ? (labels.get(`${page.section}:${primary}`) ?? null)
            : null,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  async create(actor: CmsActor, input: InsightInput): Promise<ContentInsight> {
    this.assertAuthor(actor, "crear destacados");
    const values = await this.checked(input);
    const created = await this.store.insert({
      values,
      actorId: actor.userId,
      now: this.clock(),
    });
    this.expire();
    return created;
  }

  async update(
    actor: CmsActor,
    id: string,
    input: InsightInput,
  ): Promise<ContentInsight> {
    this.assertAuthor(actor, "editar destacados");
    const values = await this.checked(input);
    const saved = await this.store.update({
      id,
      values,
      actorId: actor.userId,
      now: this.clock(),
    });
    if (!saved) throw new CmsNotFoundError(`Insight ${id}`);
    this.expire();
    return saved;
  }

  async delete(actor: CmsActor, id: string): Promise<void> {
    this.assertAuthor(actor, "eliminar destacados");
    if (!(await this.store.delete(id))) {
      throw new CmsNotFoundError(`Insight ${id}`);
    }
    this.expire();
  }

  private assertAuthor(actor: CmsActor, operation: string): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError(operation);
  }

  private async checked(input: InsightInput): Promise<InsightValues> {
    const title = filled(input.title, "title", INSIGHT_LIMITS.title);
    const body = filled(input.body, "body", INSIGHT_LIMITS.body);
    const date = calendarDay(input.date);
    const pageId = (input.pageId ?? "").trim();
    if (!pageId || !(await this.pageExists(pageId))) {
      throw invalid(
        "insight.pageId",
        "Elige la página que respalda el dato.",
        "pageId",
      );
    }
    return { pageId, title, body, date, onHomepage: input.onHomepage === true };
  }

  /** Same swallow-and-log as the author service: the row is committed, and a
   * cache failure must not be reported as a failed save. */
  private expire(): void {
    try {
      this.invalidate();
    } catch (cause) {
      console.error("[cms] insight cache invalidation failed:", cause);
    }
  }
}

const invalid = (code: string, message: string, field: string) =>
  new CmsValidationError([{ code, severity: "error", message, field }]);

function filled(value: string, field: string, max: number): string {
  const clean = (value ?? "").trim();
  if (!clean)
    throw invalid(`insight.${field}`, "No puede quedar vacío.", field);
  if (clean.length > max) {
    throw invalid(
      `insight.${field}`,
      `No puede superar ${max} caracteres.`,
      field,
    );
  }
  return clean;
}

/** `YYYY-MM-DD`, and a day that exists — «2026-02-30» is refused rather than
 * rolled over into March by the database. */
function calendarDay(value: string): string {
  const clean = (value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  const day = match ? new Date(`${clean}T00:00:00Z`) : null;
  if (
    !day ||
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== clean
  ) {
    throw invalid("insight.date", "La fecha no es válida.", "date");
  }
  return clean;
}

export const cmsInsightService = new CmsInsightService();
