import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-raised text-fg-muted",
  success: "bg-accent-wash text-accent-strong",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger-wash text-danger-soft",
  info: "bg-info-soft/10 text-info-soft",
};

export function badgeClasses(tone: BadgeTone = "neutral", className?: string) {
  return cx(
    "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium leading-tight",
    toneClasses[tone],
    className,
  );
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge({ tone, className, ...props }, ref) {
  return <span ref={ref} className={badgeClasses(tone, className)} {...props} />;
});

Badge.displayName = "Badge";

export default Badge;
