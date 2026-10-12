import { useMemo } from "react";
import type { Algorithm, BenchmarkCell, PuzzleId } from "../agents";
import { BenchmarkRunner } from "../components/simulator/BenchmarkRunner";
import { ALGORITHM_LABELS, results } from "../data/results";
import {
  ROBUSTNESS_DEPTHS,
  robustnessFor,
  trainedDepthFor,
} from "../data/results";
import { benchmarkToCsv, benchmarkToJson, downloadText, robustnessToCsv } from "../lib/download";
import "./resultats.css";

const PUZZLE_TITLES: Record<PuzzleId, string> = {
  cube: "Cube 3×3×3",
  megaminx: "Megaminx",
};

const DEPTHS_BY_PUZZLE: Record<PuzzleId, number[]> = {
  cube: [1, 2, 3, 4, 5],
  megaminx: [1, 2, 3, 4],
};

const ALGORITHMS: Algorithm[] = ["q", "dq", "mdp"];

const W = 620;
const H = 280;
const PAD_X = 44;
const PAD_Y = 24;

interface Series {
  algo: Algorithm;
  points: { depth: number; rate: number }[];
}

interface Marker {
  algo: Algorithm;
  depth: number;
}

/** Shared success-rate-versus-depth line chart. */
function RateChart({
  depths,
  series,
  markers = [],
  ariaLabel,
}: {
  depths: number[];
  series: Series[];
  markers?: Marker[];
  ariaLabel: string;
}) {
  const span = Math.max(1, Math.max(...depths) - Math.min(...depths));
  const lo = Math.min(...depths);
  const x = (d: number) => PAD_X + ((d - lo) / span) * (W - PAD_X - 24);
  const y = (r: number) => H - PAD_Y - r * 100 * (H - 2 * PAD_Y) + PAD_Y;
  const uniqueMarkers = markers.filter(
    (m, i) => markers.findIndex((n) => n.depth === m.depth) === i,
  );

  return (
    <div className="curve" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${W} ${H}`} className="curve__svg" aria-hidden="true">
        <g className="curve__grid">
          {[0, 20, 40, 60, 80, 100].map((v) => (
            <g key={v}>
              <line x1={PAD_X} y1={y(v / 100)} x2={W - 24} y2={y(v / 100)} />
              <text x={PAD_X - 8} y={y(v / 100) + 3.5} textAnchor="end">
                {v} %
              </text>
            </g>
          ))}
          {depths.map((d) => (
            <text key={d} x={x(d)} y={H - PAD_Y + 16} textAnchor="middle">
              {d}
            </text>
          ))}
        </g>
        {uniqueMarkers.map((m) => (
          <g key={`marker-${m.depth}`} className="curve__marker">
            <line x1={x(m.depth)} y1={PAD_Y} x2={x(m.depth)} y2={H - PAD_Y} />
            <text x={x(m.depth)} y={PAD_Y - 8} textAnchor="middle">
              apprise {m.depth}
            </text>
          </g>
        ))}
        {series.map(({ algo, points }) => {
          const path = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.depth).toFixed(1)} ${y(p.rate).toFixed(1)}`)
            .join(" ");
          return (
            <g key={algo}>
              <path d={path} className={`curve__line curve__line--${algo}`} fill="none" />
              {points.map((p) => (
                <circle
                  key={p.depth}
                  cx={x(p.depth)}
                  cy={y(p.rate)}
                  r={points.length < 5 ? 3.5 : 2.5}
                  className={`curve__dot curve__dot--${algo}`}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="curve__legend">
        {ALGORITHMS.map((algo) => (
          <span key={algo} className="legend-item">
            <span className={`legend-dot legend-dot--${algo}`} aria-hidden="true" />
            {ALGORITHM_LABELS[algo]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Success rate versus depth measured at each agent's curriculum depth. */
function Curve({ puzzle }: { puzzle: PuzzleId }) {
  const depths = DEPTHS_BY_PUZZLE[puzzle];
  const series = useMemo<Series[]>(
    () =>
      ALGORITHMS.map((algo) => ({
        algo,
        points: results.cells
          .filter((c) => c.puzzle === puzzle && c.algorithm === algo)
          .sort((a, b) => a.depth - b.depth)
          .map((c) => ({ depth: c.depth, rate: c.successRate })),
      })),
    [puzzle],
  );
  return (
    <RateChart
      depths={depths}
      series={series}
      ariaLabel={`Taux de résolution par profondeur pour ${PUZZLE_TITLES[puzzle]}`}
    />
  );
}

/** Success rate versus scramble depth, extended beyond the trained depth. */
function RobustnessCurve({ puzzle }: { puzzle: PuzzleId }) {
  const series = useMemo<Series[]>(
    () =>
      ALGORITHMS.map((algo) => ({
        algo,
        points: ROBUSTNESS_DEPTHS.map((d) => ({
          depth: d,
          rate: robustnessFor(puzzle, algo, d)?.successRate ?? 0,
        })),
      })),
    [puzzle],
  );
  const markers = useMemo<Marker[]>(
    () => ALGORITHMS.map((algo) => ({ algo, depth: trainedDepthFor(puzzle, algo) })),
    [puzzle],
  );
  return (
    <RateChart
      depths={ROBUSTNESS_DEPTHS}
      series={series}
      markers={markers}
      ariaLabel={`Robustesse : taux de résolution selon la profondeur du mélange pour ${PUZZLE_TITLES[puzzle]}`}
    />
  );
}

function fmtRate(cell: BenchmarkCell | undefined): string {
  if (!cell) return "—";
  return Number((cell.successRate * 100).toFixed(1)) + " %";
}

function fmtMoves(cell: BenchmarkCell | undefined): string {
  if (!cell) return "—";
  return Number(cell.meanMoves.toFixed(2)).toLocaleString("fr-FR");
}

function PuzzleTable({ puzzle }: { puzzle: PuzzleId }) {
  const depths = DEPTHS_BY_PUZZLE[puzzle];
  return (
    <section>
      <h2>{PUZZLE_TITLES[puzzle]}</h2>
      <Curve puzzle={puzzle} />
      <div className="table-wrap">
        <table className="data">
          <caption>
            Taux de réussite (C, %) et longueur moyenne de résolution (M, coups) sur 80 mélanges
            par profondeur.
          </caption>
          <thead>
            <tr>
              <th scope="col">Algorithme</th>
              {depths.map((d) => (
                <th scope="col" key={d}>
                  Profondeur {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALGORITHMS.map((algo) => (
              <tr key={algo}>
                <th scope="row">{ALGORITHM_LABELS[algo]}</th>
                {depths.map((d) => {
                  const cell = results.cells.find(
                    (c) => c.puzzle === puzzle && c.algorithm === algo && c.depth === d,
                  );
                  return (
                    <td key={d}>
                      <span className="rate">{fmtRate(cell)}</span>
                      <span className="muted"> · {fmtMoves(cell)} coups</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RobustnessTable({ puzzle }: { puzzle: PuzzleId }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption>
          Robustesse : taux de réussite (%) selon la profondeur du mélange, de 1 à 8 coups. La
          profondeur apprise est indiquée par algorithme. Au-delà, l'agent agit hors de l'espace
          qu'il a exploré : la chute est attendue.
        </caption>
        <thead>
          <tr>
            <th scope="col">Algorithme</th>
            <th scope="col">Apprise</th>
            {ROBUSTNESS_DEPTHS.map((d) => (
              <th scope="col" key={d}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALGORITHMS.map((algo) => {
            const trained = trainedDepthFor(puzzle, algo);
            return (
              <tr key={algo}>
                <th scope="row">{ALGORITHM_LABELS[algo]}</th>
                <td className="muted">{trained}</td>
                {ROBUSTNESS_DEPTHS.map((d) => {
                  const cell = robustnessFor(puzzle, algo, d);
                  const beyond = d > trained;
                  return (
                    <td key={d} className={beyond ? "beyond" : undefined}>
                      {cell ? Number((cell.successRate * 100).toFixed(1)) + " %" : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ResultatsPage() {
  const { config, generatedAt } = results;

  return (
    <div className="container">
      <header className="page-head">
        <h1>Résultats</h1>
        <p>
          Mesures <strong>réelles</strong>, produites par le benchmark du projet
          (<code>npm run bench</code>, écrit dans <code>src/data/results.json</code>). Rien n'est
          inventé ni précalculé à la main.
        </p>
        <div className="export-actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => downloadText("resultats.csv", benchmarkToCsv(results), "text/csv")}
          >
            Exporter en CSV
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => downloadText("resultats.json", benchmarkToJson(results), "application/json")}
          >
            Exporter en JSON
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              downloadText("robustesse.csv", robustnessToCsv(results), "text/csv")
            }
          >
            Exporter la robustesse (CSV)
          </button>
        </div>
      </header>

      <section className="config-strip" aria-label="Paramètres du benchmark">
        <ul>
          <li>
            <span className="key">Semence</span>
            <span className="val">{config.seed}</span>
          </li>
          <li>
            <span className="key">Profondeur max.</span>
            <span className="val">{config.maxDepth} coups</span>
          </li>
          <li>
            <span className="key">Essais par cellule</span>
            <span className="val">{config.trials}</span>
          </li>
          <li>
            <span className="key">Mélanges de test</span>
            <span className="val">{config.testTrials}</span>
          </li>
          <li>
            <span className="key">Limite mémoire</span>
            <span className="val">{config.maxStates.toLocaleString("fr-FR")} états</span>
          </li>
          <li>
            <span className="key">Hyperparamètres</span>
            <span className="val">α 0,5 · γ 0,95 · gliss. 5 % · ε selon le puzzle</span>
          </li>
        </ul>
        <p className="small muted">
          Généré le {new Date(generatedAt).toLocaleString("fr-FR")}.
        </p>
      </section>

      <div className="results-grid">
        <PuzzleTable puzzle="cube" />
        <PuzzleTable puzzle="megaminx" />
      </div>

      <section className="note note--warn">
        <strong>Lecture honnête.</strong> Le Q-learning tabulaire du cube 3×3×3 cesse d'être fiable
        au-delà de <strong>4 coups</strong> (≈ 98 507 états ≤ profondeur 5 pour les répétitions,
        plusieurs millions réellement parcourus) : à 5 coups son taux de réussite chute nettement.
        C'est la <em>limite fondamentale du tabulaire</em>, décrite sur la page Algorithmes. Le
        Megaminx suit le même régime, plus tôt encore : fiable jusqu'à <strong>3 coups</strong> en
        tabulaire, tandis que le MDP exact — qui énumère 96 785 états jusqu'à 4 coups — reste
        parfait. À l'inverse du tabulaire, le MDP reste correct à toutes les profondeurs affichées.
      </section>

      <section>
        <h2>Robustesse</h2>
        <p>
          Au-delà de la <strong>profondeur apprise</strong>, l'agent quitte l'espace d'états qu'il a
          exploré : il ne « cherche » pas la solution, il applique une politique inconnue sur des
          états jamais vus. Le taux doit donc s'effondrer, et c'est bien ce que montrent les mesures
          ci-dessous, sur <strong>1 à 8 coups</strong>, pour les trois algorithmes. Aucune recherche
          cachée n'est ajoutée au moment de la résolution.
        </p>
        <div className="results-grid">
          <section>
            <h3>{PUZZLE_TITLES.cube}</h3>
            <RobustnessCurve puzzle="cube" />
            <RobustnessTable puzzle="cube" />
          </section>
          <section>
            <h3>{PUZZLE_TITLES.megaminx}</h3>
            <RobustnessCurve puzzle="megaminx" />
            <RobustnessTable puzzle="megaminx" />
          </section>
        </div>
        <div className="export-actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              downloadText("robustesse.csv", robustnessToCsv(results), "text/csv")
            }
          >
            Exporter la robustesse (CSV)
          </button>
        </div>
      </section>

      <section className="note">
        Astuce : lancez <code>npm run bench -- --max-depth 6</code> pour plus de profondeur ; le
        benchmark respecte la limite de mémoire et s'arrête proprement s'il est dépassé.
      </section>

      <BenchmarkRunner />
    </div>
  );
}
