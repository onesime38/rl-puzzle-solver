/**
 * Command-line benchmark.
 *
 * Trains Q-learning, Double Q-learning and the MDP agent on the 3×3×3 cube and
 * the Pyraminx, measures the success rate per depth, prints a table and writes
 * `results.json` plus the benchmark and robustness CSV files into `reports/`
 * (a folder used for the written report, not by the website).
 *
 * Usage:
 *   npm run benchmark            # defaults: depths 1..8, 80 trials per cell
 *   npm run benchmark -- --max-depth 4 --trials 100 --episodes 300000 --seed 7
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runBenchmark, type Algorithm, type BenchmarkResult, type PuzzleId } from "../src/agents";
import { benchmarkToCsv, benchmarkToJson, robustnessToCsv } from "../src/lib/download";

interface CliOptions {
  puzzles: PuzzleId[];
  algorithms: Algorithm[];
  depths: number[];
  robustnessDepths: number[];
  trials: number;
  maxEpisodes?: number;
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
    puzzles: ["cube", "pyraminx"],
    algorithms: ["q", "dq", "mdp"],
    depths: [1, 2, 3, 4, 5, 6, 7, 8],
    robustnessDepths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    trials: 80,
    maxStates: 1_000_000,
    seed: 12345,
    out: resolve(process.cwd(), "reports/results.json"),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string | undefined => argv[i + 1];
    switch (arg) {
      case "--max-depth": {
        const maxDepth = numberValue("max-depth", next(), 8);
        opts.depths = Array.from({ length: maxDepth }, (_, d) => d + 1);
        i++;
        break;
      }
      case "--depths":
        opts.depths = (next() ?? "1,2,3,4,5,6,7,8")
          .split(",")
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0);
        i++;
        break;
      case "--robustness-depths":
        opts.robustnessDepths = (next() ?? "1,2,3,4,5,6,7,8,9,10,11")
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
        opts.puzzles = (next() ?? "cube,pyraminx").split(",") as PuzzleId[];
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
        opts.out = resolve(process.cwd(), next() ?? "reports/results.json");
        i++;
        break;
      case "--help":
      case "-h": {
        console.log(`
Benchmark RL : Q-learning, Double Q-learning, MDP — cube 3x3x3 et Pyraminx.

Options :
  --max-depth N     profondeur maximale du curriculum (defaut 8)
  --depths a,b,c    liste explicite des profondeurs testees
  --robustness-depths a,b,c  profondeurs de l'etude de robustesse (defaut 1..11)
  --trials N        essais par cellule du tableau (defaut 80)
  --episodes N      budget maximal d'episodes par agent (defaut : profil du puzzle)
  --max-states N    plafond de la table Q en etats (defaut 1000000)
  --puzzles l       cube,pyraminx separes par une virgule
  --algorithms l    q,dq,mdp separes par une virgule
  --seed N          graine pseudo-aleatoire (defaut 12345)
  --out PATH        fichier de sortie (defaut reports/results.json)
                    les CSV sont ecrits dans le meme dossier
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
  const labelLine = `puzzles=${opts.puzzles.join("+")} maxDepth=${Math.max(...opts.depths)} trials=${opts.trials} episodes=${opts.maxEpisodes ?? "auto"} seed=${opts.seed}`;
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

  const pyraDepth8 = result.cells.filter((c) => c.puzzle === "pyraminx" && c.depth === 8);
  const pqAt8 = pyraDepth8.find((c) => c.algorithm === "q");
  const pdqAt8 = pyraDepth8.find((c) => c.algorithm === "dq");
  const pmol = pyraDepth8.find((c) => c.algorithm === "mdp");
  if (pqAt8) {
    const fmt = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v * 100)} %`);
    console.log(
      `Acceptation pyraminx profondeur 8 : Q=${fmt(pqAt8.successRate)} (planif. ${fmt(pqAt8.planningSuccessRate)}) ` +
        `DQ=${fmt(pdqAt8?.successRate)} (planif. ${fmt(pdqAt8?.planningSuccessRate)}) ` +
        `MDP=${fmt(pmol?.successRate)}`,
    );
  }

  const outPath = opts.out;
  const outDir = dirname(outPath);
  const csvPath = resolve(outDir, "benchmark.csv");
  const robustnessPath = resolve(outDir, "robustness.csv");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, benchmarkToJson(result), "utf8");
  writeFileSync(csvPath, benchmarkToCsv(result), "utf8");
  writeFileSync(robustnessPath, robustnessToCsv(result), "utf8");
  console.log(`Écrit dans ${outPath}`);
  console.log(`Écrit dans ${csvPath}`);
  console.log(`Écrit dans ${robustnessPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});