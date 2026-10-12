import type { Puzzle } from "./types";

/** Random number generator in `[0, 1)`. Defaults to `Math.random`. */
export type Rng = () => number;

export interface PuzzleDefinition {
  id: string;
  name: string;
  n: number;
  perms: readonly (readonly number[])[];
  names: readonly string[];
  solved: Uint8Array;
}

/**
 * Builds a {@link Puzzle} from a set of permutation tables.
 *
 * Every permutation is expected to be a bijection of `0..n-1`; actions are
 * paired so that `inv(a) === a ^ 1`.
 */
export function makePuzzle(def: PuzzleDefinition): Puzzle {
  const { id, name, n, perms, names, solved } = def;
  const nA = perms.length;
  const solvedKey = solved.join("");

  const apply = (state: Uint8Array, action: number): Uint8Array => {
    const perm = perms[action];
    if (!perm) throw new RangeError(`Unknown action ${action} for puzzle ${id}`);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = state[perm[i]];
    return out;
  };

  const key = (state: Uint8Array): string => state.join("");

  const isSolved = (state: Uint8Array): boolean => key(state) === solvedKey;

  const inv = (action: number): number => action ^ 1;

  const scramble = (depth: number, rng: Rng = Math.random): Uint8Array => {
    let state: Uint8Array = solved.slice();
    let last = -1;
    for (let i = 0; i < depth; i++) {
      let a: number;
      do {
        a = Math.floor(rng() * nA);
      } while (last >= 0 && a === (last ^ 1));
      state = apply(state, a);
      last = a;
    }
    return state;
  };

  return { id, name, n, nA, perms, names, solved, solvedKey, apply, key, isSolved, inv, scramble };
}
