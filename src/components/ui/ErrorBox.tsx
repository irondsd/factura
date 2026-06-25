/** A bordered accent box for a single error/validation message. */
export function ErrorBox({ text }: { text: string }) {
  return (
    <div className="border border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] py-2.5 px-3 font-mono text-xs">
      {text}
    </div>
  );
}
