"use client";

import { useToasts } from "@/providers/ToastProvider";

/** Toast helpers on top of the global toaster. `error` renders the house
 * "✕ message" style from any thrown value; `opts` builds the react-query
 * mutation callbacks for the common "toast on success, toast the error" case. */
export function useToast() {
  const { showToast } = useToasts();

  const error = (e: unknown) => {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : String(e);
    showToast(`✕ ${message}`);
  };

  const opts = (success: string) => ({
    onSuccess: () => showToast(success),
    onError: error,
  });

  return { showToast, error, opts };
}
