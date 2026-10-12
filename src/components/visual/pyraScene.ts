import * as THREE from "three";
import type { PyraminxPuzzle, Vec3 } from "../../engine";
import { capCorners, stickerNormal, stickerTriangleWorld, unit } from "./pyraGeometry";

export interface PyraminxSceneModel {
  /** Group holding the body, the 36 sticker meshes and the 4 black caps. */
  root: THREE.Group;
  /** Black tetrahedron body (used by the face picker for raycasting). */
  body: THREE.Mesh;
  /** One mesh per home position; index = engine sticker index. */
  stickerMeshes: THREE.Mesh[];
  /** One black corner cap per vertex. */
  caps: THREE.Mesh[];
  /** Rest local matrix of every sticker, captured once at creation. */
  stickerRest: THREE.Matrix4[];
  /** Rest local matrix of every cap, captured once at creation. */
  capRest: THREE.Matrix4[];
  /** Rest world matrix of every sticker, captured once at creation. */
  stickerRestWorld: THREE.Matrix4[];
  /** Moving-layer sticker indices per action. */
  layers: number[][];
  /** World rotation axis per action. */
  axes: THREE.Vector3[];
  /** Signed rotation angle (radians) per action. */
  angles: number[];
  /** Vertex turned by each action. */
  vertexOf: number[];

  /** Current logical state (a copy is returned). */
  getState(): Uint8Array;
  /** Replaces the logical state and recolours the stickers. */
  setState(state: Uint8Array): void;
  /** Applies an action instantly (no animation) and recolours. */
  applyInstant(action: number): void;
  /** Hex colours currently displayed, one per sticker (for tests). */
  displayedColors(): string[];
  /** Restores every sticker and cap to the root group and to its rest transform. */
  restoreTransforms(): void;

  /** Starts an animated turn of `action` (progress 0). */
  beginMove(action: number): void;
  /** Sets the animation progress in [0, 1] (eased by the caller if desired). */
  setProgress(t: number): void;
  /** Finishes the turn: applies the logical state and restores every transform. */
  commitMove(): void;
  /** Aborts the turn without touching the logical state and restores transforms. */
  cancelMove(): void;
  /** Cancels any turn and returns to the solved state. */
  reset(): void;
  /** Releases all GPU resources owned by the model. */
  dispose(): void;
}

function v3(a: Vec3): THREE.Vector3 {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

/** Orders `a, b, c` so that the face normal points along `n`. */
function oriented(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3): THREE.Vector3[] {
  const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  return cross.dot(n) >= 0 ? [a, b, c] : [a, c, b];
}

function triangleGeometry(pts: THREE.Vector3[], n: THREE.Vector3): THREE.BufferGeometry {
  const [a, b, c] = oriented(pts[0], pts[1], pts[2], n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3),
  );
  geo.computeVertexNormals();
  return geo;
}

/** Four triangular faces of the tetrahedron `pts`, wound outward from its centroid. */
function tetraGeometry(pts: THREE.Vector3[], inflate = 1.02): THREE.BufferGeometry {
  const centroid = new THREE.Vector3();
  for (const p of pts) centroid.add(p);
  centroid.multiplyScalar(1 / 4);
  const out = pts.map((p) => p.clone().sub(centroid).multiplyScalar(inflate).add(centroid));
  const faces: [number, number, number][] = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 2, 3],
    [1, 2, 3],
  ];
  const coords: number[] = [];
  for (const [i, j, k] of faces) {
    const n = new THREE.Vector3()
      .subVectors(out[j], out[i])
      .cross(new THREE.Vector3().subVectors(out[k], out[i]))
      .normalize();
    const [a, b, c] = oriented(out[i], out[j], out[k], n);
    coords.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Framework-free Three.js scene graph of the Pyraminx.
 *
 * The invariants the whole view relies on:
 *  - every sticker/cap mesh is created with its geometry *already* at its home
 *    position, so its rest transform is the identity; `stickerRest` records it
 *    once, and is the only thing used to restore a mesh;
 *  - a turn is animated by (temporarily) attaching the 12 moved stickers and the
 *    vertex cap to a pivot group and rotating it about the vertex axis;
 *  - `commitMove`, `cancelMove`, `reset` and `restoreTransforms` *always*
 *    reparent every mesh back to `root` and copy its rest transform back,
 *    explicitly — never relying on `Object3D.attach` to preserve world
 *    transforms. So the display can never drift, whatever the interruption.
 */
export function buildPyraminxScene(puzzle: PyraminxPuzzle): PyraminxSceneModel {
  const root = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x17191f,
    roughness: 0.55,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });

  // --- Body: one black triangle per face, from the engine geometry. --------
  const bodyCoords: number[] = [];
  for (let f = 0; f < 4; f++) {
    const verts = puzzle.vertices.filter((_, i) => i !== f).map(v3);
    const n = v3(unit(puzzle.faceNormals[f]));
    const [a, b, c] = oriented(verts[0], verts[1], verts[2], n);
    bodyCoords.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(bodyCoords, 3));
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  root.add(body);

  // --- One flat coloured sticker per home position. ------------------------
  const stickerMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < puzzle.n; i++) {
    const pts = stickerTriangleWorld(puzzle, i).map(v3);
    const n = v3(stickerNormal(puzzle, i));
    const geo = triangleGeometry(pts, n);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(puzzle.colors[puzzle.solved[i]]),
        roughness: 0.36,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    mesh.castShadow = true;
    root.add(mesh);
    stickerMeshes.push(mesh);
  }

  // --- Black corner caps: one inflated sub-tetrahedron per vertex. ---------
  const caps: THREE.Mesh[] = [];
  for (let v = 0; v < 4; v++) {
    const geo = tetraGeometry(capCorners(puzzle, v).map(v3));
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.castShadow = true;
    root.add(mesh);
    caps.push(mesh);
  }

  // Capture the rest transforms once, at creation: geometry bakes the home
  // position, so every rest matrix is the identity.
  root.updateMatrixWorld(true);
  const stickerRest = stickerMeshes.map((m) => m.matrix.clone());
  const capRest = caps.map((m) => m.matrix.clone());
  const stickerRestWorld = stickerMeshes.map((m) => m.matrixWorld.clone());

  let state: Uint8Array = puzzle.solved.slice();

  function applyColors(): void {
    for (let i = 0; i < puzzle.n; i++) {
      (stickerMeshes[i].material as THREE.MeshStandardMaterial).color.set(puzzle.colors[state[i]]);
    }
  }

  let pivot: THREE.Group | null = null;
  let currentAction = -1;

  function restoreTransforms(): void {
    for (let i = 0; i < puzzle.n; i++) {
      const mesh = stickerMeshes[i];
      root.add(mesh); // reparent explicitly, no world preservation
      mesh.matrix.copy(stickerRest[i]);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrixWorld(true);
    }
    for (let v = 0; v < caps.length; v++) {
      const mesh = caps[v];
      root.add(mesh);
      mesh.matrix.copy(capRest[v]);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrixWorld(true);
    }
    if (pivot) {
      root.remove(pivot);
      pivot = null;
    }
    currentAction = -1;
  }

  function beginMove(action: number): void {
    restoreTransforms();
    const move = puzzle.moves[action];
    pivot = new THREE.Group();
    root.add(pivot);
    for (const i of move.layer) pivot.attach(stickerMeshes[i]);
    pivot.attach(caps[move.vertex]);
    currentAction = action;
  }

  function setProgress(t: number): void {
    if (!pivot || currentAction < 0) return;
    const move = puzzle.moves[currentAction];
    const axis = v3(unit(move.axis));
    pivot.quaternion.setFromAxisAngle(axis, move.angle * t);
    pivot.updateMatrixWorld(true);
  }

  function commitMove(): void {
    if (currentAction < 0) {
      restoreTransforms();
      return;
    }
    const action = currentAction;
    if (pivot) {
      const move = puzzle.moves[action];
      const axis = v3(unit(move.axis));
      pivot.quaternion.setFromAxisAngle(axis, move.angle);
      pivot.updateMatrixWorld(true);
    }
    state = puzzle.apply(state, action);
    restoreTransforms();
    applyColors();
  }

  function cancelMove(): void {
    restoreTransforms();
  }

  function reset(): void {
    restoreTransforms();
    state = puzzle.solved.slice();
    applyColors();
  }

  function setState(next: Uint8Array): void {
    restoreTransforms();
    state = next.slice();
    applyColors();
  }

  function applyInstant(action: number): void {
    restoreTransforms();
    state = puzzle.apply(state, action);
    applyColors();
  }

  function dispose(): void {
    if (pivot) {
      root.remove(pivot);
      pivot = null;
    }
    for (const mesh of stickerMeshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const mesh of caps) mesh.geometry.dispose();
    bodyGeo.dispose();
    bodyMat.dispose();
  }

  applyColors();

  return {
    root,
    body,
    stickerMeshes,
    caps,
    stickerRest,
    capRest,
    stickerRestWorld,
    layers: puzzle.moves.map((m) => m.layer.slice()),
    axes: puzzle.moves.map((m) => v3(unit(m.axis))),
    angles: puzzle.moves.map((m) => m.angle),
    vertexOf: puzzle.moves.map((m) => m.vertex),
    getState: () => state.slice(),
    setState,
    applyInstant,
    displayedColors: () =>
      stickerMeshes.map((m) => `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`),
    restoreTransforms,
    beginMove,
    setProgress,
    commitMove,
    cancelMove,
    reset,
    dispose,
  };
}
