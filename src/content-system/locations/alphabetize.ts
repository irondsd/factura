const spanishLabels = new Intl.Collator("es", {
  sensitivity: "base",
  usage: "sort",
});

export function compareLocationLabels(
  a: Pick<{ label: string }, "label">,
  b: Pick<{ label: string }, "label">,
): number {
  return spanishLabels.compare(a.label, b.label);
}

export function alphabetizeLocations<T extends { label: string }>(
  locations: readonly T[],
): T[] {
  return [...locations].sort(compareLocationLabels);
}

export type LocationLetterGroup<T> = {
  letter: string;
  locations: T[];
};

/** Reader-facing directory groups. Accented initials fold into their base
 * letter, so an eventual Álvarez entry lives under A rather than creating a
 * visually surprising one-item section of its own. */
export function groupLocationsByInitial<T extends { label: string }>(
  locations: readonly T[],
): LocationLetterGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const location of alphabetizeLocations(locations)) {
    const letter =
      location.label
        .trim()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .charAt(0)
        .toLocaleUpperCase("es") || "#";
    const group = groups.get(letter);
    if (group) group.push(location);
    else groups.set(letter, [location]);
  }
  return [...groups].map(([letter, groupedLocations]) => ({
    letter,
    locations: groupedLocations,
  }));
}

export function sortLocationContentByPublication<
  T extends { publishedAt: string | null; slug: string },
>(pages: readonly T[]): T[] {
  return [...pages].sort((a, b) => {
    const aPublished = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bPublished = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bPublished - aPublished || a.slug.localeCompare(b.slug, "es");
  });
}

/** Cached summaries created before the location feature can outlive a deploy.
 * Treat their missing field exactly like the metadata schema does: an empty
 * location set, until normal cache invalidation replaces the old payload. */
export function contentHasLocation(
  page: { metadata: { locations?: readonly string[] } },
  key: string,
): boolean {
  return page.metadata.locations?.includes(key) ?? false;
}
