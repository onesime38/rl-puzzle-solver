import { describe, expect, it } from "vitest";
import { buildPyraminx } from "./pyraminx";
import { seededRng } from "./test-utils";

const pyra = buildPyraminx();

function compose(a: readonly number[], b: readonly number[]): number[] {
  return b.map((_, i) => a[b[i]]);
}

// Sphere sizes at distance d = 0..11 measured on the reference engine.
function sphereCounts(maxDepth: number): number[] {
  const index = new Map<string, number>();
  index.set(pyra.key(pyra.solved), 0);
  let frontier: Uint8Array[] = [pyra.solved];
  const counts = [1];
  for (let d = 1; d <= maxDepth; d++) {
    let added = 0;
    const next: Uint8Array[] = [];
    for (const state of frontier) {
      for (let a = 0; a < pyra.nA; a++) {
        const child = pyra.apply(state, a);
        const k = pyra.key(child);
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

describe("pyraminx structure", () => {
  it("has 36 stickers, 4 faces and 8 actions", () => {
    expect(pyra.n).toBe(36);
    expect(pyra.stickers).toHaveLength(36);
    expect(pyra.nA).toBe(8);
    expect(pyra.perms).toHaveLength(8);
    expect(pyra.names).toHaveLength(8);
    expect(pyra.vertices).toHaveLength(4);
    expect(pyra.faceNormals).toHaveLength(4);
  });

  it("labels the actions U, U', L, L', R, R', B, B'", () => {
    expect(pyra.names).toEqual(["U", "U'", "L", "L'", "R", "R'", "B", "B'"]);
  });

  it("orders 9 stickers per face as face*9 + k", () => {
    for (let i = 0; i < 36; i++) expect(pyra.stickers[i].face).toBe(Math.floor(i / 9));
    for (let f = 0; f < 4; f++) {
      for (let k = 0; k < 9; k++) expect(pyra.stickers[f * 9 + k].tri).toHaveLength(3);
    }
  });

  it("has a solved state where each sticker carries its face colour", () => {
    for (let i = 0; i < 36; i++) expect(pyra.solved[i]).toBe(Math.floor(i / 9));
  });

  it("produces a compact 5-character key and matching words", () => {
    expect(pyra.key(pyra.solved)).toHaveLength(5);
    expect(pyra.solvedKey).toBe(pyra.key(pyra.solved));
    const words = pyra.keyWords(pyra.solved);
    expect(words).toHaveLength(5);
    const fromWords = String.fromCharCode(words[0], words[1], words[2], words[3], words[4]);
    expect(fromWords).toBe(pyra.key(pyra.solved));
  });

  it("uses bijections for every action", () => {
    for (let a = 0; a < pyra.nA; a++) expect(new Set(pyra.perms[a]).size).toBe(36);
  });
});

describe("pyraminx layers", () => {
  it("moves 12 stickers per layer (the tip included)", () => {
    expect(pyra.moves).toHaveLength(8);
    for (let a = 0; a < pyra.nA; a++) {
      const move = pyra.moves[a];
      expect(move.layer).toHaveLength(12);
      const moved = pyra.perms[a].filter((v, i) => v !== i);
      expect(moved).toHaveLength(12);
    }
  });

  it("keeps the layer local to the sub-tetrahedron at the vertex", () => {
    for (let a = 0; a < pyra.nA; a += 2) {
      expect(pyra.moves[a].vertex).toBe(a / 2);
      expect(pyra.moves[a].angle).toBeGreaterThan(0);
      expect(pyra.moves[a + 1].angle).toBeLessThan(0);
    }
  });
});

describe("pyraminx permutation properties", () => {
  it("gives every move order 3", () => {
    for (let a = 0; a < pyra.nA; a++) {
      let perm = pyra.perms[a].slice();
      perm = compose(perm, pyra.perms[a]);
      perm = compose(perm, pyra.perms[a]);
      expect(perm).toEqual(Array.from({ length: 36 }, (_, i) => i));
    }
  });

  it("cancels every action with its inverse", () => {
    for (let a = 0; a < pyra.nA; a++) {
      const state = pyra.scramble(8, seededRng(a));
      const round = pyra.apply(pyra.apply(state, a), pyra.inv(a));
      expect(pyra.key(round)).toBe(pyra.key(state));
    }
  });

  it("returns to solved after replaying the inverse of a scramble", () => {
    const rng = seededRng(0xfeed);
    for (let trial = 0; trial < 10; trial++) {
      const depth = 3 + Math.floor(rng() * 6);
      const moves: number[] = [];
      let last = -1;
      for (let i = 0; i < depth; i++) {
        let a: number;
        do {
          a = Math.floor(rng() * pyra.nA);
        } while (last >= 0 && a === (last ^ 1));
        moves.push(a);
        last = a;
      }
      let state: Uint8Array = pyra.solved.slice();
      for (const a of moves) state = pyra.apply(state, a);
      expect(pyra.isSolved(state)).toBe(false);
      for (const a of [...moves].reverse()) state = pyra.apply(state, pyra.inv(a));
      expect(pyra.isSolved(state)).toBe(true);
    }
  });
});

describe("pyraminx sphere sizes (full BFS)", () => {
  it(
    "finds exactly 933,120 states with the reference sphere sizes",
    () => {
      const counts = sphereCounts(11);
      expect(counts).toEqual([
        1, 8, 48, 288, 1728, 9896, 51808, 220111, 480467, 166276, 2457, 32,
      ]);
      const total = counts.reduce((s, c) => s + c, 0);
      expect(total).toBe(933_120);
    },
    300_000,
  );
});
