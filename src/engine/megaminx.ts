import type { Vec3 } from "./cube";
import { makePuzzle } from "./puzzle";
import type { Puzzle } from "./types";

/**
 * Megaminx — dodecahedron puzzle with 12 pentagonal faces.
 *
 * The geometry and the move permutations are ported (unchanged) from the
 * validated reference implementation `reference/megaminx-engine-reference.js`.
 * The dodecahedron is built from golden-ratio coordinates, the 132 stickers are
 * placed on the 12 faces, and each move's permutation is derived geometrically:
 * a face turn rotates the 26 stickers of its layer by ±72° about the face
 * normal and every sticker is matched to the nearest sticker of the same type.
 *
 * Sticker index = `face * 11 + k`, with `k = 0` (face centre), then for
 * `i = 0..4`: `k = 1 + 2i` (corner sticker at vertex `i`) and `k = 2 + 2i`
 * (edge sticker between vertex `i` and `i + 1`).
 *
 * Action index: `2 * g` turns face `g` by +72°, `2 * g + 1` is its inverse.
 */

/** Twelve face colours, indexed by face number; opposite faces contrast. */
export const MEGAMINX_COLORS = [
  "#f5f5f5", // 0  blanc            (opposé 9)
  "#c8102e", // 1  rouge
  "#ffd400", // 2  jaune
  "#00a651", // 3  vert
  "#0057b8", // 4  bleu
  "#9acd32", // 5  vert clair (lime)
  "#ff5fa2", // 6  rose
  "#ff7f11", // 7  orange
  "#e8d5a3", // 8  beige
  "#4fb7e8", // 9  bleu clair       (opposé 0)
  "#cfd3d8", // 10 gris clair
  "#6a3fa0", // 11 violet
] as const;

export type MinxStickerType = "C" | "V" | "E";

/** One visible sticker: its face, its kind and its 3D position. */
export interface MinxSticker {
  face: number;
  type: MinxStickerType;
  p: Vec3;
}

/** One pentagonal face: outward normal, centre and vertices ordered in a loop. */
export interface MinxFace {
  normal: Vec3;
  center: Vec3;
  vertices: Vec3[];
  /** Index of the opposite face. */
  opposite: number;
}

/** Geometric description of one action, used by the 3D animation. */
export interface MinxMove {
  faceIndex: number;
  /** Rotation axis: the outward normal of the turned face. */
  axis: Vec3;
  /** Signed rotation angle in radians (+72° or −72°). */
  angle: number;
  /** Indices of the 26 stickers of the layer. */
  layer: number[];
}

export interface MegaminxPuzzle extends Puzzle {
  /** The 20 dodecahedron vertices. */
  readonly vertices: readonly Vec3[];
  /** The 12 faces (normal, centre, ordered vertices). */
  readonly faceData: readonly MinxFace[];
  /** The 132 stickers. */
  readonly stickers: readonly MinxSticker[];
  /** `moves[a]` describes the geometry of action `a`. */
  readonly moves: readonly MinxMove[];
  /** Twelve colours indexed by face number. */
  readonly colors: readonly string[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

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

/** Rotates point `p` by `angle` around the axis `ax` (right-hand rule), through the origin. */
function rotAxis(p: Vec3, ax: Vec3, angle: number): Vec3 {
  const k = unit(ax);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kp = cross(k, p);
  const kd = dot(k, p);
  return add(add(mul(p, c), mul(kp, s)), mul(k, kd * (1 - c)));
}

/** The 20 vertices of the dodecahedron. */
function buildVertices(): Vec3[] {
  const vertices: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z]);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      vertices.push([0, a / PHI, b * PHI]);
      vertices.push([a / PHI, b * PHI, 0]);
      vertices.push([a * PHI, 0, b / PHI]);
    }
  }
  return vertices;
}

/** The 12 face normals (icosahedron normals). */
function buildNormals(): Vec3[] {
  const normals: Vec3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      normals.push(unit([0, a * PHI, b]));
      normals.push(unit([a, 0, b * PHI]));
      normals.push(unit([a * PHI, b, 0]));
    }
  }
  return normals;
}

interface RawFace {
  normal: Vec3;
  center: Vec3;
  vertices: Vec3[];
}

/** Finds, for every normal, the five vertices of its face, ordered around it. */
function buildFaces(vertices: Vec3[], normals: Vec3[]): RawFace[] {
  return normals.map((normal) => {
    const m = Math.max(...vertices.map((v) => dot(v, normal)));
    const onFace = vertices.filter((v) => Math.abs(dot(v, normal) - m) < 1e-6);
    const center = mul(
      onFace.reduce((s, v) => add(s, v), [0, 0, 0] as Vec3),
      1 / onFace.length,
    );
    const u = unit(sub(onFace[0], center));
    const w = cross(normal, u);
    onFace.sort(
      (a, b) =>
        Math.atan2(dot(sub(a, center), w), dot(sub(a, center), u)) -
        Math.atan2(dot(sub(b, center), w), dot(sub(b, center), u)),
    );
    return { normal, center, vertices: onFace };
  });
}

/** One centre, five corner and five edge stickers per face. */
function buildStickers(faces: RawFace[]): MinxSticker[] {
  const stickerPull = 0.78; // corner sticker pull toward the face centre
  const edgePull = 0.62; // edge sticker pull toward the face centre
  const stickers: MinxSticker[] = [];
  faces.forEach((f, face) => {
    stickers.push({ face, type: "C", p: f.center });
    for (let i = 0; i < 5; i++) {
      const v = f.vertices[i];
      const w = f.vertices[(i + 1) % 5];
      stickers.push({ face, type: "V", p: add(f.center, mul(sub(v, f.center), stickerPull)) });
      stickers.push({
        face,
        type: "E",
        p: add(f.center, mul(sub(mul(add(v, w), 0.5), f.center), edgePull)),
      });
    }
  });
  return stickers;
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Builds the Megaminx puzzle: 132 stickers (11 per face), 24 actions
 * (12 faces × {+72°, −72°}) stored in inverse pairs.
 */
export function buildMegaminx(): MegaminxPuzzle {
  const vertices = buildVertices();
  const rawFaces = buildFaces(vertices, buildNormals());
  const stickers = buildStickers(rawFaces);

  const faces: MinxFace[] = rawFaces.map((f) => ({
    normal: f.normal,
    center: f.center,
    vertices: f.vertices,
    opposite: rawFaces.findIndex((g) => dot(g.normal, f.normal) < -0.99),
  }));

  const perms: number[][] = [];
  const names: string[] = [];
  const moves: MinxMove[] = [];
  const n = stickers.length;

  for (let g = 0; g < 12; g++) {
    const normal = rawFaces[g].normal;
    const byDepth = stickers
      .map((s, i) => [dot(s.p, normal), i] as [number, number])
      .sort((a, b) => b[0] - a[0]);

    // The layer is the top block of the depth-sorted list; the largest gap marks
    // the separation between the 26 stickers of the layer and the rest.
    let gapIndex = -1;
    let gap = 0;
    for (let i = 0; i < 60; i++) {
      const dd = byDepth[i][0] - byDepth[i + 1][0];
      if (dd > gap) {
        gap = dd;
        gapIndex = i;
      }
    }
    const layer = byDepth.slice(0, gapIndex + 1).map((x) => x[1]);

    for (const dir of [1, -1]) {
      const perm = identity(n);
      for (const i of layer) {
        const q = rotAxis(stickers[i].p, normal, (dir * 2 * Math.PI) / 5);
        let best = -1;
        let bestDistance = Infinity;
        stickers.forEach((s, j) => {
          if (s.type !== stickers[i].type) return;
          const dd = norm(sub(s.p, q));
          if (dd < bestDistance) {
            bestDistance = dd;
            best = j;
          }
        });
        if (bestDistance > 1e-6) throw new Error(`Megaminx: no sticker match g=${g} i=${i}`);
        perm[best] = i; // sticker i lands on sticker best
      }
      perms.push(perm);
      names.push(`F${g}${dir > 0 ? "" : "'"}`);
      moves.push({ faceIndex: g, axis: normal, angle: (dir * 2 * Math.PI) / 5, layer });
    }
  }

  const solved = Uint8Array.from(stickers.map((s) => s.face));

  // With 12 colours a `join("")` key is ambiguous: encode each colour as a letter.
  const key = (state: Uint8Array): string => {
    let out = "";
    for (let i = 0; i < state.length; i++) out += String.fromCharCode(65 + state[i]);
    return out;
  };

  const base: Puzzle = makePuzzle({
    id: "megaminx",
    name: "Megaminx",
    n,
    perms,
    names,
    solved,
  });

  const solvedKey = key(solved);

  return {
    ...base,
    solvedKey,
    key,
    isSolved: (state: Uint8Array) => key(state) === solvedKey,
    vertices,
    faceData: faces,
    stickers,
    moves,
    colors: MEGAMINX_COLORS,
  };
}
