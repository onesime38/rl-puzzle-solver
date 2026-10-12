import { describe, expect, it } from "vitest";
import { buildPyraminx, type PyraminxPuzzle } from "../../engine";
import {
  displayedColors,
  rotAxis,
  stickerNormal,
  stickerTriangleShrunk,
  stickerTriangleWorld,
} from "./pyraGeometry";

function puzzle(): PyraminxPuzzle {
  return buildPyraminx();
}

describe("pyraminx geometry (WebGL mocked: pure geometry, no renderer)", () => {
  it("every sticker triangle lies on its face plane", () => {
    const p = puzzle();
    for (let i = 0; i < p.n; i++) {
      const f = p.stickers[i].face;
      const n = p.faceNormals[f];
      const { tri } = p.stickers[i];
      for (const pt of stickerTriangleShrunk(p, i)) {
        const s = (pt[0] - tri[0][0]) * n[0] + (pt[1] - tri[0][1]) * n[1] + (pt[2] - tri[0][2]) * n[2];
        expect(Math.abs(s)).toBeLessThan(1e-9);
      }
      for (const pt of stickerTriangleWorld(p, i)) {
        const s = (pt[0] - tri[0][0]) * n[0] + (pt[1] - tri[0][1]) * n[1] + (pt[2] - tri[0][2]) * n[2];
        expect(Math.abs(s)).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every sticker inside its triangular face", () => {
    const p = puzzle();
    for (let i = 0; i < p.n; i++) {
      const c = p.stickers[i].p;
      const n = stickerNormal(p, i);
      for (const pt of stickerTriangleWorld(p, i)) {
        const rel = [pt[0] - c[0], pt[1] - c[1], pt[2] - c[2]];
        const tangential = Math.hypot(
          rel[0] - n[0] * (rel[0] * n[0] + rel[1] * n[1] + rel[2] * n[2]),
          rel[1] - n[1] * (rel[0] * n[0] + rel[1] * n[1] + rel[2] * n[2]),
          rel[2] - n[2] * (rel[0] * n[0] + rel[1] * n[1] + rel[2] * n[2]),
        );
        expect(tangential).toBeLessThan(0.6);
      }
    }
  });

  it("rotating the layer lands each moved sticker on the cell chosen by the engine (all 8 actions)", () => {
    const p = puzzle();
    for (let a = 0; a < p.nA; a++) {
      const move = p.moves[a];
      for (const i of move.layer) {
        const src = p.stickers[i].p;
        const rotated = rotAxis(src, move.axis, move.angle);
        const dest = p.perms[a].indexOf(i);
        const dst = p.stickers[dest].p;
        const err = Math.hypot(rotated[0] - dst[0], rotated[1] - dst[1], rotated[2] - dst[2]);
        expect(err, `action ${a} sticker ${i}`).toBeLessThan(0.05);
      }
    }
  });

  it("moves exactly the layer stickers, tips included", () => {
    const p = puzzle();
    for (let a = 0; a < p.nA; a++) {
      const layer = new Set(p.moves[a].layer);
      expect(layer.size).toBe(12);
      for (let i = 0; i < p.n; i++) {
        const changed = p.perms[a][i] !== i;
        expect(changed).toBe(layer.has(i));
      }
    }
  });

  it("the view recolours each home position with the engine state (solved + scramble)", () => {
    const p = puzzle();
    let state: Uint8Array = p.solved.slice();
    const steps: Uint8Array[] = [];
    for (let t = 0; t < 40; t++) {
      state = p.apply(state, (t * 5 + 1) % p.nA);
      steps.push(state);
    }
    for (const after of steps) {
      const colours = displayedColors(p, after);
      for (let i = 0; i < p.n; i++) {
        expect(colours[i], `sticker ${i}`).toBe(p.colors[after[i]]);
      }
    }
  });
});
