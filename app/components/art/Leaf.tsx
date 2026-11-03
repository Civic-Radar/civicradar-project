// The leaf from the landing page's town square, as SVG. It is drawn around
// (0, 0), 40 wide and 64 tall, so place it with `transform`.

export const LEAF_LIGHT = '#4fa65c';
export const LEAF_DARK = '#3a8f48';
export const LEAF_VEIN = '#1f5a33';

type LeafProps = {
  transform?: string;
  light?: string;
  dark?: string;
  vein?: string;
  opacity?: number;
};

export default function Leaf({ transform, light = LEAF_LIGHT, dark = LEAF_DARK, vein = LEAF_VEIN, opacity = 1 }: LeafProps) {
  return (
    <g transform={transform} opacity={opacity}>
      <path d="M0,-32 C20,-20 19,14 0,32 C-19,14 -20,-20 0,-32Z" fill={light} />
      <path d="M0,-32 C20,-20 19,14 0,32 C3,10 3,-12 0,-32Z" fill={dark} />
      <path d="M0,-30 C3,-10 3,10 0,32" fill="none" stroke={vein} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}
