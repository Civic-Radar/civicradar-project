import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

/** Input classes, exported for inputs that don't use TextField's label. */
export function inputClasses(className?: string) {
  return cx(
    "w-full min-h-12 rounded-md border border-line bg-card p-3 text-sm font-normal text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20",
    className,
  );
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  labelClassName?: string;
};

// The input sits inside its label, so no id is needed to connect them.
const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, labelClassName, className, ...props },
  ref,
) {
  return (
    <label className={cx("flex flex-col gap-2 text-sm font-semibold text-fg-soft", labelClassName)}>
      <span>{label}</span>
      <input ref={ref} className={inputClasses(className)} {...props} />
    </label>
  );
});

TextField.displayName = "TextField";

export default TextField;
