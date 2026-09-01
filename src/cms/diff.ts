// Comparing two versions of a page (cms.md).
//
// Pure and shared: the server uses `documentsEqual` to refuse a publication
// that would change nothing, and the «Historial» tab uses the rest to render
// the comparison. One definition of "these two are the same document", so a
// no-op publish and an empty diff can never disagree.
//
// There is exactly one baseline — the live (or last) publication — and no
// pairwise selector. That is a product decision, not a limitation of what is
// below: two arbitrary versions would need a picker, a URL that survives a
// reload, and an answer to "compared against what?" on every screenshot.

/** The authored fields a comparison covers. Identity (`id`, `section`, `slug`)
 * and lifecycle (`status`, `publishedAt`) are deliberately absent: they belong
 * to the page, not to a version of its document, and cannot differ between two
 * revisions of the same page. */
export type ComparableDocument = {
  body: string;
  title: string;
  titleTag: string | null;
  description: string;
  summary: string;
  cta: string;
  canonicalSlug: string | null;
  parentId: string | null;
  sortOrder: number;
  crumb: string | null;
  metadata: unknown;
};

/** The scalar fields, with the words the editor's own form uses for them. */
const FIELD_LABELS: Record<string, string> = {
  title: "Título",
  titleTag: "Título para buscadores",
  description: "Descripción",
  summary: "Resumen",
  cta: "Llamada a la acción",
  canonicalSlug: "Página canónica",
  parentId: "Página madre",
  sortOrder: "Orden",
  crumb: "Nombre corto",
};

const SCALAR_FIELDS = Object.keys(FIELD_LABELS) as (keyof ComparableDocument)[];

export type ChangeKind = "added" | "removed" | "changed";

export type FieldChange = {
  /** `title`, or `metadata.keywords` for a structured one. */
  field: string;
  label: string;
  kind: ChangeKind;
  /** Rendered values, already stringified. Null means "not set on this side". */
  base: string | null;
  candidate: string | null;
};

export type LineChange = {
  kind: "same" | "added" | "removed";
  text: string;
  /** 1-based line number on each side, null where the line does not exist. */
  baseLine: number | null;
  candidateLine: number | null;
};

export type DocumentDiff = {
  fields: FieldChange[];
  body: LineChange[];
  /** How many body lines changed, so the tab can say so without counting. */
  bodyAdded: number;
  bodyRemoved: number;
  identical: boolean;
};

/** Are these the same authored document?
 *
 * `contentUpdatedAt` is not part of the shape at all, on purpose: it moves on
 * every save, so including it would make "publish this again" always look like
 * a change and defeat the no-op check that exists to stop duplicate
 * publications. */
export function documentsEqual(
  base: ComparableDocument,
  candidate: ComparableDocument,
): boolean {
  if (base.body !== candidate.body) return false;
  for (const field of SCALAR_FIELDS) {
    if (!sameScalar(base[field], candidate[field])) return false;
  }
  return stableJson(base.metadata) === stableJson(candidate.metadata);
}

export function diffDocuments(
  base: ComparableDocument,
  candidate: ComparableDocument,
): DocumentDiff {
  const fields: FieldChange[] = [];

  for (const field of SCALAR_FIELDS) {
    const before = base[field];
    const after = candidate[field];
    if (sameScalar(before, after)) continue;
    fields.push({
      field: field as string,
      label: FIELD_LABELS[field as string] ?? (field as string),
      kind: changeKind(before, after),
      base: display(before),
      candidate: display(after),
    });
  }

  fields.push(...metadataChanges(base.metadata, candidate.metadata));

  const body = diffLines(base.body, candidate.body);
  return {
    fields,
    body,
    bodyAdded: body.filter((line) => line.kind === "added").length,
    bodyRemoved: body.filter((line) => line.kind === "removed").length,
    identical: fields.length === 0 && base.body === candidate.body,
  };
}

/** Structured metadata, compared one top-level key at a time.
 *
 * Field level, not deep: a reordered `keywords` array is a change and is shown
 * as one, because the order is authored and the reader sees it. Descending into
 * the array to say *which* entry moved would be a merge algorithm, and this is
 * deliberately not one. */
function metadataChanges(
  baseValue: unknown,
  candidateValue: unknown,
): FieldChange[] {
  const base = asRecord(baseValue);
  const candidate = asRecord(candidateValue);
  const keys = [
    ...new Set([...Object.keys(base), ...Object.keys(candidate)]),
  ].sort();

  return keys.flatMap((key) => {
    const before = base[key];
    const after = candidate[key];
    if (stableJson(before) === stableJson(after)) return [];
    return [
      {
        field: `metadata.${key}`,
        label: METADATA_LABELS[key] ?? key,
        kind: changeKind(before, after),
        base: display(before),
        candidate: display(after),
      },
    ];
  });
}

const METADATA_LABELS: Record<string, string> = {
  keywords: "Palabras clave",
  categories: "Categorías",
  locations: "Ubicaciones",
  faq: "Preguntas frecuentes",
  ogTitle: "Título para redes",
  ogDescription: "Descripción para redes",
  ogImage: "Imagen social",
  ogStat: "Dato destacado",
  vendor: "Empresa",
  previewMediaId: "Imagen de portada",
  authorId: "Autor",
  factCheckerId: "Verificado por",
  sources: "Fuentes",
  methodology: "Metodología",
  dataset: "Conjunto de datos",
};

/** A line-level diff, longest-common-subsequence.
 *
 * Quadratic in the number of lines, which is the right trade here: an article
 * is a few hundred lines, the comparison runs once when a tab is opened, and a
 * proper Myers implementation would be a page of index arithmetic nobody would
 * read twice. If a body ever grows past a few thousand lines this is the place
 * that has to change, and the tests pin the behaviour it has to keep. */
export function diffLines(
  baseBody: string,
  candidateBody: string,
): LineChange[] {
  const a = baseBody.split("\n");
  const b = candidateBody.split("\n");

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: LineChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({
        kind: "same",
        text: a[i],
        baseLine: i + 1,
        candidateLine: j + 1,
      });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({
        kind: "removed",
        text: a[i],
        baseLine: i + 1,
        candidateLine: null,
      });
      i++;
    } else {
      out.push({
        kind: "added",
        text: b[j],
        baseLine: null,
        candidateLine: j + 1,
      });
      j++;
    }
  }
  while (i < a.length) {
    out.push({
      kind: "removed",
      text: a[i],
      baseLine: i + 1,
      candidateLine: null,
    });
    i++;
  }
  while (j < b.length) {
    out.push({
      kind: "added",
      text: b[j],
      baseLine: null,
      candidateLine: j + 1,
    });
    j++;
  }
  return out;
}

/** Only the changed stretches, with a few lines of context either side — the
 * whole body is not a diff, it is the article again. */
export function bodyHunks(
  lines: readonly LineChange[],
  context = 3,
): { lines: LineChange[]; skipped: number }[] {
  const interesting = lines
    .map((line, index) => (line.kind === "same" ? -1 : index))
    .filter((index) => index >= 0);
  if (interesting.length === 0) return [];

  const hunks: { lines: LineChange[]; skipped: number }[] = [];
  let start = Math.max(0, interesting[0] - context);
  let end = Math.min(lines.length - 1, interesting[0] + context);
  let previousEnd = -1;

  for (const index of interesting.slice(1)) {
    if (index - context <= end + 1) {
      end = Math.min(lines.length - 1, index + context);
      continue;
    }
    hunks.push({
      lines: lines.slice(start, end + 1),
      skipped: start - previousEnd - 1,
    });
    previousEnd = end;
    start = Math.max(0, index - context);
    end = Math.min(lines.length - 1, index + context);
  }
  hunks.push({
    lines: lines.slice(start, end + 1),
    skipped: start - previousEnd - 1,
  });
  return hunks;
}

function changeKind(before: unknown, after: unknown): ChangeKind {
  if (isEmpty(before)) return "added";
  if (isEmpty(after)) return "removed";
  return "changed";
}

const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || value === "";

function sameScalar(before: unknown, after: unknown): boolean {
  if (isEmpty(before) && isEmpty(after)) return true;
  return stableJson(before) === stableJson(after);
}

function display(value: unknown): string | null {
  if (isEmpty(value)) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string"))
    return value.join(", ");
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** JSON with object keys sorted, so two metadata blobs that differ only in key
 * order compare equal. Arrays keep their order — that one *is* a change. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
