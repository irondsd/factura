import type { ComponentPropsWithoutRef } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ListFilter,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

// CMS iconography is deliberately a small vocabulary. Keeping the package
// behind this map gives the console one optical treatment and leaves room to
// swap an icon without making every call site know which library supplies it.
// These are pictorial affordances only; lifecycle dots and diff marks remain
// typographic notation in the components that use them.
const ICONS = {
  add: Plus,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  author: UserRound,
  check: Check,
  checkAll: CheckCheck,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  close: X,
  delete: Trash2,
  edit: Pencil,
  externalLink: ExternalLink,
  factCheck: BadgeCheck,
  filter: ListFilter,
  menu: Menu,
  refresh: RefreshCw,
  restore: Undo2,
  save: Save,
  search: Search,
  settings: Settings2,
  spinner: LoaderCircle,
  upload: Upload,
  workingCopy: Pencil,
} as const satisfies Record<string, LucideIcon>;

export type CmsIconName = keyof typeof ICONS;
export type CmsIconSize = keyof typeof ICON_SIZES;

const ICON_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
} as const;

type CmsIconProps = Omit<
  ComponentPropsWithoutRef<"svg">,
  "aria-hidden" | "focusable" | "height" | "width"
> & {
  name: CmsIconName;
  size?: CmsIconSize;
};

/**
 * A CMS icon is decorative by default: every current use has a visible label
 * or an accessible label on its containing control. That keeps the icon pack
 * from adding duplicate announcements to the editor's screen-reader output.
 */
export function CmsIcon({
  name,
  size = "sm",
  className,
  ...props
}: CmsIconProps) {
  const Icon = ICONS[name];
  const pixels = ICON_SIZES[size];

  return (
    <Icon
      {...props}
      aria-hidden="true"
      focusable="false"
      width={pixels}
      height={pixels}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    />
  );
}
