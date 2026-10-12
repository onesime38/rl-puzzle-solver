import type { Puzzle } from "../engine";
import type { PyraminxPuzzle } from "../engine";
import { StateTable } from "./stateTable";

/**
 * Storage backend for tabular Q-values.
 *
 * The contract is deliberately state-based (not key-based) so the same
 * `QAgent` can use either a `Map<string, number>` (small spaces, e.g. the cube)
 * or an open-addressing hash table over the puzzle's canonical words (the
 * Pyraminx), where the Q-values live in flat `Float32Array`s and no per-state
 * object is ever allocated.
 */
export interface QTableStore {
  readonly nA: number;
  readonly init: number;
  /** Number of stored states (rows). */
  readonly size: number;
  /** True when the memory cap has been reached. */
  readonly full: boolean;
  /** Row index of `state`, creating it when unknown. Returns `-1` if full. */
  ensure(state: Uint8Array): number;
  /** Row index of `state`, or `-1` when unknown. */
  indexOf(state: Uint8Array): number;
  /** Underlying table: `0` = QA, `1` = QB. */
  table(which: 0 | 1): Float32Array;
}

function growQ(q: Float32Array, nextCapacity: number, nA: number, init: number): Float32Array {
  const out = new Float32Array(nextCapacity * nA).fill(init);
  out.set(q.subarray(0, q.length));
  return out;
}

/** Map-based store for puzzles with a small reachable space property (the cube). */
export class MapQStore implements QTableStore {
  private readonly keys = new Map<string, number>();
  private qa: Float32Array;
  private qb: Float32Array;
  private rows = 0;
  private capacity: number;

  constructor(
    private readonly puzzle: Puzzle,
    readonly nA: number,
    readonly init: number,
    private readonly maxStates: number,
  ) {
    this.capacity = Math.min(1024, maxStates);
    this.qa = new Float32Array(this.capacity * nA).fill(init);
    this.qb = new Float32Array(this.capacity * nA).fill(init);
  }

  get size(): number {
    return this.rows;
  }

  get full(): boolean {
    return this.rows >= this.maxStates;
  }

  indexOf(state: Uint8Array): number {
    const index = this.keys.get(this.puzzle.key(state));
    return index === undefined ? -1 : index;
  }

  ensure(state: Uint8Array): number {
    const key = this.puzzle.key(state);
    const existing = this.keys.get(key);
    if (existing !== undefined) return existing;
    if (this.rows >= this.maxStates) return -1;
    if (this.rows >= this.capacity) this.grow();
    const index = this.rows++;
    this.keys.set(key, index);
    return index;
  }

  table(which: 0 | 1): Float32Array {
    return which === 0 ? this.qa : this.qb;
  }

  private grow(): void {
    const next = Math.min(this.capacity * 2, this.maxStates);
    this.qa = growQ(this.qa, next, this.nA, this.init);
    this.qb = growQ(this.qb, next, this.nA, this.init);
    this.capacity = next;
  }
}

/**
 * Typed-array store for the Pyraminx: an open-addressing hash table on the
 * 5 × 16-bit state key maps a state to its row, and the Q-values live in a
 * single `Float32Array(nStates * nA)` per table.
 */
export class HashedQStore implements QTableStore {
  private readonly index: StateTable;
  private qa: Float32Array;
  private qb: Float32Array;
  private capacity: number;

  constructor(
    private readonly puzzle: PyraminxPuzzle,
    readonly nA: number,
    readonly init: number,
    private readonly maxStates: number,
  ) {
    this.index = new StateTable(5, maxStates, 4096);
    this.capacity = Math.min(4096, maxStates);
    this.qa = new Float32Array(this.capacity * nA).fill(init);
    this.qb = new Float32Array(this.capacity * nA).fill(init);
  }

  get size(): number {
    return this.index.size;
  }

  get full(): boolean {
    return this.index.full;
  }

  indexOf(state: Uint8Array): number {
    return this.index.find(this.puzzle.keyWords(state));
  }

  ensure(state: Uint8Array): number {
    const row = this.index.intern(this.puzzle.keyWords(state));
    if (row < 0) return -1;
    while (row >= this.capacity && this.capacity < this.maxStates) this.grow();
    return row;
  }

  table(which: 0 | 1): Float32Array {
    return which === 0 ? this.qa : this.qb;
  }

  private grow(): void {
    const next = Math.min(Math.max(this.capacity * 2, 4096), this.maxStates);
    this.qa = growQ(this.qa, next, this.nA, this.init);
    this.qb = growQ(this.qb, next, this.nA, this.init);
    this.capacity = next;
  }
}

/** Chooses the store backend matching the puzzle. */
export function createQStore(
  puzzle: Puzzle,
  nA: number,
  init: number,
  maxStates: number,
): QTableStore {
  if (puzzle.id === "pyraminx") {
    return new HashedQStore(puzzle as PyraminxPuzzle, nA, init, maxStates);
  }
  return new MapQStore(puzzle, nA, init, maxStates);
}
