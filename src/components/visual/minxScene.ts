import * as THREE from "three";
import type { MegaminxPuzzle } from "../../engine";
import { faceBasis, stickerPolygon2d, toFacePlane } from "./minxGeometry";

/** Extrusion depth of a sticker, along the face normal (world units). */
export const STICKER_DEPTH = 0.07;
/** Gap between the black body and the bottom of the stickers. */
export const STICKER_LIFT = 0.05;
/** Radius of the black turning plate under each face, as a fraction of R. */
export const CAP_RATIO = 0.94;
/** Thickness of the black turning plate. */
export const CAP_DEPTH = 0.06;
/** Gap between the body plane and the bottom of each cap. */
export const CAP_LIFT = 0.004;

export interface MegaminxSceneModel {
  /** Group holding the body, the 132 sticker meshes and the 12 black caps. */
  root: THREE.Group;
  /** Black dodecahedron body (used by the face picker for raycasting). */
  body: THREE.Mesh;
  /** One mesh per home position; index = engine sticker index. */
  stickerMeshes: THREE.Mesh[];
  /** One black cap per face. */
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
  /** Face index turned by each action. */
  faceOf: number[];

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

/**
 * Framework-free Three.js scene graph of the Megaminx.
 *
 * The invariants the whole view relies on:
 *  - every sticker mesh is created with its geometry *already* translated to
 *    its home position, so its rest transform is the identity; `stickerRest`
 *    records it once, and is the only thing used to restore a mesh;
 *  - a turn is animated by (temporarily) attaching the moved layer and the
 *    face cap to a pivot group and rotating it about the face normal;
 *  - `commitMove`, `cancelMove`, `reset` and `restoreTransforms` *always*
 *    reparent every mesh back to `root` and copy its rest transform back,
 *    explicitly — never relying on `Object3D.attach` to preserve world
 *    transforms. So the display can never drift, whatever the interruption.
 */
export function buildMegaminxScene(puzzle: MegaminxPuzzle): MegaminxSceneModel {
  const root = new THREE.Group();

  const basisMats: THREE.Matrix4[] = puzzle.faceData.map((face) => {
    const b = faceBasis(face);
    return new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...b.u),
      new THREE.Vector3(...b.w),
      new THREE.Vector3(...b.n),
    );
  });
  const faceCenters = puzzle.faceData.map((f) => new THREE.Vector3(...f.center));
  const faceNormals = puzzle.faceData.map((f) => new THREE.Vector3(...f.normal));

  // --- Body: a fan of triangles per face, from the engine geometry. --------
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x17191f,
    roughness: 0.55,
    metalness: 0.2,
  });
  const bodyGeo = new THREE.BufferGeometry();
  {
    const positions: number[] = [];
    const normals: number[] = [];
    for (const face of puzzle.faceData) {
      for (let i = 0; i < 5; i++) {
        const a = face.vertices[i];
        const b = face.vertices[(i + 1) % 5];
        positions.push(face.center[0], face.center[1], face.center[2], a[0], a[1], a[2], b[0], b[1], b[2]);
        normals.push(face.normal[0], face.normal[1], face.normal[2]);
        normals.push(face.normal[0], face.normal[1], face.normal[2]);
        normals.push(face.normal[0], face.normal[1], face.normal[2]);
      }
    }
    bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    bodyGeo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  root.add(body);

  // --- One extruded sticker per home position. ------------------------------
  const stickerMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 132; i++) {
    const face = puzzle.stickers[i].face;
    const pts = stickerPolygon2d(puzzle.faceData[face], i % 11);
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) shape.lineTo(pts[j][0], pts[j][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: STICKER_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.005,
      bevelSegments: 1,
      curveSegments: 3,
    });
    geo.translate(0, 0, -STICKER_DEPTH / 2);
    geo.applyMatrix4(basisMats[face]);
    const lift = faceNormals[face].clone().multiplyScalar(STICKER_LIFT + STICKER_DEPTH / 2);
    const home = faceCenters[face].clone().add(lift);
    geo.translate(home.x, home.y, home.z);

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(puzzle.colors[puzzle.solved[i]]),
        roughness: 0.32,
        metalness: 0.03,
      }),
    );
    mesh.castShadow = true;
    root.add(mesh);
    stickerMeshes.push(mesh);
  }

  // --- Black caps: one pentagonal plate per face, giving the layer volume. --
  const caps: THREE.Mesh[] = [];
  for (const face of puzzle.faceData) {
    const pts = face.vertices.map((v) =>
      toFacePlane(face, [
        face.center[0] + (v[0] - face.center[0]) * CAP_RATIO,
        face.center[1] + (v[1] - face.center[1]) * CAP_RATIO,
        face.center[2] + (v[2] - face.center[2]) * CAP_RATIO,
      ]),
    );
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) shape.lineTo(pts[j][0], pts[j][1]);
    shape.closePath();
    const faceIndex = puzzle.faceData.indexOf(face);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: CAP_DEPTH,
      bevelEnabled: false,
      curveSegments: 2,
    });
    geo.translate(0, 0, -CAP_DEPTH / 2);
    geo.applyMatrix4(basisMats[faceIndex]);
    const home = faceNormals[faceIndex]
      .clone()
      .multiplyScalar(CAP_LIFT + CAP_DEPTH / 2)
      .add(faceCenters[faceIndex]);
    geo.translate(home.x, home.y, home.z);
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.castShadow = true;
    root.add(mesh);
    caps.push(mesh);
  }

  // Capture the rest transforms once, at creation. `matrix` is the identity for
  // every mesh because the geometry already encodes the home position.
  root.updateMatrixWorld(true);
  const stickerRest = stickerMeshes.map((m) => m.matrix.clone());
  const capRest = caps.map((m) => m.matrix.clone());
  const stickerRestWorld = stickerMeshes.map((m) => m.matrixWorld.clone());

  let state: Uint8Array = puzzle.solved.slice();

  function applyColors(): void {
    for (let i = 0; i < 132; i++) {
      (stickerMeshes[i].material as THREE.MeshStandardMaterial).color.set(puzzle.colors[state[i]]);
    }
  }

  let pivot: THREE.Group | null = null;
  let currentAction = -1;

  function restoreTransforms(): void {
    for (let i = 0; i < 132; i++) {
      const mesh = stickerMeshes[i];
      root.add(mesh); // reparent explicitly, no world preservation
      mesh.matrix.copy(stickerRest[i]);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrixWorld(true);
    }
    for (let g = 0; g < caps.length; g++) {
      const mesh = caps[g];
      root.add(mesh);
      mesh.matrix.copy(capRest[g]);
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
    pivot.attach(caps[move.faceIndex]);
    currentAction = action;
  }

  function setProgress(t: number): void {
    if (!pivot || currentAction < 0) return;
    const axis = faceNormals[puzzle.moves[currentAction].faceIndex];
    const angle = puzzle.moves[currentAction].angle * t;
    pivot.quaternion.setFromAxisAngle(axis, angle);
    pivot.updateMatrixWorld(true);
  }

  function commitMove(): void {
    if (currentAction < 0) {
      restoreTransforms();
      return;
    }
    const action = currentAction;
    if (pivot) {
      const axis = faceNormals[puzzle.moves[action].faceIndex];
      pivot.quaternion.setFromAxisAngle(axis, puzzle.moves[action].angle);
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
    axes: puzzle.moves.map((m) => faceNormals[m.faceIndex].clone().normalize()),
    angles: puzzle.moves.map((m) => m.angle),
    faceOf: puzzle.moves.map((m) => m.faceIndex),
    getState: () => state.slice(),
    setState,
    applyInstant,
    displayedColors: () => stickerMeshes.map((m) => `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`),
    restoreTransforms,
    beginMove,
    setProgress,
    commitMove,
    cancelMove,
    reset,
    dispose,
  };
}
