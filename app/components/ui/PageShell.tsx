import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

// `title` is the page heading here, not the native tooltip attribute.
export type PageShellProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  eyebrow?: ReactNode;
  title: ReactNode;
};

/**
 * Page wrapper for routes inside the app shell. The padding matches what each
 * page sets on its own <main> today; move it into the shell later.
 */
const PageShell = forwardRef<HTMLElement, PageShellProps>(function PageShell(
  { eyebrow, title, className, children, ...props },
  ref,
) {
  return (
    <main ref={ref} className={cx("min-w-0 flex-1 p-4 text-fg sm:p-8", className)} {...props}>
      {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {children}
    </main>
  );
});

PageShell.displayName = "PageShell";

export default PageShell;
