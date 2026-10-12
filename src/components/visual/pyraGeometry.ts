import type { PyraminxPuzzle, Vec3 } from "../../engine";

/**
 * Pure geometry for the Pyraminx 3D view.
 *
 * Framework-free (no React, no Three.js) so the sticker shapes that drive the
 * scene can be unit-tested in a plain Node environment ("WebGL mocked"): the
 * scene and the tests share these functions, which guarantees that what is
 * displayed always matches the engine state.
 */

/** Shrink factor of every sticker toward its centroid (creates the black gaps). */
export const SHRINK = 0.9;
/** Gap between the black body and the bottom of the stickers (world units). */
export const LIFT = 0.02;
/** Thickness of a sticker along the face normal. */
export const DEPTH = 0.02;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
export const unit = (a: Vec3): Vec3 => mul(a, 1 / norm(a));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Outward normal of the face carrying sticker `i`. */
export function stickerNormal(puzzle: PyraminxPuzzle, i: number): Vec3 {
  return unit(puzzle.faceNormals[puzzle.stickers[i].face]);
}

/** Three vertices of sticker `i`, shrunk toward its centroid (black gaps). */
export function stickerTriangleShrunk(puzzle: PyraminxPuzzle, i: number): Vec3[] {
  const { tri, p } = puzzle.stickers[i];
  return tri.map((v) => add(p, mul(sub(v, p), SHRINK)));
}

/** Three vertices of sticker `i` at its home position, lifted above the body. */
export function stickerTriangleWorld(puzzle: PyraminxPuzzle, i: number): Vec3[] {
  const n = stickerNormal(puzzle, i);
  return stickerTriangleShrunk(puzzle, i).map((v) => add(v, mul(n, LIFT)));
}

/** Corner sub-tetrahedron (the black turning cap) of vertex `v`, inflated a touch. */
export function capCorners(puzzle: PyraminxPuzzle, v: number, inflate = 1.02): Vec3[] {
  const apex = puzzle.vertices[v];
  const others = puzzle.vertices.filter((_, i) => i !== v);
  const edges = others.map((w) => mul(sub(w, apex), 2 / 3));
  const raw: Vec3[] = [apex, ...edges.map((e) => add(apex, e))];
  const c = mul(raw.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3), 1 / raw.length);
  return raw.map((p) => add(c, mul(sub(p, c), inflate)));
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
 * keeps 36 fixed sticker meshes and recolours mesh `i` with `state[i]`, so the
 * displayed array is exactly this mapping.
 */
export function displayedColors(puzzle: PyraminxPuzzle, state: Uint8Array): string[] {
  return Array.from({ length: state.length }, (_, i) => puzzle.colors[state[i]]);
}
