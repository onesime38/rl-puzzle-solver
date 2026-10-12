import { SolverClient } from "../agents";

let instance: SolverClient | null = null;

/**
 * Lazily creates the single shared training worker for the whole application.
 * Module-level singleton so that React StrictMode double-mounting never starts
 * two workers.
 */
export function getSolver(): SolverClient {
  if (!instance) instance = new SolverClient();
  return instance;
}