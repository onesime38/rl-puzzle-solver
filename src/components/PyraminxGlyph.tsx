import { useMemo } from "react";
import { buildPyraminx, PYRAMINX_COLORS, type Vec3 } from "../engine";
import { cross, dot, norm, stickerTriangleShrunk, unit } from "./visual/pyraGeometry";

type Coords = [number, number];

/**
 * Decorative SVG projection of the Pyraminx's three front-facing triangles,
 * built from the engine geometry: every sticker is a real polygon, so the
 * preview is accurate, not just a logo.
 */
export function PyraminxGlyph(props: { className?: string }) {
  const data = useMemo(() => {
    const puzzle = buildPyraminx();
    const dir = unit([1, 1, 1] as Vec3);
    const c = cross([0, 1, 0], dir);
    const u = norm(c) < 1e-6 ? unit(cross([0, 0, 1], dir)) : unit(c);
    const v = unit(cross(dir, u));
    const project = (p: Vec3): Coords => [dot(p, u), dot(p, v)];

    const visible = [0, 1, 2, 3].filter((f) => dot(unit(puzzle.faceNormals[f]), dir) > 0);

    let ext = 0;
    const draws: { face: number; k: number; pts: Coords[] }[] = [];
    for (let i = 0; i < puzzle.n; i++) {
      const face = puzzle.stickers[i].face;
      if (!visible.includes(face)) continue;
      const pts = stickerTriangleShrunk(puzzle, i).map(project);
      for (const [x, y] of pts) ext = Math.max(ext, Math.hypot(x, y));
      draws.push({ face, k: i % 9, pts });
    }
    const bodies: Coords[][] = visible.map((f) => {
      const verts = puzzle.vertices.filter((_, i) => i !== f);
      return verts.map(project);
    });
    return { bodies, draws, scale: 46 / Math.max(ext, 1e-6) };
  }, []);

  return (
    <svg viewBox="-54 -54 108 108" className={props.className} aria-hidden="true">
      <g stroke="#000000" strokeWidth="1.1" strokeLinejoin="round">
        {data.bodies.map((pts, gi) => (
          <polygon
            key={gi}
            points={pts
              .map(([x, y]) => `${(x * data.scale).toFixed(1)},${(y * data.scale).toFixed(1)}`)
              .join(" ")}
            fill="#17191f"
          />
        ))}
        {data.draws.map((d) => (
          <polygon
            key={`${d.face}-${d.k}`}
            points={d.pts
              .map(([x, y]) => `${(x * data.scale).toFixed(1)},${(y * data.scale).toFixed(1)}`)
              .join(" ")}
            fill={PYRAMINX_COLORS[d.face]}
          />
        ))}
      </g>
    </svg>
  );
}
