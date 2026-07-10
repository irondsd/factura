"use client";

import { Display, Eyebrow } from "@/components/charts/primitives";
import { Input } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { FilterRail } from "./FilterRail";
import { ParserCard } from "./ParserCard";
import { ParserModal } from "./ParserModal";
import { PublishDialog } from "./PublishDialog";
import { TabBar } from "./TabBar";
import { useParserLibrary } from "./useParserLibrary";

/** Parser library (marketplace): browse, adopt, vote on, and manage parsers.
 * Three tabs — Adopted / Marketplace / Your parsers — over a single
 * `parsers.library` feed. Reached from the Profile page (power-user surface). */
export default function ParsersPage() {
  const lib = useParserLibrary();
  const { tp, modal } = lib;

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      {/* header */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>{tp.eyebrow}</Eyebrow>
          <Display size={34} className="block mt-1.5">
            {tp.title}
            <span className="text-accent">.</span>
          </Display>
        </div>
        <div className="text-right">
          <Eyebrow>{tp.coverage}</Eyebrow>
          <div className="font-mono text-sm text-ink mt-1">
            {interpolate(tp.coverageAdopted, { n: lib.counts.adopted })} ·{" "}
            {interpolate(tp.coverageCats, { n: lib.adoptedCatCount })}
          </div>
        </div>
      </div>

      <TabBar
        tab={lib.tab}
        counts={lib.counts}
        labels={tp}
        onSelect={lib.setTab}
      />

      <div className="flex gap-6 mt-5 items-start">
        <FilterRail
          labels={tp}
          railItems={lib.railItems}
          cat={lib.cat}
          onCat={lib.setCat}
          showTierRail={lib.showTierRail}
          tierChips={lib.tierChips}
          tier={lib.tier}
          onTier={lib.setTier}
          sort={lib.sort}
          onSort={lib.setSort}
          onBack={lib.onBack}
        />

        <main className="flex-1 min-w-0">
          <Input
            value={lib.query}
            onChange={(e) => lib.setQuery(e.target.value)}
            placeholder={lib.searchPlaceholder}
            className="mb-4"
          />

          {lib.isLoading ? (
            <p className="font-mono text-xs text-muted">{tp.loading}</p>
          ) : lib.cards.length === 0 ? (
            <p className="text-center py-16 font-mono text-sm text-muted">
              {lib.emptyMsg}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lib.cards.map((p) => (
                <ParserCard
                  key={p.configId}
                  p={p}
                  tab={lib.tab}
                  busy={lib.busy}
                  labels={tp}
                  selected={lib.selectedVersion(p)}
                  onOpen={lib.setOpenId}
                  onVote={lib.onVote}
                  onVersionChange={lib.onVersionChange}
                  onAdopt={lib.onAdopt}
                  onRemove={lib.onRemove}
                  onPublish={lib.onPublish}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* detail modal */}
      {modal && (
        <ParserModal
          p={modal}
          labels={tp}
          selVersion={lib.selectedVersion(modal)}
          busy={lib.busy}
          onClose={() => lib.setOpenId(null)}
          onVersionChange={(v) => lib.onVersionChange(modal, v)}
          onAdopt={() => lib.onAdopt(modal)}
          onRemove={() => lib.onRemove(modal)}
          onPublish={() => lib.onPublish(modal)}
          onFork={() => lib.onFork(modal)}
          onEdit={() => lib.onEdit(modal)}
        />
      )}
      {lib.publishTarget && (
        <PublishDialog
          key={lib.publishTarget.configId}
          parserName={lib.publishTarget.name}
          busy={lib.publishPending}
          onConfirm={lib.doPublish}
          onCancel={() => lib.setPublishTarget(null)}
        />
      )}
    </div>
  );
}
