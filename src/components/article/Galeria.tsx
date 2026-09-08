import { Children, isValidElement, type ReactNode } from "react";
import { unoptimizedMedia } from "@/content-system/media/MediaImage";
import { parseMediaPermalink } from "@/content-system/media/permalink";
import type { MediaRef } from "@/content-system/media/repository";
import {
  GaleriaViewer,
  type GalleryImage,
} from "@/components/article/GaleriaViewer";

// A row of screenshots in an article — the two or three pictures a "cómo pagar
// la factura de X" guide needs, shown as matching tiles and opened full-screen
// on a click.
//
//     <Galeria title="Pantallas · Pago Rápido">
//
//     ![El buscador de suministro de EDERSA](/media/<id>/edersa-1.png "Ingresá el DNI, el CUIT o el NIS.")
//     ![El resumen del período a pagar](/media/<id>/edersa-2.png)
//
//     </Galeria>
//
// ── Why the images are markdown children and not properties ───────────────
// The obvious shape, `images={["…", "…"]}`, cannot be written: the content
// grammar refuses every expression attribute, so an array literal never
// reaches a saved body (`validation/grammar.ts`). Numbered string properties
// (`src1`, `src2`) would pass, but they take the pictures out of the prose and
// away from the alt-text rules — `validation/document.ts` checks alt on
// markdown images, and `media/references.ts` counts them as uses so the
// library knows the asset is live. Markdown children keep both of those, and
// keep the author writing images the one way they already write them.
//
// The cost is that the shape has to be enforced rather than assumed, and it
// is: the definition declares `children: { only: "image", … }` and the grammar
// validator refuses a `<Galeria>` holding prose, a link, or one lonely image.
//
// ── Why the media map arrives as a property ───────────────────────────────
// The gallery needs each picture's bytes and its intrinsic size, which live in
// the media library. `mediaComponents()` already resolves every image in a body
// in one query before the document renders, so it binds this component too and
// hands the map down. Resolving here instead would put a second query on the
// page for every gallery in it.

/** The gallery an author writes around markdown images. */
export function Galeria({
  title,
  children,
  media,
}: {
  title?: string;
  children?: ReactNode;
  /** Every image in the body, resolved. Injected by `mediaComponents()`; when
   * it is absent nobody has resolved anything, and the honest render is the
   * pictures as the markdown wrote them. */
  media?: ReadonlyMap<string, MediaRef>;
}) {
  if (!media) return <>{children}</>;

  const images: GalleryImage[] = [];
  for (const { src, alt, caption } of markdownImagesIn(children)) {
    const parsed = parseMediaPermalink(src);
    const resolved = parsed && media.get(parsed.id);
    // An id that does not resolve was refused at save time — a purged asset or
    // a hand-edited body. Dropping it is deliberate: a hole in a grid of tiles
    // reads as a layout bug, where the same gap in the article's prose (see
    // `media/render.tsx`) reads as the missing picture it is.
    if (!resolved) continue;
    images.push({
      src: resolved.src,
      width: resolved.width,
      height: resolved.height,
      alt: alt ?? (resolved.decorative ? "" : resolved.defaultAlt),
      ...(caption ? { caption } : {}),
      ...(unoptimizedMedia(resolved) ? { unoptimized: true } : {}),
    });
  }

  if (images.length === 0) return null;
  return <GaleriaViewer images={images} title={title} />;
}

type AuthoredImage = { src: string; alt?: string; caption?: string };

/** The images inside a gallery, in the order the author wrote them.
 *
 * MDX hands `<Galeria>` the *elements* its markdown compiled to, not the
 * markdown: a paragraph per line, each holding whatever the component map binds
 * to `img`. So the walk looks for a `src` rather than for a component — the
 * binding differs between the public page, the CMS preview and a test, and the
 * property MDX fills in from `![…](…)` does not. */
function markdownImagesIn(children: ReactNode): AuthoredImage[] {
  const out: AuthoredImage[] = [];

  const visit = (node: ReactNode) => {
    for (const child of Children.toArray(node)) {
      if (!isValidElement(child)) continue;
      const props = child.props as {
        src?: unknown;
        alt?: unknown;
        title?: unknown;
        children?: ReactNode;
      };
      if (typeof props.src === "string") {
        out.push({
          src: props.src,
          ...(typeof props.alt === "string" ? { alt: props.alt } : {}),
          // `![alt](url "Un pie de foto")`. The markdown title is the caption
          // printed under the tile; the alt stays the alt.
          ...(typeof props.title === "string" && props.title.trim()
            ? { caption: props.title.trim() }
            : {}),
        });
        continue;
      }
      visit(props.children);
    }
  };

  visit(children);
  return out;
}
