import type { CSSProperties } from 'react';
import Leaf from './Leaf';

// Small line drawings for empty pages, in the style of the landing page's town
// square. The lines draw themselves in once; reduced motion shows them finished.
//   tree:  a bare tree and a bench, one leaf left and one falling (nothing yet)
//   board: a lamp post and an empty notice board (nothing found)

type Line = { d: string; w: number; at: number; faint?: boolean };

const SCENES: Record<'tree' | 'board', Line[]> = {
  tree: [
    { d: 'M10 118 L250 118', w: 1.4, at: 0, faint: true },
    { d: 'M92 118 L94 70', w: 3, at: 0.15 },
    { d: 'M94 78 L74 54 L62 44', w: 2, at: 0.5 },
    { d: 'M94 70 L104 44 L110 28', w: 2, at: 0.55 },
    { d: 'M94 86 L118 66 L132 58', w: 2, at: 0.6 },
    { d: 'M74 54 L78 36', w: 1.4, at: 0.9 },
    { d: 'M104 44 L92 34', w: 1.4, at: 0.95 },
    { d: 'M118 66 L124 50', w: 1.4, at: 1 },
    { d: 'M150 100 L210 100 M150 92 L210 92 M156 100 L156 118 M204 100 L204 118 M150 84 L210 84 M156 84 L156 92 M204 84 L204 92', w: 1.6, at: 0.7 },
  ],
  board: [
    { d: 'M10 118 L250 118', w: 1.4, at: 0, faint: true },
    { d: 'M90 118 L90 40 Q90 30 100 30 L112 30', w: 2.2, at: 0.15 },
    { d: 'M106 30 L118 30 L114 42 L110 42 Z', w: 1.6, at: 0.7 },
    { d: 'M84 118 L96 118 M86 112 L94 112', w: 1.6, at: 0.3 },
    { d: 'M146 118 L146 66 M206 118 L206 66', w: 2, at: 0.4 },
    { d: 'M138 52 L214 52 L214 92 L138 92 Z', w: 1.6, at: 0.6 },
    { d: 'M150 66 L190 66 M150 76 L176 76', w: 1.6, at: 1, faint: true },
  ],
};

const delay = (seconds: number) => ({ '--d': `${seconds}s` }) as CSSProperties;

export default function EmptyArt({ scene, className = 'mx-auto h-auto w-full max-w-[260px]' }: { scene: 'tree' | 'board'; className?: string }) {
  return (
    <svg viewBox="0 0 260 130" aria-hidden="true" className={`overflow-visible text-fg ${className}`}>
      {SCENES[scene].map((line) => (
        <path
          key={line.d}
          d={line.d}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeOpacity={line.faint ? 0.25 : 0.55}
          strokeWidth={line.w}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw-in"
          style={delay(line.at)}
        />
      ))}
      {scene === 'tree' ? (
        <>
          <g className="art-fade-in" style={delay(1.2)}>
            <Leaf transform="translate(132 58) rotate(40) scale(.2)" />
          </g>
          <g className="leaf-drop">
            <Leaf transform="translate(112 30) rotate(-20) scale(.18)" />
          </g>
        </>
      ) : (
        <g className="art-fade-in" style={delay(1.2)}>
          <Leaf transform="translate(232 114) rotate(78) scale(.18)" />
        </g>
      )}
    </svg>
  );
}
