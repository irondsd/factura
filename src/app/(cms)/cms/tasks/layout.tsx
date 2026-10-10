import type { ReactNode } from "react";
import { mediaPublicOrigin } from "@/content-system/media/origin";
import { TaskImageOriginProvider } from "@/cms/tasks/components/TaskImageOrigin";
import { TaskToastProvider } from "@/cms/tasks/components/TaskToast";

// Shared by the board, the archive and a task, so a toast raised on one
// survives the navigation to the next.
export default function CmsTasksLayout({ children }: { children: ReactNode }) {
  return (
    <TaskToastProvider>
      <TaskImageOriginProvider origin={mediaPublicOrigin()}>
        {children}
      </TaskImageOriginProvider>
    </TaskToastProvider>
  );
}
