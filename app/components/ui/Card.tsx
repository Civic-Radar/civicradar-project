import { forwardRef, type HTMLAttributes, type Ref } from "react";
import { cx } from "./cx";

/** Card classes, exported so other elements can share the card look. */
export function cardClasses(className?: string) {
  return cx("rounded-xl border border-line bg-card p-6", className);
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
};

const Card = forwardRef<HTMLElement, CardProps>(function Card({ as: Element = "div", className, ...props }, ref) {
  // The ref type differs per element; all three are plain HTMLElements.
  return <Element ref={ref as Ref<HTMLDivElement>} className={cardClasses(className)} {...props} />;
});

Card.displayName = "Card";

export default Card;
