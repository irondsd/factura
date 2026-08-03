import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_CACHE,
  SHARE_DENIED,
  SHARE_PREFIX,
  takeSharedFiles,
} from "./shareTarget";

const ORIGIN = "https://factura.test";

/** Minimal stand-in for the Cache API, shared by both halves of the flow: only
 * the methods public/sw.js writes with and takeSharedFiles reads with. */
function fakeCaches(entries: Record<string, Blob>) {
  const store = new Map<string, Blob>();
  for (const [path, blob] of Object.entries(entries)) {
    store.set(new URL(path, ORIGIN).toString(), blob);
  }
  const cache = {
    keys: async () => [...store.keys()].map((url) => new Request(url)),
    match: async (request: Request) => {
      const blob = store.get(request.url);
      return blob ? new Response(blob) : undefined;
    },
    delete: async (request: Request) => store.delete(request.url),
    // The worker writes with relative keys; the real Cache API resolves them
    // against the worker's scope.
    put: async (key: string, response: Response) => {
      store.set(new URL(key, ORIGIN).toString(), await response.blob());
    },
  };
  return { store, caches: { open: async () => cache } };
}

/** The service worker writes `/__shared/<id>/<index>/<encoded name>`. */
const key = (id: string, index: number, name: string) =>
  `${SHARE_PREFIX}${id}/${index}/${encodeURIComponent(name)}`;

function install(entries: Record<string, Blob>) {
  const { store, caches } = fakeCaches(entries);
  vi.stubGlobal("caches", caches);
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("takeSharedFiles", () => {
  it("rebuilds the shared files, names and all", async () => {
    install({
      [key("abc", 0, "edenor marzo.pdf")]: new Blob(["%PDF-1.4 one"], {
        type: "application/pdf",
      }),
    });

    const files = await takeSharedFiles("abc");

    expect(files).toHaveLength(1);
    // The name survives the round-trip through the cache key: the ingest
    // pipeline puts it in every toast.
    expect(files[0].name).toBe("edenor marzo.pdf");
    expect(files[0].type).toBe("application/pdf");
    expect(await files[0].text()).toBe("%PDF-1.4 one");
  });

  it("returns files in the order they were shared, not cache order", async () => {
    install({
      [key("abc", 2, "third.pdf")]: new Blob(["3"]),
      [key("abc", 0, "first.pdf")]: new Blob(["1"]),
      [key("abc", 1, "second.pdf")]: new Blob(["2"]),
    });

    const files = await takeSharedFiles("abc");

    expect(files.map((f) => f.name)).toEqual([
      "first.pdf",
      "second.pdf",
      "third.pdf",
    ]);
  });

  it("consumes what it reads, so a refresh can't re-ingest the same share", async () => {
    const store = install({
      [key("abc", 0, "bill.pdf")]: new Blob(["%PDF"]),
    });

    expect(await takeSharedFiles("abc")).toHaveLength(1);
    expect(store.size).toBe(0);
    expect(await takeSharedFiles("abc")).toEqual([]);
  });

  it("ignores files belonging to another share id", async () => {
    install({
      [key("abc", 0, "mine.pdf")]: new Blob(["%PDF"]),
      [key("xyz", 0, "theirs.pdf")]: new Blob(["%PDF"]),
    });

    const files = await takeSharedFiles("abc");

    expect(files.map((f) => f.name)).toEqual(["mine.pdf"]);
  });

  it("returns nothing for the worker's `failed` sentinel", async () => {
    install({ [key("abc", 0, "bill.pdf")]: new Blob(["%PDF"]) });

    expect(await takeSharedFiles("failed")).toEqual([]);
  });

  it("survives a browser with no Cache API at all", async () => {
    vi.stubGlobal("caches", undefined);

    expect(await takeSharedFiles("abc")).toEqual([]);
  });

  it("uses the cache name the service worker writes to", () => {
    // Guards the constants public/sw.js mirrors — a rename on one side only
    // would silently strand every shared file.
    expect(SHARE_CACHE).toBe("factura-share-target");
    expect(SHARE_PREFIX).toBe("/__shared/");
    expect(SHARE_DENIED).toBe("denied");
  });
});

/** Stand-ins for the worker's `GET /api/auth/session` probe: a live session, no
 * session at all, and an endpoint that can't be reached. */
const session = {
  live: async () =>
    Response.json({ user: { email: "vecina@factura.test" }, expires: "…" }),
  none: async () => Response.json({}),
  unreachable: async () => {
    throw new TypeError("Failed to fetch");
  },
};

/** Runs the real public/sw.js against a fake worker global, so the two halves
 * of the share flow are tested against each other rather than against a
 * restatement of the key format. The worker is served raw and never imported,
 * so this is the only thing standing between a typo in it and a share sheet
 * that quietly drops bills. `fetch` is injected rather than stubbed globally so
 * each test can say who is signed in. */
function loadServiceWorker(
  cacheStorage: unknown,
  sessionFetch: () => Promise<Response> = session.live,
) {
  const source = readFileSync(
    new URL("../../public/sw.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map<string, (event: unknown) => void>();
  const asked: string[] = [];
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, fn),
    location: { origin: ORIGIN },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetchImpl = (url: string) => {
    asked.push(url);
    return sessionFetch();
  };
  new Function("self", "caches", "fetch", source)(self, cacheStorage, fetchImpl);
  return { listeners, asked };
}

type Worker = ReturnType<typeof loadServiceWorker>;

/** Push a share POST through the worker's fetch handler. Returns the reply plus
 * the request itself, so a test can check the body was never even read. */
async function share(worker: Worker, form: FormData) {
  const request = new Request(`${ORIGIN}/share-target`, {
    method: "POST",
    body: form,
  });
  let responded: Promise<Response> | undefined;
  worker.listeners.get("fetch")?.({
    request,
    respondWith: (value: Promise<Response>) => {
      responded = value;
    },
  });
  if (!responded) throw new Error("the worker did not answer the share POST");
  return { response: await responded, request };
}

/** A share carrying one PDF. */
function oneBill(name = "bill.pdf") {
  const form = new FormData();
  form.append("file", new File(["%PDF-1.4"], name, { type: "application/pdf" }));
  return form;
}

describe("public/sw.js", () => {
  it("hands the shared PDFs to the page, in one piece", async () => {
    const { caches } = fakeCaches({});
    vi.stubGlobal("caches", caches);
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    const worker = loadServiceWorker(caches);

    const form = new FormData();
    form.append(
      "file",
      new File(["%PDF-1.4 edenor"], "edenor marzo.pdf", {
        type: "application/pdf",
      }),
    );
    form.append(
      "file",
      new File(["%PDF-1.4 aysa"], "aysa marzo.pdf", {
        type: "application/pdf",
      }),
    );
    const { response } = await share(worker, form);

    // 303 is what turns the cookie-less share POST into a GET the session
    // survives — the entire reason this runs in a worker.
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/app");

    const id = location.searchParams.get("share") ?? "";
    expect(id).not.toBe("failed");

    const files = await takeSharedFiles(id);
    expect(files.map((file) => file.name)).toEqual([
      "edenor marzo.pdf",
      "aysa marzo.pdf",
    ]);
    expect(await files[0].text()).toBe("%PDF-1.4 edenor");
    expect(files[1].type).toBe("application/pdf");
  });

  it("sends the page the `failed` id when the share carried no file", async () => {
    const { caches } = fakeCaches({});
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches);

    const { response } = await share(worker, new FormData());

    expect(new URL(response.headers.get("location") ?? "").search).toBe(
      "?share=failed",
    );
  });

  it("drops what a previous, abandoned share left behind", async () => {
    const { store, caches } = fakeCaches({
      [key("stale", 0, "old.pdf")]: new Blob(["%PDF old"]),
    });
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches);

    await share(worker, oneBill("new.pdf"));

    expect([...store.keys()].join()).not.toContain("old.pdf");
    expect([...store.keys()].join()).toContain("new.pdf");
  });

  it("settles who is signed in before it reads the shared file", async () => {
    const { caches } = fakeCaches({});
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches, session.none);

    const { request } = await share(worker, oneBill());

    expect(worker.asked).toEqual(["/api/auth/session"]);
    // The whole point: with no session the body is never even consumed, so
    // there was never a moment where the bill existed outside the request.
    expect(request.bodyUsed).toBe(false);
  });

  it("stores nothing and sends a signed-out sharer to log in", async () => {
    const { store, caches } = fakeCaches({});
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches, session.none);

    const { response } = await share(worker, oneBill("private.pdf"));

    expect(store.size).toBe(0);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("share")).toBe(SHARE_DENIED);
  });

  it("clears an abandoned share once there's no session to file it under", async () => {
    const { store, caches } = fakeCaches({
      [key("stale", 0, "old.pdf")]: new Blob(["%PDF old"]),
    });
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches, session.none);

    await share(worker, oneBill());

    expect(store.size).toBe(0);
  });

  it("stores nothing when the session can't be checked, and asks for a retry", async () => {
    const { store, caches } = fakeCaches({
      [key("stale", 0, "old.pdf")]: new Blob(["%PDF old"]),
    });
    vi.stubGlobal("caches", caches);
    const worker = loadServiceWorker(caches, session.unreachable);

    const { response } = await share(worker, oneBill());

    // Can't confirm a session, so nothing new is written — but an unanswerable
    // check mustn't destroy a share that may still be waiting to be consumed.
    expect([...store.keys()].join()).toContain("old.pdf");
    expect([...store.keys()].join()).not.toContain("bill.pdf");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/app");
    expect(location.searchParams.get("share")).toBe("failed");
  });
});
