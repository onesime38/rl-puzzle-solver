import { buildCube, buildMegaminx, type Puzzle } from "../engine";
import { runBenchmark } from "./benchmark";
import { MDPAgent } from "./mdp";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { QAgent } from "./qlearning";
import { train } from "./train";
import type { AgentParams, Algorithm, PuzzleId } from "./types";

interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

declare const self: WorkerScope;

const PUZZLES: Record<PuzzleId, Puzzle> = { cube: buildCube(), megaminx: buildMegaminx() };

/** Trained agents, keyed by `${puzzle}:${algo}`. */
const agents = new Map<string, QAgent | MDPAgent>();
const agentParams = new Map<string, Partial<AgentParams>>();

let currentAlgo: Algorithm = "q";
let currentPuzzle: PuzzleId = "cube";
let currentAgent: QAgent | MDPAgent | null = null;
let training = false;

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function keyFor(puzzle: PuzzleId, algo: Algorithm): string {
  return `${puzzle}:${algo}`;
}

function makeAgent(puzzle: PuzzleId, algo: Algorithm, params: Partial<AgentParams>): QAgent | MDPAgent {
  const P = PUZZLES[puzzle];
  const entry = keyFor(puzzle, algo);
  const previous = agents.get(entry);
  if (previous && paramsEqual(agentParams.get(entry), params)) return previous;

  if (algo === "mdp") {
    const agent = new MDPAgent(P, {
      gamma: params.gamma,
      slip: params.slip,
      maxDepth: params.maxDepth,
      seed: params.seed,
    });
    agents.set(entry, agent);
    agentParams.set(entry, params);
    return agent;
  }

  const agent = new QAgent(P, algo, params);
  agents.set(entry, agent);
  agentParams.set(entry, params);
  return agent;
}

function paramsEqual(a: Partial<AgentParams> | undefined, b: Partial<AgentParams>): boolean {
  if (!a) return false;
  return (
    a.alpha === b.alpha &&
    a.gamma === b.gamma &&
    a.eps === b.eps &&
    a.epsFinal === b.epsFinal &&
    a.slip === b.slip &&
    a.maxDepth === b.maxDepth &&
    a.stepMul === b.stepMul &&
    a.stepAdd === b.stepAdd &&
    a.seed === b.seed
  );
}

function stopTraining(): void {
  training = false;
}

async function trainLoop(maxEpisodes: number, algo: Algorithm): Promise<void> {
  const agent = currentAgent as QAgent;
  const summary = train(agent, {
    maxEpisodes,
    shouldContinue: () => training,
    onProgress: (point) => {
      post({
        type: "progress",
        algo,
        level: point.level,
        episode: point.episode,
        states: point.states,
        rate: point.rate,
        full: agent.full,
      });
    },
  });
  if (training) training = false;
  post({
    type: "training-complete",
    reason: summary.reason,
    episode: summary.episodes,
    states: summary.states,
    maxRate: summary.maxRate,
  });
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "config": {
        const { puzzle, algo, params } = msg;
        stopTraining();
        currentPuzzle = puzzle;
        currentAlgo = algo;
        currentAgent = makeAgent(puzzle, algo, params);
        post({ type: "configured", id: msg.id });
        break;
      }

      case "start": {
        if (!currentAgent) {
          post({ type: "error", message: "Aucun agent configuré." });
          break;
        }
        if (training) {
          post({ type: "error", message: "L'entraînement est déjà en cours." });
          break;
        }
        const maxEpisodes = msg.maxEpisodes ?? 400_000;

        if (currentAlgo === "mdp") {
          const agent = currentAgent as MDPAgent;
          const { states, iterations } = agent.build();
          post({ type: "mdp-built", id: msg.id, states, iterations, deltas: agent.deltas });
          break;
        }

        training = true;
        post({ type: "training-started", id: msg.id });
        void trainLoop(maxEpisodes, currentAlgo);
        break;
      }

      case "pause": {
        stopTraining();
        post({ type: "training-paused", id: msg.id });
        break;
      }

      case "reset": {
        stopTraining();
        const key = keyFor(currentPuzzle, currentAlgo);
        agents.delete(key);
        agentParams.delete(key);
        currentAgent = null;
        post({ type: "reset-done", id: msg.id });
        break;
      }

      case "solve": {
        if (!currentAgent) {
          post({ type: "error", id: msg.id, message: "Aucun agent entraîné." });
          break;
        }
        const state = new Uint8Array(msg.state);
        const result = currentAgent.solve(state, msg.maxSteps ?? 40);
        post({ type: "solve-result", id: msg.id, result });
        break;
      }

      case "evaluate": {
        if (!currentAgent) {
          post({ type: "error", id: msg.id, message: "Aucun agent entraîné." });
          break;
        }
        const stats = currentAgent.evaluateStats(msg.depth, msg.trials ?? 80);
        post({ type: "eval-result", id: msg.id, depth: msg.depth, stats });
        break;
      }

      case "benchmark": {
        void runBenchmark({
          ...msg.config,
          onProgress: (msgLabel) => post({ type: "status", message: msgLabel }),
        }).then((result) => {
          post({ type: "benchmark-result", id: msg.id, result });
        });
        break;
      }

      default:
        post({ type: "error", message: `Message inconnu: ${(msg as { type?: string }).type}` });
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};