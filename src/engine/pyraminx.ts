import type { Vec3 } from "./cube";
import { makePuzzle } from "./puzzle";
import type { Puzzle } from "./types";

/**
 * Pyraminx — tetrahedron puzzle, "tipless" variant.
 *
 * The geometry and the move permutations are ported (unchanged) from the
 * validated reference implementation `reference/pyraminx-engine-reference.js`.
 * The tetrahedron is built from the four vertices `(±1, ±1, ±1)`, each face is
 * split into 9 small triangles, and each move's permutation is derived
 * geometrically: turning the sub-tetrahedron of side 2 at a vertex by ±120°
 * (about the axis from the origin to that vertex) moves exactly 12 stickers,
 * the tip included. Tips are rigidly attached to their vertex piece, so the
 * state space has EXACTLY 933,120 states and the diameter is 11.
 *
 * Sticker index = `face * 9 + k`. Face `f` is the face OPPOSITE to vertex `f`;
 * on each face the 9 triangles are the 6 point-up ones (`i + j < 3`) followed by
 * the 3 point-down ones (`i + j < 2`).
 *
 * Action index: `2 * v` turns the sub-tetrahedron at vertex `v` by +120°,
 * `2 * v + 1` is its inverse.
 */

/** Four face colours, indexed by face number: red, yellow, green, blue. */
export const PYRAMINX_COLORS = [
  "#c8102e", // 0 rouge
  "#ffd400", // 1 jaune
  "#00a651", // 2 vert
  "#0057b8", // 3 bleu
] as const;

/** One visible triangular sticker: its face, its 3 vertices and its centre. */
export interface PyraSticker {
  face: number;
  /** The three 3D vertices of the triangle, in order. */
  tri: [Vec3, Vec3, Vec3];
  /** Centroid of the triangle. */
  p: Vec3;
}

/** Geometric description of one action, used by the 3D animation. */
export interface PyraMove {
  /** Vertex the turned sub-tetrahedron belongs to (0..3). */
  vertex: number;
  /** Rotation axis: from the origin to the vertex. */
  axis: Vec3;
  /** Signed rotation angle in radians (+120° or −120°). */
  angle: number;
  /** Indices of the 12 stickers of the layer (tip included). */
  layer: number[];
}

export interface PyraminxPuzzle extends Puzzle {
  /** The 4 tetrahedron vertices. */
  readonly vertices: readonly Vec3[];
  /** Outward normal of each face (face `f` is opposite to vertex `f`). */
  readonly faceNormals: readonly Vec3[];
  /** The 36 stickers. */
  readonly stickers: readonly PyraSticker[];
  /** `moves[a]` describes the geometry of action `a`. */
  readonly moves: readonly PyraMove[];
  /** Four colours indexed by face number. */
  readonly colors: readonly string[];
  /** Packs the state into its 5 × 16-bit canonical words. */
  keyWords(state: Uint8Array, out?: Uint16Array): Uint16Array;
}

const VERT: readonly Vec3[] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => mul(a, 1 / norm(a));

/** Rotates point `p` by `angle` around the axis `ax` through the origin. */
function rotAxis(p: Vec3, ax: Vec3, angle: number): Vec3 {
  const k = unit(ax);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kp = cross(k, p);
  const kd = dot(k, p);
  return add(add(mul(p, c), mul(kp, s)), mul(k, kd * (1 - c)));
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Builds the 36 stickers (9 per face) from the tetrahedron geometry. */
function buildStickers(): PyraSticker[] {
  const stickers: PyraSticker[] = [];
  for (let f = 0; f < 4; f++) {
    const [A, B, C] = VERT.filter((_, i) => i !== f);
    const P = (i: number, j: number): Vec3 =>
      add(A, add(mul(sub(B, A), i / 3), mul(sub(C, A), j / 3)));
    const tris: [Vec3, Vec3, Vec3][] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; i + j < 3; j++) tris.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
    for (let i = 0; i < 2; i++) for (let j = 0; i + j < 2; j++) tris.push([P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)]);
    for (const tri of tris) stickers.push({ face: f, tri, p: mul(add(add(tri[0], tri[1]), tri[2]), 1 / 3) });
  }
  return stickers;
}

/** Packs 2 bits per sticker into 5 × 16-bit words. */
function packKey(state: Uint8Array, out = new Uint16Array(5)): Uint16Array {
  for (let w = 0; w < 5; w++) {
    let word = 0;
    for (let k = 0; k < 8; k++) {
      const i = w * 8 + k;
      if (i < 36) word |= (state[i] & 3) << (2 * k);
    }
    out[w] = word;
  }
  return out;
}

/** Canonical 5-character key (one character per 16-bit word). */
function makeKey(state: Uint8Array): string {
  const w = packKey(state);
  return String.fromCharCode(w[0], w[1], w[2], w[3], w[4]);
}

/**
 * Builds the Pyraminx puzzle: 36 stickers (9 per face), 8 actions
 * (4 vertices × {+120°, −120°}) stored in inverse pairs, `[U, U', L, L', R, R', B, B']`.
 */
export function buildPyraminx(): PyraminxPuzzle {
  const stickers = buildStickers();
  const n = stickers.length; // 36
  const height = (4 * norm(VERT[0])) / 3; // tetrahedron height
  const cut = (2 * height) / 3;

  const perms: number[][] = [];
  const names: string[] = [];
  const moves: PyraMove[] = [];
  const faceNormals: Vec3[] = VERT.map((v) => mul(unit(v), -1));

  for (let vi = 0; vi < 4; vi++) {
    const axis = VERT[vi];
    const u = unit(axis);
    const byDepth = stickers
      .map((s, i) => [norm(axis) - dot(s.p, u), i] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const layer = byDepth.filter((d) => d[0] < cut).map((d) => d[1]);

    for (const dir of [1, -1]) {
      const perm = identity(n);
      for (const i of layer) {
        const q = rotAxis(stickers[i].p, axis, (dir * 2 * Math.PI) / 3);
        let best = -1;
        let bestDistance = Infinity;
        stickers.forEach((s, j) => {
          const d = norm(sub(s.p, q));
          if (d < bestDistance) {
            bestDistance = d;
            best = j;
          }
        });
        if (bestDistance > 1e-6) throw new Error(`Pyraminx: no sticker match v=${vi} i=${i}`);
        perm[best] = i; // sticker i lands on sticker best
      }
      perms.push(perm);
      names.push("ULRB"[vi] + (dir > 0 ? "" : "'"));
      moves.push({ vertex: vi, axis, angle: (dir * 2 * Math.PI) / 3, layer });
    }
  }

  const solved = Uint8Array.from(stickers.map((s) => s.face));
  const solvedKey = makeKey(solved);

  const base: Puzzle = makePuzzle({
    id: "pyraminx",
    name: "Pyraminx",
    n,
    perms,
    names,
    solved,
  });

  return {
    ...base,
    solvedKey,
    key: makeKey,
    isSolved: (state: Uint8Array) => makeKey(state) === solvedKey,
    vertices: VERT,
    faceNormals,
    stickers,
    moves,
    colors: PYRAMINX_COLORS,
    keyWords: packKey,
  };
}
