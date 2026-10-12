import { describe, expect, it } from "vitest";
import { buildCube, buildPyraminx } from "../engine";
import { mulberry32 } from "../engine/rng";
import { MDPAgent } from "./mdp";
import { PYRAMINX_STATES, PyraminxMDPAgent } from "./mdpPyraminx";

describe("MDPAgent (cube)", () => {
  it("builds a depth-limited graph and runs value iteration", () => {
    const agent = new MDPAgent(buildCube(), { maxDepth: 2 });
    const { states, iterations } = agent.build();
    expect(states).toBeGreaterThan(1);
    expect(iterations).toBeGreaterThan(0);
    expect(agent.deltas[agent.deltas.length - 1]).toBeLessThan(1e-6);
  });

  it("reports the exact size of the depth-limited graph", () => {
    const cube = buildCube();
    // Solved state + the 12 neighbours produced by the first move.
    expect(new MDPAgent(cube, { maxDepth: 1 }).build().states).toBe(13);
  });

  it("contains every depth-1 scramble in its graph", () => {
    const cube = buildCube();
    const agent = new MDPAgent(cube, { maxDepth: 1 });
    agent.build();
    expect(agent.indexOf(cube.scramble(1, mulberry32(1)))).toBeGreaterThanOrEqual(0);
  });

  it("solves every depth-1 cube scramble optimally", () => {
    const agent = new MDPAgent(buildCube(), { maxDepth: 1 });
    agent.build();
    const rng = mulberry32(11);
    for (let i = 0; i < 20; i++) {
      const state = agent.puzzle.scramble(1, rng);
      if (agent.puzzle.isSolved(state)) continue;
      const result = agent.solve(state, 40);
      expect(result.solved).toBe(true);
      expect(result.path.length).toBe(1);
    }
  });

  it("reaches 100 % on the cube at depth 3", () => {
    const agent = new MDPAgent(buildCube(), { maxDepth: 3 });
    agent.build();
    expect(agent.evaluateStats(3, 40).rate).toBe(1);
  });

  it("exposes a monotone convergence curve", () => {
    const agent = new MDPAgent(buildCube(), { maxDepth: 2, tol: 1e-8 });
    agent.build();
    const deltas = agent.deltas;
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1] + 1e-12);
    }
  });
});

describe("PyraminxMDPAgent", () => {
  it(
    "enumerates the full 933 120-state graph and solves optimally",
    { timeout: 300_000 },
    () => {
      const agent = new PyraminxMDPAgent(buildPyraminx());
      const { states, iterations, cancelled } = agent.build();
      expect(cancelled).toBe(false);
      expect(states).toBe(PYRAMINX_STATES);
      expect(iterations).toBeGreaterThan(0);
      expect(agent.solve(agent.puzzle.solved.slice()).solved).toBe(true);
      expect(agent.evaluateStats(1, 20).rate).toBe(1);
    },
  );
});
