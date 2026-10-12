import type { MegaminxPuzzle, MinxFace, Vec3 } from "../../engine";

/**
 * Pure geometry for the Megaminx 3D view.
 *
 * Everything here is framework-free (no React, no Three.js), so the sticker
 * shapes that drive the scene can be unit-tested in a plain Node environment
 * ("WebGL mocked"): the scene and the tests share these functions, which
 * guarantees that what is displayed always matches the engine state.
 *
 * Sticker shapes on each pentagonal face (circumradius R, vertices V_0..V_4):
 *  - centre sticker: inner pentagon P_0..P_4 of radius 0.38·R, aligned with V_i;
 *  - corner sticker at vertex i: quad `V_i, E(i, 0.38), P_i, E(i-1, 0.62)`;
 *  - edge sticker on edge i: quad `E(i, 0.38), E(i, 0.62), P_{i+1}, P_i`;
 *  - every polygon is shrunk toward its centroid to leave thin black gaps.
 */

/** Inner-pentagon radius as a fraction of the face circumradius R. */
export const CORNER_R = 0.38;
/** First cut point on an edge, as a fraction from its start vertex. */
export const EDGE_IN = 0.38;
/** Second cut point on an edge, as a fraction from its start vertex. */
export const EDGE_OUT = 0.62;
/** Shrink factor of every sticker toward its centroid (creates the gaps). */
export const SHRINK = 0.94;

export type Point2 = [number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => mul(a, 1 / norm(a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Right-handed basis of a pentagonal face: x = u, y = w, z = n. */
export interface FaceBasis {
  u: Vec3;
  w: Vec3;
  n: Vec3;
}

export function faceBasis(face: MinxFace): FaceBasis {
  const n = unit(face.normal);
  const u = unit(sub(face.vertices[0], face.center));
  return { u, w: cross(n, u), n };
}

/** Projects a world point onto the face plane (z axis = face normal). */
export function toFacePlane(face: MinxFace, p: Vec3): Point2 {
  const { u, w } = faceBasis(face);
  const d = sub(p, face.center);
  return [dot(d, u), dot(d, w)];
}

function centroid(points: Vec3[]): Vec3 {
  const c = points.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3);
  return mul(c, 1 / points.length);
}

function shrink(points: Vec3[]): Vec3[] {
  const m = centroid(points);
  return points.map((p) => add(m, mul(sub(p, m), SHRINK)));
}

/**
 * World-space polygon of the local sticker `k` (0..10) of `face`, without the
 * black-gap shrink. Sticker indices follow the engine convention:
 * `k = 0` centre, `k = 1 + 2i` corner at vertex `i`, `k = 2 + 2i` edge `i`.
 */
export function stickerPolygonWorld(face: MinxFace, k: number): Vec3[] {
  const { center, vertices } = face;
  const V = (i: number): Vec3 => vertices[((i % 5) + 5) % 5];
  const E = (i: number, t: number): Vec3 => add(mul(V(i), 1 - t), mul(V(i + 1), t));
  const P = (i: number): Vec3 => add(center, mul(sub(V(i), center), CORNER_R));

  let raw: Vec3[];
  if (k === 0) {
    raw = [0, 1, 2, 3, 4].map(P);
  } else {
    const i = Math.floor((k - 1) / 2);
    const isCorner = (k - 1) % 2 === 0;
    raw = isCorner
      ? [V(i), E(i, EDGE_IN), P(i), E(i - 1, EDGE_OUT)]
      : [E(i, EDGE_IN), E(i, EDGE_OUT), P(i + 1), P(i)];
  }
  return raw;
}

/**
 * Face-plane 2D polygon of the local sticker `k` of `face`, shrunk toward its
 * centroid to leave the thin black gaps between stickers.
 */
export function stickerPolygon2d(face: MinxFace, k: number): Point2[] {
  return shrink(stickerPolygonWorld(face, k)).map((p) => toFacePlane(face, p));
}

/** Centroid of the (shrunk) world polygon of the local sticker `k`. */
export function stickerCenterWorld(face: MinxFace, k: number): Vec3 {
  return centroid(shrink(stickerPolygonWorld(face, k)));
}

/** Rotates `p` by `angle` about `axis` through the origin (right-hand rule). */
export function rotAxis(p: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = unit(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kp = cross(k, p);
  const kd = dot(k, p);
  return add(add(mul(p, c), mul(kp, s)), mul(k, kd * (1 - c)));
}

/**
 * Colour displayed on every home position for a given engine state. The view
 * keeps 132 fixed sticker meshes and recolours mesh `i` with `state[i]`, so the
 * displayed array is exactly this mapping.
 */
export function displayedColors(puzzle: MegaminxPuzzle, state: Uint8Array): string[] {
  return Array.from({ length: state.length }, (_, i) => puzzle.colors[state[i]]);
}