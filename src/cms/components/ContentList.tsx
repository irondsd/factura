import Link from "next/link";
import type { ContentSummary } from "@/content-system/types";
import { buildContentTree, depthOf } from "@/content-system/hierarchy";
import { formatContentDateTime } from "@/lib/content-date";
import type { CmsSection } from "../sections";
import { cmsEditPath } from "../sections";
import { StatusChip } from "./StatusChip";

// A section's pages, as the tree rather than a flat list.
//
// Uniform across sections (§7.1): guides are all top level today and render as
// a flat list because that is what their tree *is*, not because this component
// checks which section it is showing.

export function ContentList({
  section,
  pages,
  emptyMessage,
}: {
  section: CmsSection;
  pages: readonly ContentSummary[];
  emptyMessage: string;
}) {
  if (pages.length === 0) {
    return (
      <p className="font-mono text-[14px] leading-[1.7] text-muted border border-line border-dashed px-5 py-8 text-center">
        {emptyMessage}
      </p>
    );
  }

  // The tree is built from whatever survived the filters. A child whose parent
  // was filtered out still shows, at its own depth — losing it silently would
  // be worse than showing it out of context.
  const ordered = flatten(buildContentTree([...pages]));

  return (
    <table className="w-full border-collapse font-mono text-[13px]">
      <thead>
        <tr>
          <Th>Página</Th>
          <Th className="w-[130px]">Estado</Th>
          <Th className="w-[170px] hidden md:table-cell">Última edición</Th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((page) => (
          <tr key={page.id} className="border-b border-line/60">
            <td className="py-3 pr-4 align-top">
              {/* Indented by path depth, so a hub and its children read as a
                  tree without a second column of tree glyphs. */}
              <span
                style={{ paddingLeft: `${(depthOf(page.slug) - 1) * 18}px` }}
                className="block"
              >
                <Link
                  href={cmsEditPath(section.id, page.id)}
                  className="text-ink no-underline hover:text-accent"
                >
                  {page.title || <em className="text-muted">Sin título</em>}
                </Link>
                <span className="block text-muted text-[12px] mt-0.5">
                  {section.publicPath}/{page.slug}
                </span>
                {/* A row whose stored metadata no longer matches its schema.
                    It still lists and still opens — that is the whole point of
                    the CMS's lenient read — but it says so, because its fields
                    will look empty in the editor and that would otherwise read
                    as data loss rather than as a page needing repair. */}
                {page.metadataError && (
                  <span className="block text-[var(--vendor-ochre)] text-[12px] mt-0.5">
                    Metadatos ilegibles — abre la página para volver a
                    completarlos.
                  </span>
                )}
              </span>
            </td>
            <td className="py-3 pr-4 align-top">
              <StatusChip status={page.status} />
            </td>
            <td className="py-3 align-top text-muted hidden md:table-cell">
              {formatContentDateTime(page.updatedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

type TreeNode = { page: ContentSummary; children: TreeNode[] };

function flatten(nodes: TreeNode[]): ContentSummary[] {
  return nodes.flatMap((node) => [node.page, ...flatten(node.children)]);
}
