import { useMemo } from "react";
import { buildMegaminx, MEGAMINX_COLORS, type Vec3 } from "../engine";
import { stickerPolygonWorld } from "./visual/minxGeometry";

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Decorative SVG projection of the Megaminx's front hemisphere (the viewed face
 * plus its five neighbours), built from the engine geometry: every sticker is a
 * real polygon, so the preview is accurate, not just a logo.
 */
export function MegaminxGlyph(props: { className?: string }) {
  const data = useMemo(() => {
    const puzzle = buildMegaminx();
    const dir = unit(puzzle.faceData[0].normal);
    const c = cross([0, 1, 0], dir);
    const u = norm(c) < 1e-6 ? unit(cross([0, 0, 1], dir)) : unit(c);
    const v = unit(cross(dir, u));

    const project = (p: Vec3): Coords => [dot(p, u), dot(p, v)];

    const faces: number[] = [0];
    for (let g = 1; g < 12; g++) {
      const shared = puzzle.faceData[0].vertices.filter((a) =>
        puzzle.faceData[g].vertices.some((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6),
      );
      if (shared.length >= 2) faces.push(g);
    }

    let ext = 0;
    const draws: { face: number; k: number; pts: Coords[] }[] = [];
    for (let i = 0; i < 132; i++) {
      const face = puzzle.stickers[i].face;
      if (!faces.includes(face)) continue;
      const pts = stickerPolygonWorld(puzzle.faceData[face], i % 11).map(project);
      for (const [x, y] of pts) ext = Math.max(ext, Math.hypot(x, y));
      draws.push({ face, k: i % 11, pts });
    }
    const bodies: Coords[][] = faces.map((g) =>
      puzzle.faceData[g].vertices.map(project),
    );
    return { bodies, draws, scale: 46 / ext };
  }, []);

  return (
    <svg viewBox="-54 -54 108 108" className={props.className} aria-hidden="true">
      <g stroke="#000000" strokeWidth="1.1" strokeLinejoin="round">
        {data.bodies.map((pts, gi) => (
          <polygon
            key={gi}
            points={pts.map(([x, y]) => `${(x * data.scale).toFixed(1)},${(y * data.scale).toFixed(1)}`).join(" ")}
            fill="#17191f"
          />
        ))}
        {data.draws.map((d) => (
          <polygon
            key={`${d.face}-${d.k}`}
            points={d.pts.map(([x, y]) => `${(x * data.scale).toFixed(1)},${(y * data.scale).toFixed(1)}`).join(" ")}
            fill={MEGAMINX_COLORS[d.face]}
          />
        ))}
      </g>
    </svg>
  );
}

type Coords = [number, number];