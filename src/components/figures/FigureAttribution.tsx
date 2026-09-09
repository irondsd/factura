import Link from "next/link";

export function FigureAttribution({
  sourceHref,
  newTab = false,
  action,
}: {
  sourceHref: string;
  newTab?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-t-0 border-line bg-card px-5 py-2.5 font-mono text-micro text-muted">
      <p className="m-0">
        Fuente:{" "}
        <Link
          href={sourceHref}
          className="text-ink underline decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          Factura
        </Link>
      </p>
      {action}
    </div>
  );
}
