import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary";

type ButtonClassOptions = {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-accent-strong bg-accent-strong text-on-dark hover:bg-accent disabled:hover:bg-accent-strong",
  secondary: "border-line bg-card text-fg hover:border-line-strong hover:bg-raised",
};

/** Button classes, exported so a link can be styled as a button. */
export function buttonClasses({ variant = "primary", fullWidth = false, className }: ButtonClassOptions = {}) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    fullWidth && "w-full",
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

// No default `type`: like a native button, it submits inside a form unless told otherwise.
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, fullWidth, className, ...props },
  ref,
) {
  return <button ref={ref} className={buttonClasses({ variant, fullWidth, className })} {...props} />;
});

Button.displayName = "Button";

export default Button;
