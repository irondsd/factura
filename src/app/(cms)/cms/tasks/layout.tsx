import type { ReactNode } from "react";
import { TaskToastProvider } from "@/cms/tasks/components/TaskToast";

// Shared by the board, the archive and a task, so a toast raised on one
// survives the navigation to the next.
export default function CmsTasksLayout({ children }: { children: ReactNode }) {
  return <TaskToastProvider>{children}</TaskToastProvider>;
}
