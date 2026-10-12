import { describe, expect, it } from "vitest";
import { buildMegaminx, type MegaminxPuzzle } from "../../engine";
import {
  displayedColors,
  rotAxis,
  stickerCenterWorld,
  stickerPolygon2d,
  stickerPolygonWorld,
} from "./minxGeometry";

function puzzle(): MegaminxPuzzle {
  return buildMegaminx();
}

/** Lists the destination of every mover (sources i whose content is relocated). */
function moveLayer(p: MegaminxPuzzle, action: number): number[] {
  return [...p.moves[action].layer];
}

describe("minx geometry (WebGL mocked: pure geometry, no renderer)", () => {
  it("every sticker polygon lies on its face plane and inside the face", () => {
    const p = puzzle();
    for (let g = 0; g < 12; g++) {
      const face = p.faceData[g];
      const { normal: n, center } = face;
      const R = Math.hypot(face.vertices[0][0] - center[0], face.vertices[0][1] - center[1], face.vertices[0][2] - center[2]);
      for (let k = 0; k < 11; k++) {
        const world = stickerPolygonWorld(face, k);
        for (const pt of world) {
          const d = Math.hypot(pt[0] - center[0], pt[1] - center[1], pt[2] - center[2]);
          expect(d).toBeLessThanOrEqual(R + 1e-9);
          const s = ((pt[0] - center[0]) * n[0] + (pt[1] - center[1]) * n[1] + (pt[2] - center[2]) * n[2]) / R;
          expect(Math.abs(s)).toBeLessThan(1e-9);
        }
        const xy = stickerPolygon2d(face, k);
        expect(xy.length).toBeGreaterThan(3);
      }
    }
  });

  it("rotating the layer lands each moved sticker on the cell chosen by the engine (all 24 actions)", () => {
    const p = puzzle();
    for (let a = 0; a < 24; a++) {
      const move = p.moves[a];
      for (const i of moveLayer(p, a)) {
        const srcFace = p.faceData[p.stickers[i].face];
        const srcCenter = stickerCenterWorld(srcFace, i % 11);
        const rotated = rotAxis(srcCenter, move.axis, move.angle);
        const dest = p.perms[a].indexOf(i);
        const dstFace = p.faceData[p.stickers[dest].face];
        const dstCenter = stickerCenterWorld(dstFace, dest % 11);
        const err = Math.hypot(
          rotated[0] - dstCenter[0],
          rotated[1] - dstCenter[1],
          rotated[2] - dstCenter[2]
        );
        expect(err, `action ${a}`).toBeLessThan(0.01);
      }
    }
  });

  it("exactly the layer stickers move (only the face centre stays put)", () => {
    const p = puzzle();
    for (let a = 0; a < 24; a++) {
      const move = p.moves[a];
      const centre = move.faceIndex * 11;
      const layer = new Set(moveLayer(p, a));
      for (let i = 0; i < 132; i++) {
        const changed = p.perms[a][i] !== i;
        if (i === centre) {
          expect(changed).toBe(false);
          expect(layer.has(i)).toBe(true);
        } else {
          expect(changed).toBe(layer.has(i));
        }
      }
    }
  });

  it("the view recolours each home position with the engine state (solved + scramble)", () => {
    const p = puzzle();
    let state: Uint8Array = p.solved.slice();
    const steps: Array<{ action: number; stateAfter: Uint8Array }> = [];
    for (let t = 0; t < 40; t++) {
      const action = (t * 7 + 3) % 24;
      state = p.apply(state, action);
      steps.push({ action, stateAfter: state });
    }
    for (let t = 0; t < 40; t++) {
      const after = steps[t].stateAfter;
      const colours = displayedColors(p, after);
      for (let i = 0; i < 132; i++) {
        expect(colours[i], `step ${t} sticker ${i}`).toBe(p.colors[after[i]]);
      }
    }
  });
});