import { forwardRef, lazy, Suspense } from "react";
import type { PyraminxPuzzle } from "../../engine";
import type { PuzzleViewHandle } from "./types";

const Scene = lazy(() =>
  import("./PyraminxScene").then((m) => ({ default: m.PyraminxScene })),
);

interface PyraminxViewProps {
  puzzle: PyraminxPuzzle;
  /** Fired when the user turns a vertex by clicking near it (optional). */
  onPickFace?: (action: number) => void;
}

/**
 * Lazy wrapper around the Pyraminx Three.js scene, so the heavy tetrahedron
 * geometry only loads when the Pyraminx is actually shown (same pattern as the
 * cube).
 */
export const PyraminxView = forwardRef<PuzzleViewHandle, PyraminxViewProps>(
  function PyraminxView({ puzzle, onPickFace }, ref) {
    return (
      <Suspense
        fallback={
          <div
            className="pyra-view pyra-view--loading"
            aria-label="Chargement de la vue 3D du Pyraminx…"
            role="img"
          />
        }
      >
        <Scene ref={ref} puzzle={puzzle} onPickFace={onPickFace} />
      </Suspense>
    );
  },
);
