import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentParams,
  Algorithm,
  EvaluationStats,
  LearningPoint,
  PuzzleId,
  SolveResult,
} from "../agents";
import { getSolver } from "./solver";

export type Phase = "idle" | "training" | "trained" | "building" | "built";

export interface Progress {
  level: number;
  episode: number;
  states: number;
  rate: number;
  full: boolean;
}

export interface MdpInfo {
  states: number;
  iterations: number;
  deltas: number[];
}

export interface SolverTaskState {
  phase: Phase;
  progress: Progress | null;
  points: LearningPoint[];
  mdp: MdpInfo | null;
  reason: string | null;
  error: string | null;
}

const INITIAL: SolverTaskState = {
  phase: "idle",
  progress: null,
  points: [],
  mdp: null,
  reason: null,
  error: null,
};

/**
 * Drives one puzzle/algorithm pair on the shared training worker: configuration,
 * training (or MDP graph construction), pausing, reset, solving and evaluation.
 */
export function useSolverTask(puzzle: PuzzleId) {
  const [state, setState] = useState<SolverTaskState>(INITIAL);
  const algoRef = useRef<Algorithm>("q");
  const clientRef = useRef(getSolver());

  useEffect(() => {
    const client = clientRef.current;
    const unsubscribe = client.onResponse((response) => {
      switch (response.type) {
        case "progress":
          setState((prev) => ({
            ...prev,
            progress: {
              level: response.level,
              episode: response.episode,
              states: response.states,
              rate: response.rate,
              full: response.full,
            },
            points: [
              ...prev.points,
              {
                episode: response.episode,
                level: response.level,
                rate: response.rate,
                states: response.states,
              },
            ],
          }));
          break;
        case "training-complete":
          setState((prev) => ({
            ...prev,
            phase: "trained",
            reason: response.reason,
            progress: prev.progress
              ? { ...prev.progress, episode: response.episode, states: response.states, full: response.reason === "memory" }
              : prev.progress,
          }));
          break;
        case "mdp-built":
          setState((prev) => ({
            ...prev,
            phase: "built",
            mdp: { states: response.states, iterations: response.iterations, deltas: response.deltas },
          }));
          break;
        case "error":
          setState((prev) => ({ ...prev, error: response.message }));
          break;
      }
    });
    return unsubscribe;
  }, []);

  const train = useCallback(
    async (algo: Algorithm, params: Partial<AgentParams>, maxEpisodes = 400_000) => {
      const client = clientRef.current;
      algoRef.current = algo;
      setState({ ...INITIAL, phase: algo === "mdp" ? "building" : "training", mdp: null });
      await client.request({ type: "config", id: client.nextId(), puzzle, algo, params });
      if (algo === "mdp") {
        await client.request({ type: "start", id: client.nextId(), maxEpisodes });
      } else {
        client.post({ type: "start", maxEpisodes });
      }
    },
    [puzzle],
  );

  const pause = useCallback(() => {
    clientRef.current.post({ type: "pause" });
  }, []);

  const reset = useCallback(() => {
    clientRef.current.post({ type: "reset" });
    setState(INITIAL);
  }, []);

  const solve = useCallback(async (stateBytes: Uint8Array, maxSteps = 40): Promise<SolveResult> => {
    const client = clientRef.current;
    const response = await client.request({
      type: "solve",
      id: client.nextId(),
      state: Array.from(stateBytes),
      maxSteps,
    });
    if (response.type === "solve-result") return response.result;
    return { solved: false, path: [] };
  }, []);

  const evaluate = useCallback(
    async (depth: number, trials = 80): Promise<EvaluationStats | null> => {
      const client = clientRef.current;
      const response = await client.request({ type: "evaluate", id: client.nextId(), depth, trials });
      return response.type === "eval-result" ? response.stats : null;
    },
    [],
  );

  const clearError = useCallback(() => setState((prev) => ({ ...prev, error: null })), []);

  return { state, train, pause, reset, solve, evaluate, clearError };
}