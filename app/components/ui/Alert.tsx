import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export type AlertTone = "error" | "success" | "info";

const toneClasses: Record<AlertTone, string> = {
  error: "bg-danger-wash text-danger-soft",
  success: "bg-accent-wash text-accent-strong",
  // Body text stays in text-fg: info-soft is just under AA contrast for small text.
  info: "border border-info-soft/30 bg-info-soft/10 text-fg",
};

export function alertClasses(tone: AlertTone, className?: string) {
  return cx("rounded-md px-5 py-4 text-sm leading-relaxed", toneClasses[tone], className);
}

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone: AlertTone;
};

// No default role: callers pass role="alert" or role="status" as they do today.
const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert({ tone, className, ...props }, ref) {
  return <div ref={ref} className={alertClasses(tone, className)} {...props} />;
});

Alert.displayName = "Alert";

export default Alert;
