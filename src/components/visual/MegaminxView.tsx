import { forwardRef, lazy, Suspense } from "react";
import type { MegaminxPuzzle } from "../../engine";
import type { PuzzleViewHandle } from "./types";

const Scene = lazy(() =>
  import("./MegaminxScene").then((m) => ({ default: m.MegaminxScene })),
);

interface MegaminxViewProps {
  puzzle: MegaminxPuzzle;
  /** Fired when the user turns a face by clicking it (optional). */
  onPickFace?: (action: number) => void;
}

/**
 * Lazy wrapper around the Megaminx Three.js scene, so the heavy miner geometry
 * only loads when the Megaminx is actually shown (same pattern as the cube).
 */
export const MegaminxView = forwardRef<PuzzleViewHandle, MegaminxViewProps>(
  function MegaminxView({ puzzle, onPickFace }, ref) {
    return (
      <Suspense
        fallback={
          <div
            className="minx-view minx-view--loading"
            aria-label="Chargement de la vue 3D du Megaminx…"
            role="img"
          />
        }
      >
        <Scene ref={ref} puzzle={puzzle} onPickFace={onPickFace} />
      </Suspense>
    );
  },
);