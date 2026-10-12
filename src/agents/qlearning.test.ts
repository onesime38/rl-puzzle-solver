import { describe, expect, it } from "vitest";
import { buildCube, buildPyraminx } from "../engine";
import { mulberry32 } from "../engine/rng";
import { QAgent } from "./qlearning";
import { train } from "./train";

describe("QAgent storage", () => {
  it("initialises Q-values pessimistically to -15", () => {
    const agent = new QAgent(buildCube(), "q", { init: -15, seed: 1 });
    const state = agent.puzzle.scramble(2, mulberry32(2));
    const row = agent.store.ensure(state);
    expect(row).toBeGreaterThanOrEqual(0);
    for (let a = 0; a < agent.puzzle.nA; a++) {
      expect(agent.store.table(0)[row * agent.puzzle.nA + a]).toBe(-15);
    }
  });

  it("stores pyraminx states in a typed-array hash table", () => {
    const agent = new QAgent(buildPyraminx(), "q", { init: -7, seed: 1 });
    const state = agent.puzzle.scramble(3, mulberry32(3));
    expect(agent.store.indexOf(state)).toBe(-1);
    const row = agent.store.ensure(state);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(agent.store.indexOf(state)).toBe(row);
    expect(agent.store.size).toBe(1);
  });

  it("respects the memory cap and reports it", () => {
    const agent = new QAgent(buildCube(), "q", { maxStates: 3, seed: 1 });
    expect(agent.full).toBe(false);
    for (let i = 0; i < 100 && !agent.full; i++) agent.episode();
    expect(agent.nStates).toBeLessThanOrEqual(3);
    expect(agent.nStates).toBe(3);
    expect(agent.full).toBe(true);
  });
});

describe("QAgent learning", () => {
  it("learns to solve depth-1 pyraminx scrambles", () => {
    const agent = new QAgent(buildPyraminx(), "q", { maxDepth: 1, seed: 42 });
    const summary = train(agent, { maxEpisodes: 20_000, epochSize: 200, onProgress: undefined });
    expect(summary.reason).toBe("converged");
    expect(agent.evaluateStats(1, 60).rate).toBe(1);
  });

  it("is deterministic under a fixed seed", () => {
    const a = new QAgent(buildCube(), "q", { maxDepth: 1, seed: 7 });
    const b = new QAgent(buildCube(), "q", { maxDepth: 1, seed: 7 });
    for (let i = 0; i < 50; i++) {
      a.episode();
      b.episode();
    }
    expect(a.history.length).toBe(b.history.length);
    expect(a.episodes).toBe(b.episodes);
    expect(a.nStates).toBe(b.nStates);
  });

  it("Double Q-learning converges on the cube at depth 2", () => {
    const agent = new QAgent(buildCube(), "dq", { maxDepth: 2, seed: 3 });
    const summary = train(agent, { maxEpisodes: 60_000, epochSize: 300, onProgress: undefined });
    expect(summary.reason).toBe("converged");
    expect(agent.evaluateStats(2, 60).rate).toBeGreaterThanOrEqual(0.95);
  });
});

describe("QAgent solving", () => {
  it("returns an empty path when the state is already solved", () => {
    const agent = new QAgent(buildCube(), "q", { seed: 1 });
    expect(agent.solve(agent.puzzle.solved.slice()).solved).toBe(true);
  });

  it("cannot solve an untrained state", () => {
    const agent = new QAgent(buildCube(), "q", { seed: 1 });
    const result = agent.solve(agent.puzzle.scramble(2));
    expect(result.solved).toBe(false);
  });

  it("learns a greedy policy for depth-2 cube scrambles", () => {
    const cube = buildCube();
    const agent = new QAgent(cube, "q", { maxDepth: 2, seed: 5 });
    train(agent, { maxEpisodes: 60_000, epochSize: 300, onProgress: undefined });
    const target = cube.scramble(2, mulberry32(5));
    const result = agent.solve(target, 40);
    expect(result.solved).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path.length).toBeLessThanOrEqual(40);
  });

  it("improves solving with the bounded look-ahead planner", () => {
    const agent = new QAgent(buildCube(), "q", { maxDepth: 2, seed: 5 });
    train(agent, { maxEpisodes: 60_000, epochSize: 300, onProgress: undefined });
    const pure = agent.evaluateStats(3, 10).rate;
    const planned = agent.evaluateStats(3, 10, 3).rate;
    expect(planned).toBeGreaterThanOrEqual(pure);
  });
});

describe("QAgent curriculum", () => {
  it("raises the level when the success rate exceeds 95 %", () => {
    const agent = new QAgent(buildCube(), "q", { maxDepth: 2, seed: 9 });
    for (let i = 0; i < 60 && agent.level < 2; i++) agent.epoch(300, 40, 0.95);
    expect(agent.level).toBe(2);
  });
});
