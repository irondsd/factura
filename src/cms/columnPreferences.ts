import type { ContentSection } from "@/content-system/types";

/**
 * The column registry is the one place that knows the stable ids and default
 * order of the CMS list. A section-specific column can opt into one or more
 * sections without changing the preference format: a missing preference entry
 * means that a newly introduced column uses the current default.
 */
export type ContentColumnDefinitionShape = {
  id: string;
  label: string;
  locked?: boolean;
  sections?: readonly ContentSection[];
};

export const CONTENT_COLUMN_DEFINITIONS = [
  { id: "page", label: "Página", locked: true },
  { id: "status", label: "Estado" },
  { id: "credits", label: "Créditos" },
  { id: "created", label: "Creada" },
  { id: "updated", label: "Última edición" },
] as const satisfies readonly ContentColumnDefinitionShape[];

export type ContentColumnDefinition =
  (typeof CONTENT_COLUMN_DEFINITIONS)[number] & ContentColumnDefinitionShape;
export type ContentColumnId = ContentColumnDefinition["id"];
export type ColumnMoveDirection = "up" | "down";
export type ColumnPlacementSide = "before" | "after";

export type ColumnPlacement = {
  relativeTo: string;
  side: ColumnPlacementSide;
};

/** The stored representation is intentionally sparse. It contains no complete
 * order list: hidden ids and placement constraints are the only deviations
 * from the current registry. Unknown ids can therefore be ignored when the
 * registry grows or a column is retired. */
export type ColumnPreferences = {
  version: 1;
  hidden: string[];
  placements: Record<string, ColumnPlacement>;
};

const PREFERENCES_VERSION = 1 as const;

export const PREFERENCES_CHANGED_EVENT = "factura:cms-columns-changed";

const memoryPreferences = new Map<ContentSection, string>();

const knownColumnIds = new Set<string>(
  CONTENT_COLUMN_DEFINITIONS.map((column) => column.id),
);

const columnById = new Map<string, ContentColumnDefinition>(
  CONTENT_COLUMN_DEFINITIONS.map((column) => [column.id, column]),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isKnownColumnId = (value: unknown): value is ContentColumnId =>
  typeof value === "string" && knownColumnIds.has(value);

const isLockedColumn = (value: string): boolean =>
  columnById.get(value)?.locked === true;

const idsForColumns = (
  columns: readonly ContentColumnDefinition[],
): Set<string> => new Set(columns.map((column) => column.id));

/** The columns currently available to one CMS section. */
export function contentColumnsForSection(
  section: ContentSection,
): readonly ContentColumnDefinition[] {
  return CONTENT_COLUMN_DEFINITIONS.filter((column) => {
    const sections = (column as ContentColumnDefinition).sections;
    return !sections || sections.includes(section);
  });
}

function emptyPreferences(): ColumnPreferences {
  return {
    version: PREFERENCES_VERSION,
    hidden: [],
    placements: {},
  };
}

function normalizePreferences(
  value: {
    hidden?: unknown;
    placements?: unknown;
  },
  section?: ContentSection,
): ColumnPreferences {
  const available = section
    ? idsForColumns(contentColumnsForSection(section))
    : knownColumnIds;
  const hidden = Array.isArray(value.hidden)
    ? [...new Set(value.hidden)].filter(
        (id): id is string =>
          typeof id === "string" &&
          available.has(id) &&
          knownColumnIds.has(id) &&
          !isLockedColumn(id),
      )
    : [];

  const placements: Record<string, ColumnPlacement> = {};
  if (isRecord(value.placements)) {
    for (const [columnId, placement] of Object.entries(value.placements)) {
      if (
        !available.has(columnId) ||
        !knownColumnIds.has(columnId) ||
        isLockedColumn(columnId) ||
        !isRecord(placement) ||
        !isKnownColumnId(placement.relativeTo) ||
        !available.has(placement.relativeTo) ||
        placement.relativeTo === columnId ||
        (placement.side !== "before" && placement.side !== "after") ||
        // Página is a permanent first column. A corrupt or hand-edited
        // preference must not be able to place anything before it.
        (placement.relativeTo === "page" && placement.side === "before")
      ) {
        continue;
      }

      placements[columnId] = {
        relativeTo: placement.relativeTo,
        side: placement.side,
      };
    }
  }

  return { version: PREFERENCES_VERSION, hidden, placements };
}

/**
 * Read both the current object format and the original hidden-id array. The
 * old array is deliberately accepted forever: existing browser preferences
 * should not make the new modal appear to have reset itself.
 */
export function parseColumnPreferences(
  value: string | null,
  section?: ContentSection,
): ColumnPreferences {
  if (!value) return emptyPreferences();

  try {
    const parsed: unknown = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return normalizePreferences({ hidden: parsed }, section);
    }

    if (!isRecord(parsed) || parsed.version !== PREFERENCES_VERSION) {
      return emptyPreferences();
    }

    return normalizePreferences(parsed, section);
  } catch {
    return emptyPreferences();
  }
}

/** Backwards-compatible helper retained for callers that only need visibility. */
export function parseHiddenColumns(value: string | null): string[] {
  return parseColumnPreferences(value).hidden;
}

export function columnSettingsStorageKey(section: ContentSection): string {
  return `factura.cms.columns.${section}`;
}

export function readStoredColumnPreferences(
  section: ContentSection,
): string | null {
  if (typeof window === "undefined") {
    return memoryPreferences.get(section) ?? null;
  }

  try {
    return (
      window.localStorage.getItem(columnSettingsStorageKey(section)) ??
      memoryPreferences.get(section) ??
      null
    );
  } catch {
    return memoryPreferences.get(section) ?? null;
  }
}

export function saveColumnPreferences(
  section: ContentSection,
  preferences: ColumnPreferences,
): void {
  const normalized = normalizePreferences(preferences, section);
  const serialized = serializeColumnPreferences(normalized);

  // Keep an in-memory copy too: storage can be unavailable in a locked-down
  // browser, but the choice should still apply for the current visit.
  memoryPreferences.set(section, serialized);

  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(columnSettingsStorageKey(section), serialized);
  } catch {
    // Persistence is the only part lost when local storage is unavailable.
  }

  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
}

function addEdge(
  edges: Map<string, Set<string>>,
  indegree: Map<string, number>,
  from: string,
  to: string,
): void {
  const outgoing = edges.get(from);
  if (!outgoing || outgoing.has(to)) return;
  outgoing.add(to);
  indegree.set(to, (indegree.get(to) ?? 0) + 1);
}

function reaches(
  edges: Map<string, Set<string>>,
  start: string,
  wanted: string,
): boolean {
  const seen = new Set<string>();
  const pending = [start];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    if (current === wanted) return true;
    seen.add(current);
    for (const next of edges.get(current) ?? []) pending.push(next);
  }

  return false;
}

/**
 * Resolve placement constraints against a supplied default registry. This is
 * exported separately so the invariants can be tested with a future column
 * inserted into the default list.
 *
 * A placement becomes one directed constraint. The stable topological sort
 * keeps unconstrained columns in their current default order. If old or hand-
 * edited data creates a cycle, the offending edge is ignored and the list
 * still renders in a usable order.
 */
export function resolveColumnOrderForColumns(
  columns: readonly ContentColumnDefinitionShape[],
  preferences: ColumnPreferences,
): string[] {
  const ids = columns.map((column) => column.id);
  const available = new Set(ids);
  const defaultIndex = new Map(ids.map((id, index) => [id, index]));
  const edges = new Map<string, Set<string>>(
    ids.map((id) => [id, new Set<string>()]),
  );
  const indegree = new Map(ids.map((id) => [id, 0]));

  for (const [columnId, placement] of Object.entries(preferences.placements)) {
    if (
      !available.has(columnId) ||
      !available.has(placement.relativeTo) ||
      columnId === "page" ||
      placement.relativeTo === columnId
    ) {
      continue;
    }

    const from = placement.side === "after" ? placement.relativeTo : columnId;
    const to = placement.side === "after" ? columnId : placement.relativeTo;

    // Página must stay first, even if a future version or hand-edited value
    // tries to introduce an edge pointing into it.
    if (to === "page" || reaches(edges, to, from)) continue;
    addEdge(edges, indegree, from, to);
  }

  const ready = ids
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) => (defaultIndex.get(a) ?? 0) - (defaultIndex.get(b) ?? 0));
  const resolved: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) continue;
    resolved.push(current);

    for (const next of edges.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        ready.push(next);
        ready.sort(
          (a, b) => (defaultIndex.get(a) ?? 0) - (defaultIndex.get(b) ?? 0),
        );
      }
    }
  }

  // The cycle guard above should make this unnecessary, but retaining the
  // default tail is safer than rendering an incomplete table if future data
  // ever violates that assumption.
  for (const id of ids) {
    if (!resolved.includes(id)) resolved.push(id);
  }

  return resolved;
}

export function resolveColumnOrder(
  section: ContentSection,
  preferences: ColumnPreferences,
): string[] {
  return resolveColumnOrderForColumns(
    contentColumnsForSection(section),
    preferences,
  );
}

function placementsForOrder(
  section: ContentSection,
  order: readonly string[],
): Record<string, ColumnPlacement> {
  const defaultOrder = contentColumnsForSection(section).map(
    (column) => column.id,
  );
  const defaultPrevious = new Map<string, string | undefined>();
  for (let index = 1; index < defaultOrder.length; index += 1) {
    defaultPrevious.set(defaultOrder[index], defaultOrder[index - 1]);
  }

  const placements: Record<string, ColumnPlacement> = {};
  for (let index = 1; index < order.length; index += 1) {
    const columnId = order[index];
    const previousId = order[index - 1];
    if (
      columnId === "page" ||
      !columnId ||
      !previousId ||
      defaultPrevious.get(columnId) === previousId
    ) {
      continue;
    }

    placements[columnId] = { relativeTo: previousId, side: "after" };
  }

  return placements;
}

/** Move one row in the modal and encode the resulting order as sparse rules. */
export function moveContentColumn(
  section: ContentSection,
  preferences: ColumnPreferences,
  columnId: string,
  direction: ColumnMoveDirection,
): ColumnPreferences {
  const order = resolveColumnOrder(section, preferences);
  const index = order.indexOf(columnId);
  if (index < 0 || columnId === "page" || isLockedColumn(columnId)) {
    return preferences;
  }

  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex <= 0 || nextIndex >= order.length) return preferences;

  const nextOrder = [...order];
  [nextOrder[index], nextOrder[nextIndex]] = [
    nextOrder[nextIndex],
    nextOrder[index],
  ];

  return {
    version: PREFERENCES_VERSION,
    hidden: [...preferences.hidden],
    placements: placementsForOrder(section, nextOrder),
  };
}

export function serializeColumnPreferences(
  preferences: ColumnPreferences,
): string {
  return JSON.stringify(preferences);
}
