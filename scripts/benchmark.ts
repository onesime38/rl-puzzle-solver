/**
 * Command-line benchmark.
 *
 * Trains Q-learning, Double Q-learning and the MDP agent on the 3×3×3 cube and
 * the Megaminx, measures the success rate per depth, prints a table and writes
 * `results.json` (imported by the home page and the results page).
 *
 * Usage:
 *   npm run bench            # defaults: depths 1..5, 80 trials per cell
 *   npm run bench -- --max-depth 4 --trials 100 --epochs 300000 --seed 7
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runBenchmark, type Algorithm, type BenchmarkResult, type PuzzleId } from "../src/agents";

interface CliOptions {
  puzzles: PuzzleId[];
  algorithms: Algorithm[];
  depths: number[];
  robustnessDepths: number[];
  trials: number;
  maxEpisodes: number;
  maxStates: number;
  seed: number;
  out: string;
}

function numberValue(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Valeur invalide pour --${name}: ${value}`);
  return n;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    puzzles: ["cube", "megaminx"],
    algorithms: ["q", "dq", "mdp"],
    depths: [1, 2, 3, 4, 5],
    robustnessDepths: [1, 2, 3, 4, 5, 6, 7, 8],
    trials: 80,
    maxEpisodes: 400_000,
    maxStates: 1_000_000,
    seed: 12345,
    out: resolve(process.cwd(), "src/data/results.json"),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string | undefined => argv[i + 1];
    switch (arg) {
      case "--max-depth": {
        const maxDepth = numberValue("max-depth", next(), 5);
        opts.depths = Array.from({ length: maxDepth }, (_, d) => d + 1);
        i++;
        break;
      }
      case "--depths":
        opts.depths = (next() ?? "1,2,3,4,5")
          .split(",")
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0);
        i++;
        break;
      case "--robustness-depths":
        opts.robustnessDepths = (next() ?? "1,2,3,4,5,6,7,8")
          .split(",")
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0);
        i++;
        break;
      case "--trials":
        opts.trials = numberValue("trials", next(), 80);
        i++;
        break;
      case "--episodes":
        opts.maxEpisodes = numberValue("episodes", next(), 400_000);
        i++;
        break;
      case "--max-states":
        opts.maxStates = numberValue("max-states", next(), 1_000_000);
        i++;
        break;
      case "--puzzles":
        opts.puzzles = (next() ?? "cube,megaminx").split(",") as PuzzleId[];
        i++;
        break;
      case "--algorithms":
        opts.algorithms = (next() ?? "q,dq,mdp").split(",") as Algorithm[];
        i++;
        break;
      case "--seed":
        opts.seed = numberValue("seed", next(), 12345);
        i++;
        break;
      case "--out":
        opts.out = resolve(process.cwd(), next() ?? "src/data/results.json");
        i++;
        break;
      case "--help":
      case "-h": {
        console.log(`
Benchmark RL : Q-learning, Double Q-learning, MDP — cube 3x3x3 et Megaminx.

Options :
  --max-depth N     profondeur maximale du curriculum (defaut 5)
  --depths a,b,c    liste explicite des profondeurs testees
  --robustness-depths a,b,c  profondeurs de l'etude de robustesse (defaut 1..8)
  --trials N        essais par cellule du tableau (defaut 80)
  --episodes N      budget maximal d'episodes par agent (defaut 400000)
  --max-states N    plafond de la table Q en etats (defaut 1000000)
  --puzzles l       cube,megaminx separes par une virgule
  --algorithms l    q,dq,mdp separes par une virgule
  --seed N          graine pseudo-aleatoire (defaut 12345)
  --out PATH        fichier de sortie (defaut src/data/results.json)
`);
        process.exit(0);
      }
      default:
        throw new Error(`Argument inconnu: ${arg}`);
    }
  }
  return opts;
}

function machine(label: string, value: number): string {
  return `${label} ${value.toFixed(3).padStart(8)}`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const labelLine = `puzzles=${opts.puzzles.join("+")} maxDepth=${Math.max(...opts.depths)} trials=${opts.trials} episodes=${opts.maxEpisodes} seed=${opts.seed}`;
  console.log(`Benchmark RL — ${labelLine}`);
  console.log("");

  const startedAt = Date.now();

  const result: BenchmarkResult = await runBenchmark({
    puzzles: opts.puzzles,
    algorithms: opts.algorithms,
    depths: opts.depths,
    maxDepth: Math.max(...opts.depths),
    robustnessDepths: opts.robustnessDepths,
    trials: opts.trials,
    maxEpisodes: opts.maxEpisodes,
    maxStates: opts.maxStates,
    seed: opts.seed,
    onProgress: (msg) => process.stdout.write(`\r${msg.padEnd(72)}`),
  });

  for (const puzzle of opts.puzzles) {
    const rows: Array<Record<string, string | number>> = [];
    for (const depth of opts.depths) {
      const row: Record<string, string | number> = { profondeur: depth };
      for (const algo of opts.algorithms) {
        const cell = result.cells.find((c) => c.puzzle === puzzle && c.algorithm === algo && c.depth === depth);
        row[algo] = cell ? `${Math.round(cell.successRate * 100)} % (n=${cell.meanMoves.toFixed(2)})` : "—";
      }
      rows.push(row);
    }
    console.log(`\n=== ${puzzle} ===`);
    console.table(rows);

    const algoSummary = opts.algorithms
      .map((algo) => {
        const base = result.cells.find((c) => c.puzzle === puzzle && c.algorithm === algo && c.depth === 1);
        if (!base) return null;
        return `  ${algo.padEnd(4)} états=${base.states} épisodes=${base.episodes} iters=${base.iters} entraînement=${Math.round(base.trainTimeMs)} ms`;
      })
      .filter(Boolean);
    console.log(algoSummary.join("\n"));
  }

  // Robustness study: success rate versus scramble depth (trained depth shown).
  for (const puzzle of opts.puzzles) {
    const rows: Array<Record<string, string | number>> = [];
    for (const depth of opts.robustnessDepths) {
      const row: Record<string, string | number> = { profondeur: depth };
      for (const algo of opts.algorithms) {
        const cell = result.robustness.find(
          (c) => c.puzzle === puzzle && c.algorithm === algo && c.depth === depth,
        );
        row[algo] = cell ? `${Math.round(cell.successRate * 100)} %` : "—";
      }
      rows.push(row);
    }
    const trained = result.robustness.find((c) => c.puzzle === puzzle);
    console.log(
      `\n=== Robustesse ${puzzle} (profondeur apprise : ${trained ? trained.trainedDepth : "—"}) ===`,
    );
    console.table(rows);
  }

  const cubeDepth4 = result.cells.filter((c) => c.puzzle === "cube" && c.depth === 4);
  const qAt4 = cubeDepth4.find((c) => c.algorithm === "q");
  const dqAt4 = cubeDepth4.find((c) => c.algorithm === "dq");
  const mdpAt4 = cubeDepth4.find((c) => c.algorithm === "mdp");
  console.log("");
  console.log(
    `Acceptation cube profondeur 4 : Q=${qAt4 ? Math.round(qAt4.successRate * 100) : "—"} % ` +
      `DQ=${dqAt4 ? Math.round(dqAt4.successRate * 100) : "—"} % ` +
      `MDP=${mdpAt4 ? Math.round(mdpAt4.successRate * 100) : "—"} % ` +
      `(${machine("durée totale", (Date.now() - startedAt) / 1000)} s)`,
  );

  const megaDepth3 = result.cells.filter((c) => c.puzzle === "megaminx" && c.depth === 3);
  const mqAt3 = megaDepth3.find((c) => c.algorithm === "q");
  const mdqAt3 = megaDepth3.find((c) => c.algorithm === "dq");
  const mmol = megaDepth3.find((c) => c.algorithm === "mdp");
  if (mqAt3) {
    console.log(
      `Acceptation megaminx profondeur 3 : Q=${mqAt3 ? Math.round(mqAt3.successRate * 100) : "—"} % ` +
        `DQ=${mdqAt3 ? Math.round(mdqAt3.successRate * 100) : "—"} % ` +
        `MDP=${mmol ? Math.round(mmol.successRate * 100) : "—"} %`,
    );
  }

  const outPath = opts.out;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`Écrit dans ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});