// Augments the `*.mdx` module shape (on top of @types/mdx, which types the
// default export) so the `meta` export an article declares is visible at all to
// an importer.
//
// It is deliberately `unknown` rather than a concrete type. There are two
// article formats now — `GuideMeta` under content/guias and `SectionMeta`, shared
// by content/estadisticas and content/investigacion — and one ambient
// declaration can't be both. Nothing is
// lost by the widening: `.mdx` files are not type-checked, so this declaration
// never verified any file's meta block, it only typed the consumer. Each content
// module casts once, in its own loader, and the shape is actually enforced by
// `scripts/validate-guides.ts`.
declare module "*.mdx" {
  export const meta: unknown;
}
