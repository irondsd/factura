import { NotFoundScreen } from "@/components/NotFoundScreen";

// 404 for the public landing: an unmatched path, a guide slug that doesn't
// exist (`dynamicParams = false` on the article route), or `/en/guias/*`, which
// the guides layout `notFound()`s because the section is Spanish-only.
//
// No `metadata` export: this file isn't a page, so Next doesn't read one from
// it, and the title falls back to the layout's — which is at least the
// localized one. No `robots` either: Next renders `noindex` onto a not-found
// response by itself, and the response carries a real 404 status on top of
// that.
//
// Note this only catches an explicit `notFound()` (an unknown `[lang]`, or
// /en/guias/*, which the guides layout rejects as Spanish-only). A URL that
// matches no route never gets here — that's `src/app/global-not-found.tsx`.
export default function SiteNotFound() {
  return <NotFoundScreen />;
}
