import styles from "./BurgerButton.module.css";

/** Mobile-only hamburger that morphs into a close (X) icon when open. */
export function BurgerButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={onToggle}
      className={`flex md:hidden ${styles.button}`}
    >
      <svg
        className={styles.icon}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect className={styles.top} x="3" y="5" width="18" height="2" rx="1" />
        <rect
          className={styles.mid}
          x="3"
          y="11"
          width="18"
          height="2"
          rx="1"
        />
        <rect
          className={styles.bot}
          x="3"
          y="17"
          width="18"
          height="2"
          rx="1"
        />
      </svg>
    </button>
  );
}
