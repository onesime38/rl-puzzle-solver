import { describe, expect, it } from "vitest";
import { buildMegaminx } from "./megaminx";
import { seededRng } from "./test-utils";

const mega = buildMegaminx();

function compose(a: readonly number[], b: readonly number[]): number[] {
  return b.map((_, i) => a[b[i]]);
}

// Sphere sizes at distance d = 0..4 measured on the reference engine.
function sphereCounts(maxDepth: number): number[] {
  const index = new Map<string, number>();
  index.set(mega.key(mega.solved), 0);
  let frontier = [mega.solved];
  const counts = [1];
  for (let d = 1; d <= maxDepth; d++) {
    let added = 0;
    const next: Uint8Array[] = [];
    for (const state of frontier) {
      for (let a = 0; a < mega.nA; a++) {
        const child = mega.apply(state, a);
        const k = mega.key(child);
        if (!index.has(k)) {
          index.set(k, index.size);
          next.push(child);
          added++;
        }
      }
    }
    counts.push(added);
    frontier = next;
    if (next.length === 0) break;
  }
  return counts;
}

describe("megaminx structure", () => {
  it("has 132 stickers, 12 faces and 24 actions", () => {
    expect(mega.n).toBe(132);
    expect(mega.stickers).toHaveLength(132);
    expect(mega.nA).toBe(24);
    expect(mega.perms).toHaveLength(24);
    expect(mega.names).toHaveLength(24);
    expect(mega.vertices).toHaveLength(20);
    expect(mega.faceData).toHaveLength(12);
  });

  it("orders stickers as face*11 + k (centre, corners, edges)", () => {
    expect(mega.stickers[0]).toMatchObject({ face: 0, type: "C" });
    for (let f = 0; f < 12; f++) {
      const base = f * 11;
      expect(mega.stickers[base].type).toBe("C");
      for (let i = 0; i < 5; i++) {
        expect(mega.stickers[base + 1 + 2 * i].type).toBe("V");
        expect(mega.stickers[base + 2 + 2 * i].type).toBe("E");
      }
    }
  });

  it("gives every face five ordered vertices and an opposite", () => {
    for (const face of mega.faceData) {
      expect(face.vertices).toHaveLength(5);
      const opp = mega.faceData[face.opposite];
      const d = face.normal[0] * opp.normal[0] + face.normal[1] * opp.normal[1] + face.normal[2] * opp.normal[2];
      expect(d).toBeLessThan(-0.99);
    }
  });

  it("has a solved state where each sticker carries its face colour", () => {
    for (let i = 0; i < 132; i++) expect(mega.solved[i]).toBe(Math.floor(i / 11));
    const expected = Array.from({ length: 12 }, (_, f) => String.fromCharCode(65 + f).repeat(11)).join("");
    expect(mega.key(mega.solved)).toBe(expected);
  });

  it("uses bijections for every action", () => {
    for (let a = 0; a < mega.nA; a++) expect(new Set(mega.perms[a]).size).toBe(132);
  });
});

describe("megaminx layers", () => {
  it("moves 26 stickers per layer, 25 actually turned (the centre stays)", () => {
    expect(mega.moves).toHaveLength(24);
    for (let a = 0; a < mega.nA; a++) {
      const move = mega.moves[a];
      expect(move.layer).toHaveLength(26);
      const moved = mega.perms[a].filter((v, i) => v !== i);
      expect(moved).toHaveLength(25);
      const faceIndex = move.faceIndex;
      expect(mega.perms[a][faceIndex * 11]).toBe(faceIndex * 11);
    }
  });

  it("keeps every layer local to the turned face plus five neighbours", () => {
    for (let a = 0; a < mega.nA; a++) {
      const faceIndex = mega.moves[a].faceIndex;
      const layerFaces = new Set(mega.moves[a].layer.map((s) => mega.stickers[s].face));
      expect(layerFaces.has(faceIndex)).toBe(true);
      // 1 face (11) + 5 neighbouring faces (3 each) = 26 stickers.
      expect(layerFaces.size).toBe(6);
    }
  });
});

describe("megaminx permutation properties", () => {
  it("cancels every action with its inverse", () => {
    for (let a = 0; a < mega.nA; a++) {
      const state = mega.scramble(8, seededRng(a));
      const round = mega.apply(mega.apply(state, a), mega.inv(a));
      expect(mega.key(round)).toBe(mega.key(state));
    }
  });

  it("gives every move order 5", () => {
    for (let a = 0; a < mega.nA; a += 2) {
      let perm = mega.perms[a].slice();
      for (let k = 0; k < 4; k++) perm = compose(perm, mega.perms[a]);
      expect(perm).toEqual(Array.from({ length: 132 }, (_, i) => i));
    }
  });

  it("has opposite faces commuting", () => {
    const opp = mega.faceData[0].opposite;
    const a = mega.perms[0];
    const b = mega.perms[2 * opp];
    expect(compose(a, b)).toEqual(compose(b, a));
  });

  it("has adjacent faces not commuting", () => {
    const adj = mega.faceData.findIndex((f, i) => i !== 0 && f.normal[0] * mega.faceData[0].normal[0] + f.normal[1] * mega.faceData[0].normal[1] + f.normal[2] * mega.faceData[0].normal[2] > 0.4);
    expect(adj).toBeGreaterThan(0);
    const a = mega.perms[0];
    const c = mega.perms[2 * adj];
    expect(compose(a, c)).not.toEqual(compose(c, a));
  });

  it("returns to solved after replaying the inverse of a scramble", () => {
    const rng = seededRng(0xfeed);
    for (let trial = 0; trial < 10; trial++) {
      const depth = 3 + Math.floor(rng() * 5);
      const moves: number[] = [];
      let last = -1;
      for (let i = 0; i < depth; i++) {
        let a: number;
        do {
          a = Math.floor(rng() * mega.nA);
        } while (last >= 0 && a === (last ^ 1));
        moves.push(a);
        last = a;
      }
      let state: Uint8Array = mega.solved.slice();
      for (const a of moves) state = mega.apply(state, a);
      expect(mega.isSolved(state)).toBe(false);
      for (const a of [...moves].reverse()) state = mega.apply(state, mega.inv(a));
      expect(mega.isSolved(state)).toBe(true);
    }
  });
});

describe("megaminx state keys", () => {
  it("builds a 132-character unambiguous key (colour -> letter)", () => {
    expect(mega.key(mega.solved)).toHaveLength(132);
    // Colours 10 and 11 must not collide with a two-digit join.
    const withTen = Uint8Array.from(Array.from({ length: 132 }, (_, i) => (Math.floor(i / 11) === 1 ? 10 : 0)));
    const withEleven = Uint8Array.from(Array.from({ length: 132 }, (_, i) => (Math.floor(i / 11) === 1 ? 11 : 0)));
    expect(withTen.join("")).not.toBe(withEleven.join("")); // join is ambiguous
    expect(mega.key(withTen)).not.toBe(mega.key(withEleven)); // letters are not
  });
});

describe("megaminx sphere sizes", () => {
  it("matches the reference counts at distance 0..3", () => {
    const counts = sphereCounts(3);
    expect(counts).toEqual([1, 24, 408, 6208]);
  });

  it(
    "matches the reference count at distance 4 (90,144 distinct states)",
    () => {
      const counts = sphereCounts(4);
      expect(counts).toEqual([1, 24, 408, 6208, 90144]);
    },
    60_000,
  );
});