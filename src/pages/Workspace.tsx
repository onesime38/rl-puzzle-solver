import { Navigate } from "react-router-dom";
import type { PuzzleId } from "../agents";
import { Workspace } from "../components/simulator/Workspace";

const VALID: PuzzleId[] = ["cube", "megaminx"];

export function WorkspacePage({ puzzle }: { puzzle: PuzzleId }) {
  if (!VALID.includes(puzzle)) return <Navigate to="/simulateur" replace />;
  return <Workspace key={puzzle} puzzleId={puzzle} />;
}