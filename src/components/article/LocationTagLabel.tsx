export function LocationTagLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        aria-hidden="true"
        className="pointer-events-none select-none opacity-55"
      >
        #
      </span>
      <span>{label}</span>
    </span>
  );
}
