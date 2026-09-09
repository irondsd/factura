export function componentNameToSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function embedPath({
  section,
  componentName,
  articleSlug,
}: {
  section: "estadisticas" | "investigaciones";
  componentName: string;
  articleSlug: string;
}): string {
  return `/embed/${section}/${componentNameToSlug(componentName)}/${articleSlug}`;
}
