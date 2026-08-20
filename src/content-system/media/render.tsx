import "server-only";
import type { MDXComponents } from "mdx/types";
import type { Database } from "@/db";
import { markdownComponents } from "@/mdx-components";
import { mediaIdsIn } from "./references";
import { parseMediaPermalink } from "./permalink";
import { resolveMediaRefs } from "./repository";
import { MediaImage } from "./MediaImage";

// Turning `![alt](/media/<id>/name.jpg)` in a stored body into a real image.
//
// The ids are collected from the body and resolved in **one** query before the
// document renders, and the component map then does a synchronous lookup. An
// async `img` component would be simpler to write and would issue a query per
// image — the cost of a page would scale with how illustrated it is, which is
// exactly the wrong way round.

/** Build the `img` override for one body. Call once per rendered document and
 * pass the result into `contentComponents()`. */
export async function mediaComponents(
  body: string,
  database?: Database,
): Promise<MDXComponents> {
  const media = await resolveMediaRefs(mediaIdsIn(body), database);
  return {
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? src : "";
      const parsed = parseMediaPermalink(url);

      // Not a library image: a `/img/**` path still in a body during the
      // migration. The plain renderer keeps handling those until step 7 of the
      // rollout removes the last one.
      if (!parsed) {
        const Legacy = markdownComponents.img as React.ComponentType<{
          src?: string;
          alt?: string;
        }>;
        return <Legacy src={url} alt={alt ?? ""} />;
      }

      const resolved = media.get(parsed.id);
      if (!resolved) {
        // An id that does not resolve is a validation failure that reached the
        // database — a purged asset, or a hand-edited body. The public page
        // shows a quiet gap rather than crashing, and says enough for whoever
        // opens the CMS to find it.
        return (
          <span
            className="my-6 block border border-dashed border-line px-4 py-6 text-center font-mono text-[12px] text-muted"
            data-media-unresolved={parsed.id}
          >
            Imagen no disponible
          </span>
        );
      }

      return (
        <MediaImage
          media={resolved}
          alt={alt ?? undefined}
          placement="article"
          className="my-6 w-full border border-line"
        />
      );
    },
  };
}
