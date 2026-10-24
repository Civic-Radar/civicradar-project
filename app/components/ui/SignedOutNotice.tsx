import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { buttonClasses } from "./Button";
import { cx } from "./cx";

export type SignedOutNoticeProps = HTMLAttributes<HTMLDivElement> & {
  message: ReactNode;
};

/** "You must be logged in" message with a link to the login page. */
const SignedOutNotice = forwardRef<HTMLDivElement, SignedOutNoticeProps>(function SignedOutNotice(
  { message, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cx("space-y-4", className)} {...props}>
      <p className="text-fg-muted">{message}</p>
      <Link href="/login" className={buttonClasses({ variant: "primary" })}>
        Go to login
      </Link>
    </div>
  );
});

SignedOutNotice.displayName = "SignedOutNotice";

export default SignedOutNotice;
