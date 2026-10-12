import type { BenchmarkResult } from "../agents";

const COLUMNS = [
  "puzzle",
  "algorithm",
  "depth",
  "trials",
  "successRate",
  "meanMoves",
  "meanTimeMs",
  "states",
  "episodes",
  "iters",
  "trainTimeMs",
] as const;

/** Serialises a benchmark result to CSV. */
export function benchmarkToCsv(result: BenchmarkResult): string {
  const header = COLUMNS.join(",");
  const rows = result.cells.map((cell) => COLUMNS.map((c) => String(cell[c])).join(","));
  const meta = [
    `# generatedAt,${result.generatedAt}`,
    `# seed,${result.config.seed ?? ""}`,
    `# maxDepth,${result.config.maxDepth}`,
  ];
  return [...meta, header, ...rows].join("\n");
}

/** Serialises a benchmark result to indented JSON. */
export function benchmarkToJson(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}

const ROBUSTNESS_COLUMNS = [
  "puzzle",
  "algorithm",
  "depth",
  "trials",
  "successRate",
  "trainedDepth",
] as const;

/**
 * Serialises the robustness study (success rate versus scramble depth, including
 * depths beyond the trained depth) to CSV. Kept separate from the main table so
 * the two can be quoted independently.
 */
export function robustnessToCsv(result: BenchmarkResult): string {
  const header = ROBUSTNESS_COLUMNS.join(",");
  const rows = result.robustness.map((cell) =>
    ROBUSTNESS_COLUMNS.map((c) => String(cell[c])).join(","),
  );
  const meta = [
    `# generatedAt,${result.generatedAt}`,
    `# seed,${result.config.seed ?? ""}`,
    `# robustnessDepths,${result.config.robustnessDepths.join(" ")}`,
  ];
  return [...meta, header, ...rows].join("\n");
}
