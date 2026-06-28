// Renders a schema.org block as JSON-LD. Used only from server components, so
// there's no client JS. The `<` escape stops a stray "</script>" inside any
// string value (e.g. the inline HTML in FAQ answers) from closing the tag early.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
