import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMegaminx } from "../../engine";
import { displayedColors as engineColors } from "./minxGeometry";
import { buildMegaminxScene } from "./minxScene";

/**
 * The Megaminx 3D scene is split in two: a framework-free Three.js model
 * (`minxScene`) that owns all transforms, and a thin React component that owns
 * the WebGL renderer. These tests exercise the model directly — no WebGL
 * context is created (the renderer is the only WebGL part, and it is not part
 * of the model), which is the "WebGL mocked" guarantee: the display logic is
 * verified without a GPU.
 *
 * Invariant under test: the 132 sticker meshes and the 12 caps NEVER move
 * permanently. Whatever the sequence (instant, animated, interrupted, reset),
 * every mesh ends back in `root` with its rest transform, and the displayed
 * colours equal the engine state.
 */

const puzzle = buildMegaminx();

type Model = ReturnType<typeof buildMegaminxScene>;

/** Deterministic PRNG so failures are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function expectAtRest(model: Model): void {
  model.root.updateMatrixWorld(true);
  const orphans: string[] = [];
  let dev = 0;
  for (let i = 0; i < model.stickerMeshes.length; i++) {
    const mesh = model.stickerMeshes[i];
    if (mesh.parent !== model.root) orphans.push(`sticker ${i}`);
    const rest = model.stickerRest[i].elements;
    const world = model.stickerRestWorld[i].elements;
    for (let k = 0; k < 16; k++) {
      dev = Math.max(dev, Math.abs(mesh.matrix.elements[k] - rest[k]));
      dev = Math.max(dev, Math.abs(mesh.matrixWorld.elements[k] - world[k]));
    }
  }
  for (let g = 0; g < model.caps.length; g++) {
    const cap = model.caps[g];
    if (cap.parent !== model.root) orphans.push(`cap ${g}`);
    const rest = model.capRest[g].elements;
    for (let k = 0; k < 16; k++) {
      dev = Math.max(dev, Math.abs(cap.matrix.elements[k] - rest[k]));
    }
  }
  expect(orphans).toEqual([]);
  expect(dev, "transform deviation from rest").toBeLessThan(1e-6);
}

function expectColors(model: Model, expected: Uint8Array): void {
  expect(model.displayedColors()).toEqual(engineColors(puzzle, expected));
}

describe("megaminx scene model", () => {
  let model: Model;

  beforeAll(() => {
    model = buildMegaminxScene(puzzle);
  });
  beforeEach(() => {
    model.reset();
  });
  afterAll(() => {
    model.dispose();
  });

  it("records the rest transform as the identity (geometry bakes the home position)", () => {
    const identity = new THREE.Matrix4();
    for (let i = 0; i < model.stickerRest.length; i++) {
      expect(model.stickerRest[i].equals(identity)).toBe(true);
    }
  });

  it("stays at rest after an instant scramble and matches the engine state", () => {
    const rng = lcg(1);
    let expected: Uint8Array = puzzle.solved.slice();
    for (let t = 0; t < 60; t++) {
      const a = Math.floor(rng() * puzzle.nA);
      model.applyInstant(a);
      expected = puzzle.apply(expected, a);
      expectColors(model, expected);
    }
    expectAtRest(model);
  });

  it("stays at rest after animated moves that run to completion", () => {
    const rng = lcg(2);
    let expected: Uint8Array = puzzle.solved.slice();
    for (let t = 0; t < 40; t++) {
      const a = Math.floor(rng() * puzzle.nA);
      model.beginMove(a);
      model.setProgress(0.5);
      model.setProgress(1);
      model.commitMove();
      expected = puzzle.apply(expected, a);
      expectColors(model, expected);
      expectAtRest(model);
    }
  });

  it("stays at rest after every single action, animated", () => {
    for (let a = 0; a < puzzle.nA; a++) {
      model.beginMove(a);
      model.setProgress(0.33);
      model.setProgress(1);
      model.commitMove();
      expectAtRest(model);
    }
    expectColors(model, puzzle.solved);
  });

  it("restores rest transforms when an animation is interrupted (cancel)", () => {
    const before = model.getState();
    for (let t = 0; t < 20; t++) {
      const a = (t * 5 + 1) % puzzle.nA;
      model.beginMove(a);
      model.setProgress(0.42);
      model.cancelMove();
      expectAtRest(model);
      expectColors(model, before);
    }
    // A normal move still works after many interrupts.
    model.beginMove(7);
    model.setProgress(0.6);
    model.setProgress(1);
    model.commitMove();
    expectColors(model, puzzle.apply(before, 7));
    expectAtRest(model);
  });

  it("restores rest transforms when reset mid-animation (queue/timeout)", () => {
    for (let t = 0; t < 20; t++) {
      const a = (t * 3 + 2) % puzzle.nA;
      model.beginMove(a);
      model.setProgress(0.3);
      model.reset();
      expectAtRest(model);
      expectColors(model, puzzle.solved);
    }
  });

  it("stays at rest when a second move begins before the first is committed", () => {
    model.beginMove(3);
    model.setProgress(0.5);
    // The component serializes moves, but the model itself must never leak a
    // displaced layer even if called this way.
    model.beginMove(9);
    model.setProgress(0.5);
    model.cancelMove();
    expectAtRest(model);
  });
});
