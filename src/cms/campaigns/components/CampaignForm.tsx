"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  CHROME,
  type CampaignBlock,
  type CampaignContent,
} from "../../../../emails/campaign";
import { DialogButton } from "@/cms/components/CmsDialog";
import { inputClass } from "@/cms/components/fields/controls";
import { CmsIcon } from "@/cms/icons";
import { previewCampaignAction, sendCampaignAction } from "../server/actions";
import type { CampaignPreview } from "../server/service";
import { MAX_CAMPAIGN_RECIPIENTS, type CampaignErrors } from "../validation";

const BLOCK_LABELS: Record<CampaignBlock["type"], string> = {
  text: "Párrafo",
  list: "Lista",
  button: "Botón",
  note: "Nota",
  signature: "Firma",
};
function emptyBlock(type: CampaignBlock["type"]): CampaignBlock {
  switch (type) {
    case "button":
      return { type, label: "", href: "" };
    case "list":
      return { type, items: [""] };
    case "signature":
      return { type, name: "", role: "" };
    default:
      return { type, text: "" };
  }
}

export function CampaignForm() {
  const [content, setContent] = useState<CampaignContent>({
    subject: "",
    preheader: "",
    eyebrow: "",
    title: "",
    ...CHROME.es,
    blocks: [emptyBlock("text")],
  });
  const [recipients, setRecipients] = useState("");
  const [blockType, setBlockType] = useState<CampaignBlock["type"]>("text");
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [errors, setErrors] = useState<CampaignErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"preview" | "send">("preview");
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error, errors]);

  const invalidate = () => {
    setPreview(null);
    setSent(null);
    setError(null);
    setErrors({});
  };
  const update = (next: CampaignContent) => {
    invalidate();
    setContent(next);
  };
  const updateBlock = (index: number, block: CampaignBlock) => {
    update({
      ...content,
      blocks: content.blocks.map((item, n) => (n === index ? block : item)),
    });
  };
  const moveBlock = (index: number, offset: number) => {
    const blocks = [...content.blocks];
    [blocks[index], blocks[index + offset]] = [
      blocks[index + offset],
      blocks[index],
    ];
    update({ ...content, blocks });
  };

  const submit = (action: "preview" | "send") => {
    if (busy.current || sent !== null) return;
    busy.current = true;
    setOperation(action);
    setError(null);
    setErrors({});
    requestId.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        const input = { content, recipients };
        if (action === "preview") {
          const result = await previewCampaignAction(input);
          if (result.ok) setPreview(result.data);
          else {
            setError(result.message);
            setErrors(result.errors ?? {});
          }
        } else {
          const result = await sendCampaignAction(input, requestId.current!);
          if (result.ok) {
            setSent(result.data.count);
            requestId.current = null;
          } else {
            setError(result.message);
            setErrors(result.errors ?? {});
          }
        }
      } catch {
        setError("No se pudo completar la operación. Vuelve a intentarlo.");
      } finally {
        busy.current = false;
      }
    });
  };

  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options?: {
      multiline?: boolean;
      help?: string;
      max?: number;
      required?: boolean;
    },
  ) => {
    const message = Object.entries(errors).find(
      ([path]) => path === key || path.startsWith(`${key}.`),
    )?.[1];
    const id = `campaign-${key}`;
    const props = {
      id,
      value,
      required: options?.required ?? true,
      maxLength: options?.max ?? 4000,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(event.target.value),
      className: `${inputClass} min-h-11`,
      "aria-invalid": Boolean(message),
      "aria-describedby": `${id}-help${message ? ` ${id}-error` : ""}`,
    };
    return (
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="mb-1.5 block font-mono text-micro uppercase tracking-label-wide text-muted"
        >
          {label}
        </label>
        {options?.multiline ? (
          <textarea {...props} rows={key === "recipients" ? 4 : 5} />
        ) : (
          <input {...props} type="text" />
        )}
        <p
          id={`${id}-help`}
          className="mt-1.5 mb-0 font-mono text-[12px] leading-[1.6] text-muted"
        >
          {options?.help}
        </p>
        {message && (
          <p
            id={`${id}-error`}
            className="mt-1 mb-0 font-mono text-[13px] text-accent"
          >
            {message}
          </p>
        )}
      </div>
    );
  };
  const copyField = (
    key: Exclude<keyof CampaignContent, "blocks">,
    label: string,
    help?: string,
    max?: number,
  ) =>
    field(
      key,
      label,
      content[key] ?? "",
      (value) => update({ ...content, [key]: value }),
      { help, max },
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const button = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        submit(button?.value === "send" ? "send" : "preview");
      }}
      className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="min-w-0">
        {error && (
          <div
            ref={errorSummary}
            role="alert"
            tabIndex={-1}
            className="mb-5 border border-accent bg-card p-4 font-mono text-[13px] leading-relaxed focus:outline-accent"
          >
            <p className="m-0">{error}</p>
            {Object.entries(errors).length > 0 && (
              <ul className="mb-0 pl-5">
                {Object.entries(errors).map(([path, message]) => {
                  const target = path.replace(/\.\d+$/, "");
                  return (
                    <li key={path}>
                      <a href={`#campaign-${target}`} className="text-accent">
                        {message}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <fieldset
          disabled={pending}
          className="m-0 min-w-0 border-0 p-0 disabled:opacity-70"
        >
          <Panel title="Destinatarios">
            {field(
              "recipients",
              "Correos de usuarios",
              recipients,
              (value) => {
                invalidate();
                setRecipients(value);
              },
              {
                multiline: true,
                max: 25_000,
                help: `Separa los correos con comas, punto y coma o saltos de línea. Hasta ${MAX_CAMPAIGN_RECIPIENTS} usuarios por envío; los repetidos se cuentan una sola vez.`,
              },
            )}
            <Link
              href="/cms/users"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 font-mono text-[12px] text-accent"
            >
              Consultar usuarios <CmsIcon name="externalLink" />
            </Link>
          </Panel>
          <Panel title="Mensaje">
            {copyField(
              "subject",
              "Asunto",
              "El título que aparece en la bandeja de entrada.",
              200,
            )}
            {copyField(
              "preheader",
              "Texto de vista previa",
              "La línea breve que acompaña al asunto.",
              300,
            )}
            {copyField(
              "eyebrow",
              "Etiqueta sobre el título",
              "Por ejemplo: Novedades o Primeros pasos.",
              120,
            )}
            {copyField("title", "Título del correo", undefined, 200)}
            <p className="m-0 font-mono text-[12px] leading-[1.7] text-muted">
              Usa {"{name}"} para el nombre del destinatario y {"{email}"} para
              su correo. Si no tiene nombre, usamos su correo. En párrafos,
              listas y notas: **negrita** y [texto](https://…).
            </p>
          </Panel>
          <Panel title="Contenido">
            {content.blocks.map((block, index) => {
              const prefix = `blocks.${index}`;
              return (
                <div
                  key={index}
                  id={`campaign-${prefix}`}
                  className="grid min-w-0 gap-4 border border-line bg-paper p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 mr-auto font-display text-[18px] font-semibold">
                      {index + 1}. {BLOCK_LABELS[block.type]}
                    </h3>
                    <BlockButton
                      label={`Subir bloque ${index + 1}`}
                      icon="arrowUp"
                      disabled={index === 0}
                      onClick={() => moveBlock(index, -1)}
                    />
                    <BlockButton
                      label={`Bajar bloque ${index + 1}`}
                      icon="arrowDown"
                      disabled={index === content.blocks.length - 1}
                      onClick={() => moveBlock(index, 1)}
                    />
                    <BlockButton
                      label={`Quitar bloque ${index + 1}`}
                      icon="delete"
                      onClick={() =>
                        update({
                          ...content,
                          blocks: content.blocks.filter((_, n) => n !== index),
                        })
                      }
                    />
                  </div>
                  {(block.type === "text" || block.type === "note") &&
                    field(
                      `${prefix}.text`,
                      "Texto",
                      block.text,
                      (text) => updateBlock(index, { ...block, text }),
                      { multiline: true },
                    )}
                  {block.type === "list" &&
                    field(
                      `${prefix}.items`,
                      "Elementos de la lista",
                      block.items.join("\n"),
                      (value) =>
                        updateBlock(index, {
                          ...block,
                          items: value.split("\n"),
                        }),
                      {
                        multiline: true,
                        max: 30_000,
                        help: "Un elemento por línea; hasta 30 elementos de 1.000 caracteres cada uno.",
                      },
                    )}
                  {block.type === "button" && (
                    <>
                      {field(
                        `${prefix}.label`,
                        "Texto del botón",
                        block.label,
                        (label) => updateBlock(index, { ...block, label }),
                        { max: 120 },
                      )}
                      {field(
                        `${prefix}.href`,
                        "Enlace del botón",
                        block.href,
                        (href) => updateBlock(index, { ...block, href }),
                        {
                          max: 2000,
                          help: "Enlace completo https://, http:// o mailto:, sin variables.",
                        },
                      )}
                    </>
                  )}
                  {block.type === "signature" && (
                    <>
                      {field(
                        `${prefix}.name`,
                        "Nombre de quien firma",
                        block.name,
                        (name) => updateBlock(index, { ...block, name }),
                        { max: 120 },
                      )}
                      {field(
                        `${prefix}.role`,
                        "Cargo de quien firma",
                        block.role,
                        (role) => updateBlock(index, { ...block, role }),
                        { max: 200 },
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {errors.blocks && (
              <p
                role="alert"
                id="campaign-blocks"
                className="m-0 font-mono text-[13px] text-accent"
              >
                {errors.blocks}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block font-mono text-micro uppercase tracking-label-wide text-muted">
                  Tipo de bloque
                </span>
                <select
                  value={blockType}
                  onChange={(event) =>
                    setBlockType(event.target.value as CampaignBlock["type"])
                  }
                  className={`${inputClass} min-h-11`}
                >
                  {Object.entries(BLOCK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <DialogButton
                type="button"
                tone="quiet"
                icon="add"
                disabled={content.blocks.length >= 30}
                onClick={() =>
                  update({
                    ...content,
                    blocks: [...content.blocks, emptyBlock(blockType)],
                  })
                }
              >
                Agregar bloque
              </DialogButton>
            </div>
          </Panel>
          <details className="mb-5 border border-line bg-card p-5">
            <summary className="min-h-11 cursor-pointer font-display text-[20px] font-semibold">
              Encabezado, pie y firma
            </summary>
            <div className="mt-4 grid gap-4">
              {copyField(
                "headerTag",
                "Etiqueta del encabezado",
                undefined,
                120,
              )}
              {copyField(
                "footerNote",
                "Aviso del pie",
                "Por qué el destinatario recibe este correo.",
                1000,
              )}
              {copyField(
                "footerTagline",
                "Descripción de Factura",
                undefined,
                200,
              )}
              {copyField(
                "signatureLine",
                "Frase de firma",
                "Aquí {name} y {role} son el nombre y el cargo de quien firma, no del destinatario.",
                500,
              )}
            </div>
          </details>
        </fieldset>
        {sent !== null && (
          <p
            role="status"
            className="mb-5 border border-line bg-card p-4 font-mono text-[13px] leading-relaxed"
          >
            Resend aceptó {sent} {sent === 1 ? "correo" : "correos"}. La entrega
            final depende del proveedor del destinatario. Edita el formulario
            para preparar otro envío.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <DialogButton
            type="submit"
            tone="quiet"
            name="operation"
            value="preview"
            icon="preview"
            disabled={pending || sent !== null}
          >
            {pending && operation === "preview"
              ? "Preparando…"
              : "Validar y previsualizar"}
          </DialogButton>
          <DialogButton
            type="submit"
            name="operation"
            value="send"
            icon="mail"
            tone="accent"
            disabled={pending || sent !== null}
          >
            {pending && operation === "send" ? "Enviando…" : "Enviar campaña"}
          </DialogButton>
        </div>
      </div>
      <aside
        className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        aria-label="Vista previa del correo"
      >
        <div className="border border-line bg-card p-5">
          <h2 className="m-0 font-display text-[22px] font-semibold">
            Vista previa
          </h2>
          {preview ? (
            <>
              <p
                role="status"
                className="my-4 break-words font-mono text-[12px] leading-[1.7] text-muted"
              >
                {preview.recipients.length}{" "}
                {preview.recipients.length === 1
                  ? "usuario validado"
                  : "usuarios validados"}
                . Ejemplo para {preview.recipients[0]}.
              </p>
              <p className="mb-4 break-words font-mono text-[13px] leading-relaxed">
                <strong>Asunto:</strong> {preview.subject}
              </p>
              <iframe
                title="Vista previa de la campaña"
                srcDoc={preview.html}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[720px] w-full border border-line bg-paper"
              />
            </>
          ) : (
            <p className="mt-4 mb-0 font-mono text-[13px] leading-[1.7] text-muted">
              Completa el mensaje y pulsa «Validar y previsualizar» para revisar
              la plantilla y los destinatarios antes de enviar.
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 grid min-w-0 gap-4 border border-line bg-card p-5">
      <h2 className="m-0 font-display text-[22px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BlockButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: "arrowUp" | "arrowDown" | "delete";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center border border-line text-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-35"
    >
      <CmsIcon name={icon} />
    </button>
  );
}
