"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button, Checkbox, ErrorBox, Select } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { trpc, type RouterOutputs } from "@/lib/trpc";

/** Permanent account deletion, on its own page rather than a dialog: the run
 * takes visible time, it asks real questions about shared properties, and its
 * last step destroys the session the surrounding app chrome depends on. That's
 * also why this route sits OUTSIDE `/app/*` — the app layout bounces a signed-out
 * visitor to /login, which would rip the "everything is gone" screen away the
 * moment it became true. Here the only thing left really is the cookie, and the
 * user closes it themselves. */

type Summary = RouterOutputs["account"]["summary"];
type Property = Summary["properties"][number];

/** What the user chose for a property only they own that other people are in. */
type Decision = { action: "delete" } | { action: "handover"; toUserId: string };

type StepKey =
  | "handOver"
  | "files"
  | "bills"
  | "properties"
  | "parsers"
  | "finalize";
type StepStatus = "pending" | "running" | "done" | "error";
type StepState = { status: StepStatus; detail?: string };

const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : String(e ?? "");

export default function DeleteAccountPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useI18n();
  const td = t.deleteAccount;

  const [phase, setPhase] = useState<"review" | "running" | "done">("review");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [understood, setUnderstood] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    handOver: { status: "pending" },
    files: { status: "pending" },
    bills: { status: "pending" },
    properties: { status: "pending" },
    parsers: { status: "pending" },
    finalize: { status: "pending" },
  });
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stop reading once the run starts: past `finalize` there is no account left
  // to summarize, and a refetch-on-focus would only 401.
  const summary = trpc.account.summary.useQuery(undefined, {
    enabled: phase === "review",
  });

  const handOver = trpc.account.handOver.useMutation();
  const deleteFiles = trpc.account.deleteFiles.useMutation();
  const deleteBills = trpc.account.deleteBills.useMutation();
  const deleteProperties = trpc.account.deleteProperties.useMutation();
  const deleteParsers = trpc.account.deleteParsers.useMutation();
  const finalize = trpc.account.finalize.useMutation();

  // Signed out → /login, but never once the account is gone: at that point an
  // invalid session is the expected end state, not a reason to bounce.
  useEffect(() => {
    if (status === "unauthenticated" && phase === "review")
      router.replace("/login");
  }, [status, phase, router]);

  const data = summary.data;
  const properties = useMemo(() => data?.properties ?? [], [data]);

  const decisionFor = (p: Property): Decision | undefined =>
    p.fate === "choose" ? decisions[p.id] : undefined;

  /** Will this property be torn down? Everything the user is alone in, plus the
   * shared ones they haven't rescued — an undecided one counts as deleted here,
   * because the tallies must never read 0 while a property full of bills hangs
   * on a choice. Picking "hand it over" is what takes it back out. */
  const isDoomed = (p: Property) =>
    p.fate === "destroy" ||
    (p.fate === "choose" && decisionFor(p)?.action !== "handover");

  const doomed = properties.filter(isDoomed);
  const survivors = properties.filter((p) => !isDoomed(p));
  const totals = {
    bills: doomed.reduce((n, p) => n + p.bills, data?.inbox.bills ?? 0),
    files: doomed.reduce((n, p) => n + p.files, data?.inbox.files ?? 0),
    properties: doomed.length,
    reattributed: survivors.reduce((n, p) => n + p.myBills, 0),
  };

  const undecided = properties.filter(
    (p) => p.fate === "choose" && !decisions[p.id],
  );
  const ready = understood && undecided.length === 0 && !!data;

  // Everyone the user shares with keeps everything: the account still goes, but
  // not one bill does. Worth saying out loud — three zeros read like a bug.
  const nothingDeleted =
    !!data && totals.bills === 0 && totals.files === 0 && doomed.length === 0;

  // `handOver` always runs — it is what every later step's precondition checks —
  // but for someone with nothing shared it has nothing to say, so it's kept out
  // of the progress list rather than reporting "0 handed over".
  const shares = properties.some((p) => p.fate !== "destroy");

  const ordered: { key: StepKey; label: string; run: () => Promise<string> }[] =
    [
      {
        key: "handOver",
        label: td.stepHandOver,
        run: async () => {
          const r = await handOver.mutateAsync({
            decisions: properties
              .filter((p) => p.fate === "choose")
              .map((p) => ({ propertyId: p.id, ...decisions[p.id] })),
          });
          return interpolate(td.resultHandOver, r);
        },
      },
      {
        key: "files",
        label: td.stepFiles,
        run: async () => {
          const r = await deleteFiles.mutateAsync();
          return r.failed > 0
            ? interpolate(td.resultFilesFailed, {
                count: r.deleted,
                failed: r.failed,
              })
            : interpolate(td.resultFiles, { count: r.deleted });
        },
      },
      {
        key: "bills",
        label: td.stepBills,
        run: async () => {
          const r = await deleteBills.mutateAsync();
          return interpolate(td.resultBills, { count: r.bills });
        },
      },
      {
        key: "properties",
        label: td.stepProperties,
        run: async () => {
          const r = await deleteProperties.mutateAsync();
          return interpolate(td.resultProperties, { count: r.properties });
        },
      },
      {
        key: "parsers",
        label: td.stepParsers,
        run: async () => {
          const r = await deleteParsers.mutateAsync();
          return interpolate(td.resultParsers, r);
        },
      },
      {
        key: "finalize",
        label: td.stepFinalize,
        run: async () => {
          await finalize.mutateAsync();
          return td.resultFinalize;
        },
      },
    ];

  /** Run the steps in order from `startAt`, stopping at the first failure.
   * Every step is re-runnable, so retrying resumes from the one that broke
   * rather than starting over. */
  async function run(startAt: number) {
    setPhase("running");
    setError(null);
    setFailedAt(null);
    for (let i = startAt; i < ordered.length; i++) {
      const step = ordered[i];
      setSteps((s) => ({ ...s, [step.key]: { status: "running" } }));
      try {
        const detail = await step.run();
        setSteps((s) => ({ ...s, [step.key]: { status: "done", detail } }));
      } catch (e) {
        setSteps((s) => ({
          ...s,
          [step.key]: { status: "error", detail: messageOf(e) },
        }));
        setError(messageOf(e));
        setFailedAt(i);
        return;
      }
    }
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <Shell>
        <Eyebrow tone="accent">{td.doneEyebrow}</Eyebrow>
        <Display size={34} className="block mt-1.5">
          {td.doneTitle}
        </Display>
        <p className="mt-4 max-w-[560px] text-sm leading-[1.7] text-muted">
          {td.doneBody}
        </p>
        <div className="mt-7">
          <Button
            variant="solid"
            onClick={() => {
              posthog.reset();
              signOut({ callbackUrl: "/" });
            }}
          >
            {td.doneSignOut}
          </Button>
        </div>
        <p className="mt-6 font-mono text-xs text-muted">{td.doneBye}</p>
      </Shell>
    );
  }

  if (phase === "running") {
    return (
      <Shell>
        <Eyebrow tone="accent">{td.runningEyebrow}</Eyebrow>
        <Display size={34} className="block mt-1.5">
          {td.runningTitle}
        </Display>
        <p className="mt-3 font-mono text-xs text-muted">{td.runningHelp}</p>
        <ul className="mt-6 border border-line bg-card">
          {ordered
            .filter((step) => step.key !== "handOver" || shares)
            .map((step) => (
              <StepRow
                key={step.key}
                label={step.label}
                state={steps[step.key]}
              />
            ))}
        </ul>
        {error && (
          <div className="mt-5 flex flex-col gap-3">
            <ErrorBox text={error} />
            <div>
              <Button
                variant="solid"
                onClick={() => run(failedAt ?? 0)}
                disabled={failedAt === null}
              >
                {td.retry}
              </Button>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <Button variant="quiet" onClick={() => router.push("/app/profile")}>
        {td.back}
      </Button>
      <Eyebrow tone="accent" className="mt-6">
        {td.eyebrow}
      </Eyebrow>
      <Display size={34} className="block mt-1.5">
        {td.title}
      </Display>

      <p className="mt-4 max-w-[560px] border border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4 text-sm leading-[1.7] text-ink">
        {td.warning}
      </p>

      {summary.isLoading && (
        <p className="mt-6 font-mono text-xs text-muted">{td.loading}</p>
      )}
      {summary.error && (
        <div className="mt-6">
          <ErrorBox text={summary.error.message} />
        </div>
      )}

      {data && (
        <>
          <p className="mt-6 font-mono text-xs text-muted">
            {td.account}: <span className="text-ink">{data.email}</span>
          </p>

          {properties.length > 0 && (
            <>
              <h2 className="mt-8 mb-2">
                <Eyebrow>{td.propertiesEyebrow}</Eyebrow>
              </h2>
              <div className="flex flex-col gap-3">
                {properties.map((p) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    decision={decisions[p.id]}
                    onDecide={(d) =>
                      setDecisions((prev) => ({ ...prev, [p.id]: d }))
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* The tally is the consequence of the decisions above, so it reads
              after them and moves as they change. */}
          <h2 className="mt-9 mb-2">
            <Eyebrow>{td.summaryEyebrow}</Eyebrow>
          </h2>
          <div className="grid grid-cols-3 gap-px border border-line bg-line">
            <Tally value={totals.bills} label={td.bills} />
            <Tally value={totals.files} label={td.files} />
            <Tally value={totals.properties} label={td.properties} />
          </div>
          <ul className="mt-3 flex flex-col gap-1 font-mono text-xs text-muted max-w-[560px] leading-[1.6]">
            {nothingDeleted && (
              <li className="text-ink">{td.nothingDeleted}</li>
            )}
            {undecided.length > 0 && <li>{td.pendingCounted}</li>}
            {data.inbox.bills > 0 && (
              <li>
                {td.inbox}: {data.inbox.bills}
              </li>
            )}
            {totals.reattributed > 0 && (
              <li>
                {interpolate(td.reattributed, { count: totals.reattributed })}
              </li>
            )}
          </ul>

          <h2 className="mt-9 mb-2">
            <Eyebrow>{td.parsersEyebrow}</Eyebrow>
          </h2>
          <ul className="flex flex-col gap-1.5 font-mono text-xs text-muted max-w-[560px] leading-[1.6]">
            {data.parsers.kept.length === 0 &&
              data.parsers.removed.length === 0 && <li>{td.parsersNone}</li>}
            {data.parsers.kept.length > 0 && (
              <li>
                {interpolate(td.parsersKept, {
                  list: data.parsers.kept.join(", "),
                })}
              </li>
            )}
            {data.parsers.removed.length > 0 && (
              <li>
                {interpolate(td.parsersRemoved, {
                  list: data.parsers.removed.join(", "),
                })}
              </li>
            )}
          </ul>

          <div className="mt-10 border-t border-line pt-6">
            <Checkbox
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              label={
                <span className="max-w-[520px] leading-[1.6]">
                  {td.confirmLabel}
                </span>
              }
              className="items-start"
            />
            {undecided.length > 0 && (
              <p className="mt-3 font-mono text-xs text-accent">
                {td.decisionsPending}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="solid"
                disabled={!ready}
                onClick={() => {
                  posthog.capture("account_deletion_started", {
                    properties_deleted: totals.properties,
                    bills_deleted: totals.bills,
                  });
                  run(0);
                }}
              >
                {td.confirmButton}
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/app/profile")}
              >
                {td.cancel}
              </Button>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-10 pb-24">{children}</div>
  );
}

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 font-mono text-micro uppercase tracking-label text-muted">
        {label}
      </p>
    </div>
  );
}

function StepRow({ label, state }: { label: string; state: StepState }) {
  const mark = { pending: "·", running: "…", done: "✓", error: "✕" }[
    state.status
  ];
  return (
    <li className="flex flex-wrap items-baseline gap-3 border-b border-dashed border-line px-4 py-3 last:border-b-0">
      <span
        className={cn(
          "w-4 font-mono text-xs",
          state.status === "done" && "text-accent",
          state.status === "error" && "text-accent",
          state.status === "pending" && "text-muted",
        )}
      >
        {mark}
      </span>
      <span
        className={cn(
          "font-mono text-xs",
          state.status === "pending" ? "text-muted" : "text-ink",
        )}
      >
        {label}
      </span>
      {state.detail && (
        <span className="ml-auto font-mono text-micro text-muted">
          {state.detail}
        </span>
      )}
    </li>
  );
}

/** One property and what will happen to it. Only the `choose` case is
 * interactive — the other two are the user being told, not asked. */
function PropertyCard({
  property,
  decision,
  onDecide,
}: {
  property: Property;
  decision?: Decision;
  onDecide: (d: Decision) => void;
}) {
  const { t } = useI18n();
  const td = t.deleteAccount;
  const fateText = {
    destroy: td.fateDestroy,
    choose: td.fateChoose,
    leave: td.fateLeave,
  }[property.fate];

  return (
    <div className="border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-display text-lg font-semibold tracking-tight">
          {property.nickname}
        </span>
        <span className="font-mono text-micro text-muted">
          {interpolate(td.propertyBills, {
            count: property.bills,
            files: property.files,
          })}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 font-mono text-xs leading-[1.6]",
          property.fate === "leave" ? "text-muted" : "text-accent",
        )}
      >
        {fateText}
      </p>

      {property.fate === "choose" && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-dashed border-line pt-3">
          <label className="inline-flex items-center gap-2 font-mono text-xs cursor-pointer">
            <input
              type="radio"
              name={`fate-${property.id}`}
              className="accent-accent"
              checked={decision?.action === "delete"}
              onChange={() => onDecide({ action: "delete" })}
            />
            {td.chooseDelete}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input
                type="radio"
                name={`fate-${property.id}`}
                className="accent-accent"
                checked={decision?.action === "handover"}
                onChange={() =>
                  onDecide({
                    action: "handover",
                    toUserId: property.members[0].userId,
                  })
                }
              />
              {td.chooseHandover}
            </label>
            <Select
              value={
                decision?.action === "handover"
                  ? decision.toUserId
                  : property.members[0].userId
              }
              disabled={decision?.action !== "handover"}
              onChange={(e) =>
                onDecide({ action: "handover", toUserId: e.target.value })
              }
              className="max-w-[260px]"
            >
              {property.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ? `${m.name} · ${m.email}` : m.email}
                </option>
              ))}
            </Select>
          </div>
          {decision?.action === "handover" && (
            <p className="font-mono text-micro text-muted">
              {td.chooseHandoverHelp}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
