import Link from "next/link";
import { CmsIcon } from "@/cms/icons";
import { formatContentDateTimeShort } from "@/lib/content-date";
import { formatRelativeTime, initials } from "@/lib/format";
import {
  cmsUserListHref,
  nextCmsUserSort,
  type CmsUserQuery,
  type CmsUserSort,
} from "../query";
import { CMS_USER_PAGE_SIZE } from "../server/service";
import type {
  CmsUserMetrics,
  CmsUserPage,
  CmsUserSummary,
} from "../server/store";

export function UserCollectionCard({ metrics }: { metrics: CmsUserMetrics }) {
  return (
    <Link
      href="/cms/users"
      className="block border border-line bg-card px-5 py-5 text-ink no-underline transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-baseline gap-3">
        <span className="font-display text-[21px] font-semibold tracking-[-0.015em]">
          Usuarios
        </span>
        <span className="font-mono text-micro tracking-label-wide text-muted uppercase">
          {metrics.totalUsers.toLocaleString("es-AR")} cuentas
        </span>
      </span>
      <span className="mt-2 block font-mono text-[13px] leading-[1.6] text-muted">
        Consulta altas, actividad y facturas cargadas. Solo lectura.
      </span>
    </Link>
  );
}

export function UserDirectory({
  page,
  metrics,
  query,
  now,
}: {
  page: CmsUserPage;
  metrics: CmsUserMetrics;
  query: CmsUserQuery;
  now: number;
}) {
  const pageCount = Math.max(1, Math.ceil(page.matching / CMS_USER_PAGE_SIZE));

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        <Metric label="Cuentas" value={metrics.totalUsers} detail="en total" />
        <Metric
          label="Nuevas"
          value={metrics.newUsers30d}
          detail="últimos 30 días"
        />
        <Metric
          label="Activas"
          value={metrics.activeUsers30d}
          detail="últimos 30 días"
        />
        <Metric
          label="Facturas"
          value={metrics.totalBills}
          detail={
            metrics.usersWithBills.toLocaleString("es-AR") +
            (metrics.usersWithBills === 1
              ? " cuenta cargó"
              : " cuentas cargaron")
          }
        />
      </dl>

      <div className="mt-9 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <form action="/cms/users" method="get" className="w-full max-w-[430px]">
          <label
            htmlFor="user-search"
            className="mb-2 block font-mono text-micro font-medium tracking-label-wide text-muted uppercase"
          >
            Buscar por nombre o correo
          </label>
          <div className="flex">
            <input
              id="user-search"
              name="q"
              type="search"
              defaultValue={query.search ?? ""}
              maxLength={120}
              className="min-h-11 min-w-0 flex-1 border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
              placeholder="ana@ejemplo.com"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-l-0 border-line bg-card px-4 font-mono text-micro tracking-label-wide text-ink uppercase transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CmsIcon name="search" />
              Buscar
            </button>
          </div>
        </form>

        <p className="m-0 shrink-0 font-mono text-[12px] text-muted">
          {page.matching.toLocaleString("es-AR")}{" "}
          {page.matching === 1 ? "resultado" : "resultados"}
          {query.search && (
            <Link
              href="/cms/users"
              className="ml-3 text-ink underline decoration-line underline-offset-4 hover:text-accent"
            >
              Limpiar
            </Link>
          )}
        </p>
      </div>

      {page.users.length === 0 ? (
        <div className="border-b border-line py-12">
          <p className="m-0 font-display text-[20px] font-semibold text-ink">
            No encontramos usuarios
          </p>
          <p className="mt-2 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
            Prueba con otra parte del nombre o del correo.
          </p>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Directorio de usuarios"
          tabIndex={0}
          className="max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
        >
          <table className="w-full min-w-[820px] table-fixed border-collapse font-mono text-[13px]">
            <thead>
              <tr>
                <Th className="w-[34%]">Usuario</Th>
                <SortableTh sort="registro" query={query} className="w-[20%]">
                  Registro
                </SortableTh>
                <SortableTh sort="actividad" query={query} className="w-[23%]">
                  Última actividad
                </SortableTh>
                <SortableTh
                  sort="facturas"
                  query={query}
                  className="w-[13%] text-right"
                >
                  Facturas
                </SortableTh>
                <Th className="w-[10%] text-right">Hogares</Th>
              </tr>
            </thead>
            <tbody>
              {page.users.map((user) => (
                <UserRow key={user.id} user={user} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="mt-5 flex items-center justify-between gap-4 font-mono text-[12px]"
          aria-label="Páginas del directorio"
        >
          {query.page > 1 ? (
            <PageLink href={cmsUserListHref({ page: query.page - 1 }, query)}>
              <CmsIcon name="arrowLeft" /> Anterior
            </PageLink>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {query.page.toLocaleString("es-AR")} de{" "}
            {pageCount.toLocaleString("es-AR")}
          </span>
          {query.page < pageCount ? (
            <PageLink href={cmsUserListHref({ page: query.page + 1 }, query)}>
              Siguiente <CmsIcon name="arrowRight" />
            </PageLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-4 sm:px-5">
      <dt className="font-mono text-micro tracking-label-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 mb-0 font-display text-[28px] font-semibold leading-none tabular-nums text-ink">
        {value.toLocaleString("es-AR")}
      </dd>
      <dd className="mt-2 mb-0 truncate font-mono text-[11px] text-muted">
        {detail}
      </dd>
    </div>
  );
}

function UserRow({ user, now }: { user: CmsUserSummary; now: number }) {
  const label = user.name || user.email;
  return (
    <tr className="border-b border-line/70 transition-colors hover:bg-card/70">
      <td className="py-4 pr-5 align-top">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-card font-display text-[13px] font-semibold text-ink">
            {initials(label)}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-ink">
                {user.name || "Sin nombre"}
              </span>
              {user.isTeam && (
                <span className="shrink-0 border border-accent/50 px-1.5 py-0.5 text-[9px] leading-none tracking-label-wide text-accent uppercase">
                  Equipo
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <span className="mt-1 block border px-1 text-[10px] text-muted uppercase">
                {user.locale}
              </span>
              <span
                className="mt-1 block truncate text-[12px] text-muted"
                title={user.email}
              >
                {user.email}
              </span>
            </div>
          </span>
        </div>
      </td>
      <td className="py-4 pr-5 align-top whitespace-nowrap text-muted">
        <time dateTime={user.createdAt}>
          {formatContentDateTimeShort(user.createdAt)}
        </time>
      </td>
      <td className="py-4 pr-5 align-top whitespace-nowrap">
        {user.lastActiveAt ? (
          <>
            <time dateTime={user.lastActiveAt} className="text-ink">
              {formatContentDateTimeShort(user.lastActiveAt)}
            </time>
            <span className="mt-1 block text-[12px] text-muted">
              {formatRelativeTime(user.lastActiveAt, "es", now)}
            </span>
          </>
        ) : (
          <span className="text-muted">Sin registro</span>
        )}
      </td>
      <td className="py-4 pr-5 text-right align-top font-semibold tabular-nums text-ink">
        {user.billCount.toLocaleString("es-AR")}
      </td>
      <td className="py-4 text-right align-top tabular-nums text-muted">
        {user.propertyCount.toLocaleString("es-AR")}
      </td>
    </tr>
  );
}

function Th({
  children,
  className = "",
  ariaSort,
}: {
  children: React.ReactNode;
  className?: string;
  ariaSort?: "ascending" | "descending";
}) {
  return (
    <th
      aria-sort={ariaSort}
      className={
        "border-b border-line py-3 pr-5 text-left text-micro font-medium tracking-label-wide text-muted uppercase last:pr-0 " +
        className
      }
    >
      {children}
    </th>
  );
}

function SortableTh({
  sort,
  query,
  children,
  className,
}: {
  sort: CmsUserSort;
  query: CmsUserQuery;
  children: React.ReactNode;
  className?: string;
}) {
  const active = query.sort === sort;
  const next = nextCmsUserSort(query, sort);
  return (
    <Th
      className={className}
      ariaSort={
        active
          ? query.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <Link
        href={cmsUserListHref(next, query)}
        className="inline-flex min-h-6 items-center gap-1.5 text-inherit no-underline transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
        {active && (
          <CmsIcon
            name={query.direction === "desc" ? "arrowDown" : "arrowUp"}
            size="xs"
          />
        )}
      </Link>
    </Th>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 border border-line px-3 text-ink no-underline transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </Link>
  );
}
