import type { CSSProperties } from 'react';
import Leaf from './Leaf';

// A faint branch with a few leaves swaying at the bottom of the green sidebar.
// It sits behind the menu, never takes clicks, and holds still with reduced motion.

const LEAVES: { transform: string; d: number }[] = [
  { transform: 'translate(104 132) rotate(60) scale(.42)', d: 0 },
  { transform: 'translate(170 90) rotate(30) scale(.38)', d: 0.8 },
  { transform: 'translate(236 70) rotate(15) scale(.32)', d: 1.6 },
  { transform: 'translate(40 186) rotate(120) scale(.36)', d: 0.4 },
  { transform: 'translate(126 150) rotate(150) scale(.3)', d: 1.2 },
];

export default function SidebarBranch() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-52 overflow-hidden">
      <svg viewBox="0 0 260 210" preserveAspectRatio="xMidYMax meet" className="h-full w-full">
        <g fill="none" className="stroke-sidebar-muted" strokeOpacity={0.45} strokeLinecap="round">
          <path d="M-10 200 C60 180 120 150 180 120 S250 70 270 60" strokeWidth={3} />
          <path d="M70 172 C80 150 90 140 104 132" strokeWidth={2} />
          <path d="M150 132 C150 112 158 98 170 90" strokeWidth={2} />
          <path d="M210 96 C222 92 232 80 236 70" strokeWidth={1.6} />
        </g>
        {LEAVES.map((leaf) => (
          <g key={leaf.transform} className="leaf-sway" style={{ '--d': `${leaf.d}s` } as CSSProperties}>
            <Leaf transform={leaf.transform} light="#d9e9af" dark="#4fa65c" vein="#213c30" opacity={0.5} />
          </g>
        ))}
      </svg>
    </div>
  );
}
