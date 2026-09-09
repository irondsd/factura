import type { ReactNode } from "react";
import { EmbedFigureControls } from "./EmbedFigureControls";

export function EmbedFigure({
  sourceHref,
  section,
  componentName,
  componentProps,
  title,
  children,
}: {
  sourceHref: string;
  section: "estadisticas" | "investigaciones";
  componentName: string;
  componentProps: Record<string, unknown>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="my-8" data-embed-figure={componentName}>
      <div className="[&>.fd-card]:my-0 [&>.fd-card]:border-b-0">
        {children}
      </div>
      <EmbedFigureControls
        sourceHref={sourceHref}
        section={section}
        componentName={componentName}
        componentProps={componentProps}
        title={title}
      />
    </div>
  );
}
