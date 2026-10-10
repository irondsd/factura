import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  RangeSetBuilder,
  StateField,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import {
  formatImageBytes,
  isTaskImageType,
  MAX_TASK_IMAGE_BYTES,
  parseTaskImageUrl,
  TASK_IMAGE_ENDPOINT,
  uploadPlaceholder,
} from "../images";

// Screenshots in a task description, the way GitHub does it: paste (or drop)
// an image, a placeholder goes in at the cursor while it uploads, and the
// placeholder becomes `![](url)` when the address comes back.
//
// The description stays Markdown source — the `![](url)` line is kept and
// edited like any other — and the image itself is drawn on the line below it.
// Only images under our own media origin are drawn; any other address stays
// text. Tasks only: the page editor inserts media through the library.

// ── Placeholders ────────────────────────────────────────────────────────────

const placeholder = uploadPlaceholder;

export const newUploadToken = (): string =>
  Math.random().toString(36).slice(2, 10);

/** `lines` inserted at `from`–`to` as lines of their own — the image is drawn
 * under its line — breaking the text around them where needed. `after` is the
 * start of the line that follows them. */
function onOwnLines(
  state: EditorState,
  from: number,
  to: number,
  lines: readonly string[],
): { insert: string; after: number } {
  const { doc } = state;
  const before =
    from > 0 && doc.sliceString(from - 1, from) !== "\n" ? "\n" : "";
  const nextIsBreak = doc.sliceString(to, to + 1) === "\n";
  const insert = before + lines.join("\n") + (nextIsBreak ? "" : "\n");
  // Past the inserted break, or past the one that was already there.
  return { insert, after: from + insert.length + (nextIsBreak ? 1 : 0) };
}

/** Insert one placeholder per token at `range` and leave the cursor on the
 * line after them, so typing carries on below the image. */
export function insertPlaceholders(
  state: EditorState,
  tokens: readonly string[],
  range: { from: number; to: number },
): TransactionSpec {
  const { insert, after } = onOwnLines(
    state,
    range.from,
    range.to,
    tokens.map(placeholder),
  );
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: after },
    scrollIntoView: true,
    userEvent: "input.paste",
  };
}

/** Take a placeholder out — with its line, when it is alone on one. Kept out
 * of the undo history: ⌘Z should never bring a placeholder back, because no
 * upload would ever replace it. Null when the placeholder is gone already
 * (deleted or edited while the upload ran). */
export function removePlaceholder(
  state: EditorState,
  token: string,
): { spec: TransactionSpec; at: number } | null {
  const text = placeholder(token);
  const from = state.doc.toString().indexOf(text);
  if (from < 0) return null;
  let start = from;
  let to = from + text.length;
  const line = state.doc.lineAt(from);
  if (line.from === from && line.to === to) {
    if (line.to < state.doc.length) to += 1;
    else if (line.from > 0) start -= 1;
  }
  return {
    spec: {
      changes: { from: start, to },
      annotations: Transaction.addToHistory.of(false),
    },
    at: start,
  };
}

/** Put the uploaded image where its placeholder was, as an undo step of its
 * own — one ⌘Z removes it. The image text has to be inserted *by* a history
 * event for that to work: CodeMirror's undo never deletes text that a
 * transaction outside the history wrote, which is why this isn't one swap.
 *
 * A cursor sitting exactly there ends up after the image, not before it. */
export function insertImage(
  state: EditorState,
  at: number,
  url: string,
): TransactionSpec {
  const { insert } = onOwnLines(state, at, at, [`![](${url})`]);
  const changes = state.changes({ from: at, insert });
  return {
    changes,
    selection: state.selection.map(changes, 1),
    annotations: isolateHistory.of("full"),
    userEvent: "input.paste",
  };
}

// ── Uploading ───────────────────────────────────────────────────────────────

/** Why a file can't be uploaded, checked before it is sent. The server checks
 * again; this only saves a pointless round trip. */
export function rejectionFor(file: { type: string; size: number }): string | null {
  if (!isTaskImageType(file.type))
    return "Solo se pueden pegar imágenes PNG, JPEG, WebP, AVIF o GIF.";
  if (file.size > MAX_TASK_IMAGE_BYTES)
    return `La imagen pesa ${formatImageBytes(file.size)} y el máximo es ${formatImageBytes(MAX_TASK_IMAGE_BYTES)}.`;
  return null;
}

/** Send one image; resolves to its public address. */
export async function uploadTaskImageFile(file: File): Promise<string> {
  let response: Response;
  try {
    response = await fetch(TASK_IMAGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new Error("No se pudo subir la imagen: sin conexión con el servidor.");
  }
  const body = (await response.json().catch(() => null)) as {
    url?: string;
    message?: string;
  } | null;
  if (!response.ok || !body?.url)
    throw new Error(body?.message ?? "No se pudo subir la imagen.");
  return body.url;
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

type Options = {
  /** The media bucket's public origin; images elsewhere are not drawn. */
  origin: string;
  upload: (file: File) => Promise<string>;
  notify: (message: string) => void;
};

function start(
  view: EditorView,
  files: File[],
  range: { from: number; to: number },
  { upload, notify }: Options,
) {
  const accepted: File[] = [];
  for (const file of files) {
    const rejection = rejectionFor(file);
    if (rejection) notify(rejection);
    else accepted.push(file);
  }
  if (accepted.length === 0) return;

  const tokens = accepted.map(newUploadToken);
  view.dispatch(insertPlaceholders(view.state, tokens, range));

  accepted.forEach((file, index) => {
    const token = tokens[index];
    const finish = (url: string | null) => {
      // The dialog may have closed while the upload ran.
      if (!view.dom.isConnected) return;
      // One at a time: the second step is computed against the first's result.
      const removed = removePlaceholder(view.state, token);
      if (!removed) return;
      view.dispatch(removed.spec);
      if (url) view.dispatch(insertImage(view.state, removed.at, url));
    };
    upload(file).then(finish, (error: unknown) => {
      notify(error instanceof Error ? error.message : "No se pudo subir la imagen.");
      finish(null);
    });
  });
}

function handlers(options: Options) {
  const editable = (view: EditorView) => view.state.facet(EditorView.editable);
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      const files = imageFiles(data);
      if (!files.length || !editable(view)) return false;
      // Office apps put a picture of the selection next to the text they copy;
      // there the text is what was meant. A screenshot, or "Copy image" in a
      // browser, carries no plain text alongside the HTML.
      if (data?.types.includes("text/plain") && data.types.includes("text/html"))
        return false;
      event.preventDefault();
      start(view, files, view.state.selection.main, options);
      return true;
    },
    dragover(event, view) {
      if (editable(view) && event.dataTransfer?.types.includes("Files"))
        event.preventDefault();
      return false;
    },
    drop(event, view) {
      const files = imageFiles(event.dataTransfer);
      if (!files.length || !editable(view)) return false;
      event.preventDefault();
      const at =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;
      start(view, files, { from: at, to: at }, options);
      return true;
    },
  });
}

// ── Drawing ─────────────────────────────────────────────────────────────────

export type TaskImageBlock = {
  /** End of the line the `![](url)` is on; the image is drawn after it. */
  at: number;
  url: string;
  width: number;
  height: number;
};

/** Every image of ours in the description, in document order. Read from the
 * syntax tree, so an address inside a code block is left alone. */
export function taskImageBlocks(
  state: EditorState,
  origin: string,
): TaskImageBlock[] {
  const blocks: TaskImageBlock[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Image") return;
      const urlNode = node.node.getChild("URL");
      if (!urlNode) return false;
      const url = state.sliceDoc(urlNode.from, urlNode.to);
      const size = parseTaskImageUrl(url, origin);
      if (size) blocks.push({ at: state.doc.lineAt(node.to).to, url, ...size });
      return false;
    },
  });
  return blocks;
}

class ImageWidget extends WidgetType {
  constructor(readonly block: TaskImageBlock) {
    super();
  }

  eq(other: ImageWidget) {
    return other.block.url === this.block.url;
  }

  toDOM() {
    const { url, width, height } = this.block;
    const wrap = document.createElement("div");
    wrap.className = "cm-task-image";
    wrap.style.setProperty("--w", String(width));
    wrap.style.setProperty("--h", String(height));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Abrir la imagen";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.width = width;
    img.height = height;
    img.decoding = "async";
    link.append(img);
    wrap.append(link);
    return wrap;
  }
}

function decorationsFor(state: EditorState, origin: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of taskImageBlocks(state, origin))
    builder.add(
      block.at,
      block.at,
      Decoration.widget({ widget: new ImageWidget(block), block: true, side: 1 }),
    );
  return builder.finish();
}

/** Block widgets have to come from state, not from a view plugin. */
function imageField(origin: string) {
  return StateField.define<DecorationSet>({
    create: (state) => decorationsFor(state, origin),
    update(decorations, tr) {
      return tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)
        ? decorationsFor(tr.state, origin)
        : decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

// At its own size, never wider than the editor. The box is the image's height
// rounded up to whole ruled lines and painted in the editor's colour, so the
// text below stays on its rules. The height comes from the dimensions in the
// address, so the space is reserved before the image arrives and nothing
// jumps when it does.
const theme = EditorView.theme({
  ".cm-task-image": {
    containerType: "inline-size",
    background: "var(--task-editor-bg)",
    // Over the content's side padding too (`TaskDescriptionEditor`'s 16px),
    // where the rules would otherwise show either side of the box. `cqw` is
    // measured inside the padding, so the image's limit is unchanged.
    margin: "0 -16px",
    padding: "0 16px",
  },
  ".cm-task-image > a": {
    display: "block",
    width: "min(calc(var(--w) * 1px), 100%)",
    height:
      "round(up, min(calc(var(--w) * 1px), 100cqw) * var(--h) / var(--w), 1.75rem)",
    cursor: "zoom-in",
  },
  ".cm-task-image img": {
    display: "block",
    width: "100%",
    height: "auto",
    aspectRatio: "var(--w) / var(--h)",
    outline: "1px solid var(--line)",
    outlineOffset: "-1px",
  },
});

export function taskEditorImages(options: Options) {
  return [imageField(options.origin), handlers(options), theme];
}
