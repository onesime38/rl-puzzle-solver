import { makePuzzle } from "./puzzle";
import type { Puzzle } from "./types";

/** 3D coordinate in `{-1, 0, 1}`. */
export type Vec3 = [number, number, number];

/** A single visible facelet of the cube: its cubie position and outward normal. */
export interface CubeSticker {
  /** Cubie coordinates, each component in `{-1, 0, 1}`. */
  pos: Vec3;
  /** Outward face normal, a unit axis vector. */
  nrm: Vec3;
  /** Face index `0..5` in the solved state. */
  face: number;
}

/** Geometric description of one action, used by the 3D animation. */
export interface CubeMove {
  /** Rotation axis: 0 = x, 1 = y, 2 = z. */
  axis: 0 | 1 | 2;
  /** Layer coordinate along the axis: `+1` or `-1`. */
  layer: 1 | -1;
  /** Signed quarter turns, `+1` = +90° around the axis (right-hand rule). */
  angle: 1 | -1;
  /** Face letter, e.g. `"U"`. */
  face: string;
}

export interface CubePuzzle extends Puzzle {
  readonly stickers: readonly CubeSticker[];
  /** `moves[a]` describes the geometry of action `a`. */
  readonly moves: readonly CubeMove[];
  /** Face index for each of the six solved faces, in `+X,-X,+Y,-Y,+Z,-Z` order. */
  readonly faces: readonly number[];
}

/** Colours of the six faces, indexed by face number. */
export const CUBE_COLORS = [
  "#c8102e", // 0 +X right  — rouge
  "#ff7f11", // 1 -X left   — orange
  "#f5f5f5", // 2 +Y up     — blanc
  "#ffd400", // 3 -Y down   — jaune
  "#00a651", // 4 +Z front  — vert
  "#0057b8", // 5 -Z back   — bleu
] as const;

/** +90° rotation around one axis, right-hand rule. */
function rot(v: Vec3, axis: number): Vec3 {
  const [x, y, z] = v;
  if (axis === 2) return [-y, x, z];
  if (axis === 0) return [x, -z, y];
  return [z, y, -x];
}

function same(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Colour of the face whose outward normal is `nrm`. */
function colorOf(nrm: Vec3): number {
  if (nrm[0] === 1) return 0;
  if (nrm[0] === -1) return 1;
  if (nrm[1] === 1) return 2;
  if (nrm[1] === -1) return 3;
  if (nrm[2] === 1) return 4;
  return 5;
}

interface FaceDef {
  letter: string;
  axis: 0 | 1 | 2;
  layer: 1 | -1;
}

const FACE_DEFS: readonly FaceDef[] = [
  { letter: "U", axis: 1, layer: 1 },
  { letter: "D", axis: 1, layer: -1 },
  { letter: "L", axis: 0, layer: -1 },
  { letter: "R", axis: 0, layer: 1 },
  { letter: "F", axis: 2, layer: 1 },
  { letter: "B", axis: 2, layer: -1 },
];

function buildStickers(): CubeSticker[] {
  const stickers: CubeSticker[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const pos: Vec3 = [x, y, z];
        for (let axis = 0; axis < 3; axis++) {
          const c = pos[axis];
          if (c === 0) continue; // internal face, not a sticker
          const nrm: Vec3 = [0, 0, 0];
          nrm[axis] = c;
          stickers.push({ pos, nrm, face: colorOf(nrm) });
        }
      }
    }
  }
  return stickers;
}

/**
 * Builds the 3×3×3 cube puzzle: 54 stickers (6 colours), 12 quarter-turn actions
 * stored in inverse pairs `[U, U', D, D', L, L', R, R', F, F', B, B']`.
 */
export function buildCube(): CubePuzzle {
  const stickers = buildStickers();

  const find = (pos: Vec3, nrm: Vec3): number =>
    stickers.findIndex((s) => same(s.pos, pos) && same(s.nrm, nrm));

  const facePerm = (face: FaceDef, quarterTurns: number): number[] => {
    const perm = Array.from({ length: stickers.length }, (_, i) => i);
    stickers.forEach((s, i) => {
      if (s.pos[face.axis] !== face.layer) return;
      let p = s.pos;
      let n = s.nrm;
      for (let t = 0; t < quarterTurns; t++) {
        p = rot(p, face.axis);
        n = rot(n, face.axis);
      }
      perm[find(p, n)] = i;
    });
    return perm;
  };

  const perms: number[][] = [];
  const names: string[] = [];
  const moves: CubeMove[] = [];

  for (const face of FACE_DEFS) {
    // Clockwise quarter turn (+90°) then its inverse (-90°, i.e. three quarters).
    perms.push(facePerm(face, 1));
    names.push(face.letter);
    moves.push({ axis: face.axis, layer: face.layer, angle: 1, face: face.letter });

    perms.push(facePerm(face, 3));
    names.push(`${face.letter}'`);
    moves.push({ axis: face.axis, layer: face.layer, angle: -1, face: face.letter });
  }

  const solved = Uint8Array.from(stickers.map((s) => s.face));

  const base = makePuzzle({
    id: "cube",
    name: "Cube 3×3×3",
    n: stickers.length,
    perms,
    names,
    solved,
  });

  return {
    ...base,
    stickers,
    moves,
    faces: [0, 1, 2, 3, 4, 5],
  };
}
