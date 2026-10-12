/**
 * Generic puzzle contract shared by every puzzle model of the project.
 *
 * A puzzle exposes a finite set of states (colour configurations) and a finite
 * set of actions (rotations). Actions are stored in inverse pairs: for every
 * even index `a`, `a ^ 1` is its inverse. This simplifies the cube notation
 * (U, U', D, D', ...) and lets the agents avoid immediately undoing a move.
 */
export interface Puzzle {
  /** Stable identifier used in the UI and in the worker messages. */
  readonly id: string;
  /** Human readable French name. */
  readonly name: string;
  /** Number of cells (stickers) of one state. */
  readonly n: number;
  /** Number of actions. */
  readonly nA: number;
  /** `perms[a][i]` is the source cell that lands on cell `i` after action `a`. */
  readonly perms: readonly (readonly number[])[];
  /** French display names of the actions, aligned with `perms`. */
  readonly names: readonly string[];
  /** The solved configuration. */
  readonly solved: Uint8Array;
  /** Canonical key of the solved configuration. */
  readonly solvedKey: string;

  /** Applies action `a` to `state`, returning a new state (never mutates). */
  apply(state: Uint8Array, action: number): Uint8Array;
  /** Maps a state to its canonical string key. */
  key(state: Uint8Array): string;
  /** True when `state` is the solved configuration. */
  isSolved(state: Uint8Array): boolean;
  /** Index of the inverse action of `a` (equals `a ^ 1` for paired actions). */
  inv(action: number): number;
  /** Random scramble of `depth` moves, never undoing the previous move. */
  scramble(depth: number, rng?: () => number): Uint8Array;
}
