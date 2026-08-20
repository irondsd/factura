"use client";

import { useEffect, useState, useTransition } from "react";
import { getMediaAction, listMediaAction } from "../server/actions";
import type { MediaAsset, MediaAssetWithUsage } from "../types";

// Choosing an image from the library, for a page's preview and (later) for
// inserting into prose. One picker for both, because "which image" is the same
// question wherever it is asked.
//
// It writes an **id**, never a URL. That is what lets the storage origin change
// without touching a single page.

export function MediaPicker({
  value,
  onChange,
  describedBy,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [items, setItems] = useState<MediaAssetWithUsage[]>([]);
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  // Resolve the stored id to something an editor can recognize. Without this
  // the field would show a uuid, which is correct and useless.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = value ? await getMediaAction(value) : null;
      if (!cancelled) setSelected(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  const load = (term: string) =>
    start(async () => {
      setItems(
        await listMediaAction({
          statuses: ["ready"],
          search: term || undefined,
          limit: 60,
        }),
      );
    });

  return (
    <div aria-describedby={describedBy}>
      {selected ? (
        <div className="flex items-start gap-3 border border-line bg-card p-2">
          <span className="block h-[54px] w-[96px] shrink-0 overflow-hidden bg-paper">
            {selected.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.src}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </span>
          <span className="min-w-0 flex-1 font-mono text-[12px]">
            <span className="block truncate">{selected.displayName}</span>
            <span className="mt-0.5 block text-muted">
              {selected.width}×{selected.height}
            </span>
            <span className="mt-1 flex gap-3">
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setOpen(true);
                  load(search);
                }}
              >
                Cambiar
              </button>
              <button
                type="button"
                className="text-muted underline"
                onClick={() => onChange(null)}
              >
                Quitar
              </button>
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            load("");
          }}
          className="w-full border border-dashed border-line px-3 py-4 font-mono text-[13px] text-muted hover:border-accent hover:text-accent"
        >
          {value && pending ? "Cargando…" : "Elegir de la biblioteca"}
        </button>
      )}

      {open && (
        <div className="mt-2 border border-line bg-card p-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                load(event.target.value);
              }}
              placeholder="Buscar imágenes"
              className="flex-1 border border-line bg-paper px-2 py-1.5 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-micro uppercase tracking-label-wide text-muted"
            >
              Cerrar
            </button>
          </div>

          {items.length === 0 ? (
            <p className="mt-3 font-mono text-[12px] text-muted">
              {pending
                ? "Buscando…"
                : "No hay imágenes. Súbelas en /cms/media primero."}
            </p>
          ) : (
            <ul className="mt-3 grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto">
              {items.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(asset);
                      onChange(asset.id);
                      setOpen(false);
                    }}
                    className="block w-full border border-line hover:border-accent"
                    title={asset.displayName}
                  >
                    <span className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-paper">
                      {asset.src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="block truncate px-1 py-1 font-mono text-[11px]">
                      {asset.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
