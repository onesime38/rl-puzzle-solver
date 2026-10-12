/**
 * Open-addressing hash table mapping a puzzle state's canonical words (e.g. the
 * Pyraminx 5 × 16-bit key) to a dense row index.
 *
 * Only typed arrays are used: no `Map`, no per-state object. This is what keeps
 * the Pyraminx agents (933,120 states, 8 actions) well under the memory budget.
 */
export class StateTable {
  private keys: Uint16Array;
  private rows: Int32Array;
  private mask: number;
  private count = 0;
  private readonly maxEntries: number;
  private readonly wordCount: number;

  constructor(wordCount = 5, maxEntries = Number.MAX_SAFE_INTEGER, capacityHint = 1024) {
    this.wordCount = wordCount;
    this.maxEntries = maxEntries;
    let cap = 1024;
    while (cap < capacityHint * 2) cap <<= 1;
    this.keys = new Uint16Array(cap * wordCount);
    this.rows = new Int32Array(cap).fill(-1);
    this.mask = cap - 1;
  }

  get size(): number {
    return this.count;
  }

  get full(): boolean {
    return this.count >= this.maxEntries;
  }

  private hash(words: Uint16Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.wordCount; i++) {
      h ^= words[i];
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return h & this.mask;
  }

  private matches(index: number, words: Uint16Array): boolean {
    const base = index * this.wordCount;
    for (let i = 0; i < this.wordCount; i++) {
      if (this.keys[base + i] !== words[i]) return false;
    }
    return true;
  }

  /** Row index of `words`, or `-1` when absent. */
  find(words: Uint16Array): number {
    let index = this.hash(words);
    while (true) {
      const row = this.rows[index];
      if (row === -1) return -1;
      if (this.matches(index, words)) return row;
      index = (index + 1) & this.mask;
    }
  }

  /** Row index of `words`, inserting a new row when absent. `-1` when full. */
  intern(words: Uint16Array): number {
    if ((this.count + 1) * 10 > this.mask * 6) this.grow();
    let index = this.hash(words);
    while (true) {
      const row = this.rows[index];
      if (row === -1) {
        if (this.count >= this.maxEntries) return -1;
        this.rows[index] = this.count;
        const base = index * this.wordCount;
        for (let i = 0; i < this.wordCount; i++) this.keys[base + i] = words[i];
        return this.count++;
      }
      if (this.matches(index, words)) return row;
      index = (index + 1) & this.mask;
    }
  }

  private grow(): void {
    if (this.keys.length >= this.maxEntries * this.wordCount * 2) return;
    const nextCap = (this.mask + 1) * 2;
    const keys = new Uint16Array(nextCap * this.wordCount);
    const rows = new Int32Array(nextCap).fill(-1);
    const mask = nextCap - 1;
    const oldKeys = this.keys;
    for (let old = 0; old <= this.mask; old++) {
      const row = this.rows[old];
      if (row === -1) continue;
      const base = old * this.wordCount;
      let index = this.hashAt(oldKeys, base, mask);
      while (rows[index] !== -1) index = (index + 1) & mask;
      rows[index] = row;
      const dest = index * this.wordCount;
      for (let i = 0; i < this.wordCount; i++) keys[dest + i] = oldKeys[base + i];
    }
    this.keys = keys;
    this.rows = rows;
    this.mask = mask;
  }

  private hashAt(keys: Uint16Array, base: number, mask: number): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.wordCount; i++) {
      h ^= keys[base + i];
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return h & mask;
  }
}
