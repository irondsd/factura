// Augments the `*.mdx` module shape (on top of @types/mdx, which types the
// default export) so the `meta` export guides declare is typed when imported.
declare module "*.mdx" {
  export const meta: import("@/content/guias/guides").GuideMeta;
}
