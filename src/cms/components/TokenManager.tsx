"use client";
import { useState, useTransition } from "react";
import {
  cmsTokensAction,
  createCmsTokenAction,
  revokeCmsTokenAction,
} from "@/cms/server/tokenActions";
import type { CmsApiTokenSummary, CmsScope } from "@/cms/mcp/tokens";

export function TokenManager({ initial }: { initial: CmsApiTokenSummary[] }) {
  const [tokens, setTokens] = useState(initial);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      const result = await createCmsTokenAction({
        name,
        scopes: ["cms:read", "cms:write"] as CmsScope[],
        expiresInDays: 90,
      });
      setFresh(result.token);
      setName("");
      setTokens(await cmsTokensAction());
    });
  const revoke = (id: string) =>
    start(async () => {
      await revokeCmsTokenAction(id);
      setTokens((items) =>
        items.map((item) =>
          item.id === id ? { ...item, revokedAt: new Date() } : item,
        ),
      );
    });
  return (
    <>
      {fresh && (
        <section className="mb-6 border border-accent bg-card p-4">
          <p className="font-mono text-micro uppercase tracking-label-wide text-accent">
            Cópialo ahora: no volverá a mostrarse
          </p>
          <code className="mt-3 block break-all font-mono text-[13px]">
            {fresh}
          </code>
          <button
            className="mt-3 font-mono text-micro underline"
            onClick={() => setFresh(null)}
          >
            Listo
          </button>
        </section>
      )}
      <form
        className="mb-8 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create();
        }}
      >
        <label className="flex-1 font-mono text-micro uppercase tracking-label-wide text-muted">
          Nombre
          <input
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-ink"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="self-end border border-ink bg-ink px-4 py-2 font-mono text-micro text-paper disabled:opacity-50"
          disabled={!name.trim() || pending}
        >
          Crear token
        </button>
      </form>
      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {tokens.map((token) => (
          <li key={token.id} className="border border-line bg-card p-4">
            <div className="flex gap-3">
              <strong className="font-display">{token.name}</strong>
              {token.revokedAt ? (
                <span className="font-mono text-micro text-muted">
                  Revocado
                </span>
              ) : (
                <button
                  className="ml-auto font-mono text-micro text-accent underline"
                  disabled={pending}
                  onClick={() => revoke(token.id)}
                >
                  Revocar
                </button>
              )}
            </div>
            <p className="mt-2 mb-0 font-mono text-micro text-muted">
              {token.scopes.join(", ")} ·{" "}
              {token.lastUsedAt
                ? `usado ${new Date(token.lastUsedAt).toLocaleDateString("es-AR")}`
                : "sin uso"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
