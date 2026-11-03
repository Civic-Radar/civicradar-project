import { cx } from '../ui/cx';
import Leaf from './Leaf';

/**
 * Loading message with three leaves drifting down, in place of plain
 * "Loading…" text. The label is still read out by screen readers through
 * role="status". With reduced motion the leaves hold still.
 */
export default function LeafLoader({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex flex-col items-center justify-center gap-2 py-10 text-sm text-fg-muted', className)}>
      <div className="relative h-20 w-28" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="-24 -34 48 68"
            className="leaf-fall absolute top-0 h-5 w-5"
            style={{ left: `${12 + i * 34}px`, animationDelay: `${i * 0.8}s` }}
          >
            <Leaf />
          </svg>
        ))}
      </div>
      <p>{label}</p>
    </div>
  );
}
