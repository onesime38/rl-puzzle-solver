import type { QAgent } from "./qlearning";
import type { LearningPoint } from "./types";

export interface TrainOptions {
  maxEpisodes: number;
  epochSize?: number;
  testTrials?: number;
  /** Success rate required to raise the curriculum level. */
  targetRate?: number;
  /** Success rate at the maximum depth considered as converged. */
  stopRate?: number;
  /** Number of consecutive converged epochs required to stop. */
  stopEpochs?: number;
  /** Called after each epoch; enables live progress reporting. */
  onProgress?: (point: LearningPoint) => void;
  /** Returning `false` stops the loop cleanly (used to pause training). */
  shouldContinue?: () => boolean;
}

export type TrainStopReason = "converged" | "budget" | "memory" | "paused";

export interface TrainSummary {
  /** `converged` | `budget` | `memory` | `paused`. */
  reason: TrainStopReason;
  episodes: number;
  states: number;
  maxRate: number;
  points: LearningPoint[];
}

/**
 * Trains a Q-learning agent with curriculum learning until it converges at the
 * maximum depth, or until the episode budget, the memory cap or a pause
 * interrupt it.
 */
export function train(agent: QAgent, options: TrainOptions): TrainSummary {
  const epochSize = options.epochSize ?? 400;
  const testTrials = options.testTrials ?? 100;
  const targetRate = options.targetRate ?? 0.95;
  const stopRate = options.stopRate ?? 0.97;
  const stopEpochs = options.stopEpochs ?? 3;

  let good = 0;
  let maxRate = 0;
  const points: LearningPoint[] = [];

  const continueLoop = options.shouldContinue ?? (() => true);

  while (!agent.full && agent.episodes < options.maxEpisodes && continueLoop()) {
    const point = agent.epoch(epochSize, testTrials, targetRate);
    points.push(point);
    maxRate = Math.max(maxRate, point.rate);
    options.onProgress?.(point);
    // Converge only from a measurement taken at `maxDepth`: `point.level` is the
    // level at which `point.rate` was actually measured (it may be smaller than
    // `agent.level` when the level was just raised).
    good = point.level >= agent.params.maxDepth && point.rate >= stopRate ? good + 1 : 0;
    if (good >= stopEpochs) {
      return {
        reason: "converged",
        episodes: agent.episodes,
        states: agent.nStates,
        maxRate,
        points,
      };
    }
  }

  let reason: TrainStopReason;
  if (agent.full) reason = "memory";
  else if (agent.episodes >= options.maxEpisodes) reason = "budget";
  else reason = "paused";

  return { reason, episodes: agent.episodes, states: agent.nStates, maxRate, points };
}