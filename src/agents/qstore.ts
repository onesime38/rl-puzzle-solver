/**
 * Growable, cache-friendly storage for tabular Q-values.
 *
 * To honour the memory constraint of the 3×3×3 (section 6 of the brief) the
 * values live in flat `Float32Array`s rather than in millions of small objects.
 * A `Map<string, number>` maps a state key to its row index.
 */
export class QStore {
  readonly nA: number;
  readonly init: number;
  readonly maxStates: number;

  private readonly keys = new Map<string, number>();
  private qa: Float32Array;
  private qb: Float32Array;
  private rows = 0;
  private capacity: number;

  constructor(nA: number, init: number, maxStates: number) {
    this.nA = nA;
    this.init = init;
    this.maxStates = maxStates;
    this.capacity = Math.min(1024, maxStates);
    this.qa = new Float32Array(this.capacity * nA).fill(init);
    this.qb = new Float32Array(this.capacity * nA).fill(init);
  }

  /** Number of stored states. */
  get size(): number {
    return this.rows;
  }

  /** True when the memory cap has been reached. */
  get full(): boolean {
    return this.rows >= this.maxStates;
  }

  /** Row index of `key`, or `-1` when the state is unknown. */
  indexOf(key: string): number {
    const index = this.keys.get(key);
    return index === undefined ? -1 : index;
  }

  /** Row index of `key`, creating it when unknown. Returns `-1` if full. */
  ensure(key: string): number {
    const existing = this.keys.get(key);
    if (existing !== undefined) return existing;
    if (this.rows >= this.maxStates) return -1;
    if (this.rows >= this.capacity) this.grow();
    const index = this.rows++;
    this.keys.set(key, index);
    return index;
  }

  /** Underlying table: `0` = QA, `1` = QB. */
  table(which: 0 | 1): Float32Array {
    return which === 0 ? this.qa : this.qb;
  }

  private grow(): void {
    const next = Math.min(this.capacity * 2, this.maxStates);
    const qa = new Float32Array(next * this.nA).fill(this.init);
    qa.set(this.qa.subarray(0, this.rows * this.nA));
    const qb = new Float32Array(next * this.nA).fill(this.init);
    qb.set(this.qb.subarray(0, this.rows * this.nA));
    this.qa = qa;
    this.qb = qb;
    this.capacity = next;
  }
}
