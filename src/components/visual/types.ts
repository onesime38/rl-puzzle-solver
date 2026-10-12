export interface PuzzleViewHandle {
  /** Animates a single action; resolves once the move has settled. */
  animate(action: number): Promise<void>;
  /** Resets the visual model to the solved configuration. */
  reset(): void;
  /** Milliseconds per animation. `0` disables the animation. */
  setSpeed(msPerMove: number): void;
}