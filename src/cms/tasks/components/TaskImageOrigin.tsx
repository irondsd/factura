"use client";

import { createContext, useContext, type ReactNode } from "react";

// The media bucket's public origin, for the task editor: it draws an image only
// when its address is under this origin. Read from the server environment by
// the tasks layout and handed down, because the variable is not exposed to the
// browser. Empty when media storage is not configured — pasting then still
// reaches the server, which says why it cannot store the image.

const OriginContext = createContext("");

export function useTaskImageOrigin(): string {
  return useContext(OriginContext);
}

export function TaskImageOriginProvider({
  origin,
  children,
}: {
  origin: string;
  children: ReactNode;
}) {
  return (
    <OriginContext.Provider value={origin}>{children}</OriginContext.Provider>
  );
}
