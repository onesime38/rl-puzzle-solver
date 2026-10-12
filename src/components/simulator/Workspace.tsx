import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  agentParamsFor,
  DEFAULT_PARAMS,
  PUZZLE_PROFILES,
  type Algorithm,
  type EvaluationStats,
  type PuzzleId,
} from "../../agents";
import { ALGORITHM_LABELS, results } from "../../data/results";
import { buildCube, buildMegaminx, type Puzzle } from "../../engine";
import { useSolverTask } from "../../lib/useSolverTask";
import { CubeView } from "../visual/CubeView";
import { MegaminxView } from "../visual/MegaminxView";
import type { PuzzleViewHandle } from "../visual/types";
import { DeltasChart, LearningChart } from "./charts";
import "./workspace.css";

const ALGO_TABS: { id: Algorithm; label: string; hint: string }[] = [
  { id: "q", label: "Q-learning", hint: "Échantillonné, table Q unique" },
  { id: "dq", label: "Double Q-learning", hint: "Deux tables, biais réduit" },
  { id: "mdp", label: "MDP exact", hint: "Graphe + itération de valeur" },
];

const REASON_LABELS: Record<string, string> = {
  converged: "Convergé au niveau maximal",
  memory: "Limite mémoire atteinte",
  budget: "Budget d'épisodes atteint",
  paused: "Entraînement en pause",
};

/** Training-depth cap per puzzle/algorithm (Megaminx: Q/DQ to 3, MDP to 4). */
function maxDepthCap(puzzleId: PuzzleId, algo: Algorithm): number {
  if (puzzleId !== "megaminx") return 6;
  return algo === "mdp" ? 4 : 3;
}

const DEPTHS_BY_PUZZLE: Record<PuzzleId, number[]> = {
  cube: [1, 2, 3, 4, 5],
  megaminx: [1, 2, 3, 4],
};

function MoveTokens({
  moves,
  names,
  active,
}: {
  moves: number[];
  names: readonly string[];
  active: number;
}) {
  if (moves.length === 0) return <>—</>;
  return (
    <span className="move-tokens">
      {moves.map((a, i) => (
        <span
          key={`${i}-${a}`}
          className={`move-token${i < active ? " is-done" : ""}${i === active ? " is-active" : ""}`}
        >
          {names[a]}
        </span>
      ))}
    </span>
  );
}

function scrambleMoves(puzzle: Puzzle, depth: number): number[] {
  const moves: number[] = [];
  let last = -1;
  for (let i = 0; i < depth; i++) {
    let a: number;
    do {
      a = Math.floor(Math.random() * puzzle.nA);
    } while (last >= 0 && a === (last ^ 1));
    moves.push(a);
    last = a;
  }
  return moves;
}

function ComparisonTable({ puzzleId, depths }: { puzzleId: PuzzleId; depths: number[] }) {
  const maxDepth = Math.max(...depths);
  return (
    <div className="table-wrap">
      <table className="data">
        <caption>
          Mesures du benchmark (réelles, issues de <code>src/data/results.json</code>) pour ce
          puzzle.
        </caption>
        <thead>
          <tr>
            <th scope="col">Algorithme</th>
            {depths.map((d) => (
              <th scope="col" key={d}>
                Prof. {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["q", "dq", "mdp"] as Algorithm[]).map((algo) => (
            <tr key={algo}>
              <th scope="row">{ALGORITHM_LABELS[algo]}</th>
              {depths.map((d) => {
                const cell = results.cells.find(
                  (c) => c.puzzle === puzzleId && c.algorithm === algo && c.depth === d,
                );
                return (
                  <td key={d} className="num">
                    {d <= maxDepth && cell ? `${Math.round(cell.successRate * 100)} %` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Workspace({ puzzleId }: { puzzleId: PuzzleId }) {
  const puzzle: Puzzle = useMemo(
    () => (puzzleId === "cube" ? buildCube() : buildMegaminx()),
    [puzzleId],
  );
  const profile = useMemo(() => agentParamsFor(puzzleId, {}), [puzzleId]);
  const viewRef = useRef<PuzzleViewHandle>(null);
  const task = useSolverTask(puzzleId);
  const { state } = task;

  const [algo, setAlgo] = useState<Algorithm>("q");
  const [maxDepth, setMaxDepth] = useState(puzzleId === "cube" ? 4 : 3);
  const [maxEpisodes, setMaxEpisodes] = useState(
    puzzleId === "cube" ? 400_000 : PUZZLE_PROFILES.megaminx.maxEpisodes ?? 120_000,
  );
  const [advanced, setAdvanced] = useState({
    alpha: DEFAULT_PARAMS.alpha,
    gamma: DEFAULT_PARAMS.gamma,
    eps: profile.eps,
    slip: DEFAULT_PARAMS.slip,
    maxStates: DEFAULT_PARAMS.maxStates,
  });
  const [speed, setSpeed] = useState(260);

  const [logical, setLogical] = useState<Uint8Array>(() => puzzle.solved);
  const [scrambleDepth, setScrambleDepth] = useState(puzzleId === "cube" ? 4 : 3);
  const [expertMode, setExpertMode] = useState(false);
  const [trainedDepth, setTrainedDepth] = useState<number | null>(null);
  const mdpDepthRef = useRef<number | null>(null);
  const [scrambleList, setScrambleList] = useState<number[]>([]);
  const [solutionList, setSolutionList] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeWarn, setNoticeWarn] = useState(false);
  const [evalStats, setEvalStats] = useState<EvaluationStats | null>(null);
  const [pointer, setPointer] = useState<{ phase: "scramble" | "solve"; index: number } | null>(
    null,
  );

  useEffect(() => {
    viewRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    const cap = maxDepthCap(puzzleId, algo);
    if (maxDepth > cap) {
      setMaxDepth(cap);
      return;
    }
    task.reset();
    setSolutionList(null);
    setEvalStats(null);
    setNotice(null);
    setTrainedDepth(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algo, maxDepth, puzzleId]);

  // The depth the selected agent was actually trained to: the curriculum level
  // reached by Q/DQ, or the graph depth for the MDP.
  useEffect(() => {
    if (state.phase === "trained") setTrainedDepth(state.progress?.level ?? null);
    else if (state.phase === "built") setTrainedDepth(mdpDepthRef.current);
  }, [state.phase, state.progress?.level, state.mdp]);

  // Without the expert switch, the scramble depth may not exceed what the agent
  // learned; deeper scrambles are outside the explored state space by design.
  useEffect(() => {
    if (!expertMode && trainedDepth !== null && scrambleDepth > trainedDepth) {
      setScrambleDepth(trainedDepth);
    }
  }, [expertMode, trainedDepth, scrambleDepth]);

  const scrambleMax = expertMode ? 8 : trainedDepth ?? 8;

  const ready = state.phase === "trained" || state.phase === "built";
  const training = state.phase === "training" || state.phase === "building";

  async function handleTrain() {
    if (busy) return;
    setNotice(null);
    setEvalStats(null);
    if (algo === "mdp") mdpDepthRef.current = maxDepth;
    await task.train(algo, { ...advanced, maxDepth }, maxEpisodes);
  }

  /** Cause-specific failure notice: scramble depth versus learned depth. */
  function failureNotice(): string {
    const learned = trainedDepth;
    if (learned === null) {
      return "Solution incomplète : l'agent n'a pas atteint l'état résolu.";
    }
    if (scrambleDepth > learned) {
      return (
        `Mélange de ${scrambleDepth} coups, agent entraîné jusqu'à ${learned} : ` +
        `l'état est hors de l'espace exploré. Réduis la profondeur du mélange ` +
        `(ou poursuis l'entraînement à ${scrambleDepth} coups pour couvrir ces états).`
      );
    }
    return (
      `Mélange de ${scrambleDepth} coups, agent entraîné jusqu'à ${learned} : ` +
      `l'agent est dans son domaine mais n'a pas abouti. Poursuis l'entraînement ` +
      `(profondeur cible ${learned}) ou augmente le budget d'épisodes.`
    );
  }

  async function handleScramble() {
    if (busy || !viewRef.current) return;
    setBusy(true);
    setNotice(null);
    setSolutionList(null);
    setEvalStats(null);
    viewRef.current.reset();
    const moves = scrambleMoves(puzzle, scrambleDepth);
    setScrambleList(moves);
    let s = puzzle.solved;
    for (let i = 0; i < moves.length; i++) {
      setPointer({ phase: "scramble", index: i });
      await viewRef.current.animate(moves[i]);
      s = puzzle.apply(s, moves[i]);
    }
    setPointer(null);
    setLogical(s);
    setBusy(false);
  }

  async function handleSolve() {
    if (busy || !viewRef.current) return;
    setBusy(true);
    setNotice(null);
    setEvalStats(null);
    const result = await task.solve(logical, Math.max(60, scrambleDepth * 4 + 10));
    if (result.outside) {
      setNoticeWarn(true);
      setNotice(
        `Cet état est hors du graphe MDP (mélange de ${scrambleDepth} coups, graphe construit ` +
          `jusqu'à ${trainedDepth ?? maxDepth} coups). Augmentez la profondeur cible et reconstruisez.`,
      );
      setBusy(false);
      return;
    }
    let s = logical;
    setSolutionList(result.path);
    for (let i = 0; i < result.path.length; i++) {
      setPointer({ phase: "solve", index: i });
      await viewRef.current.animate(result.path[i]);
      s = puzzle.apply(s, result.path[i]);
    }
    setPointer(null);
    setLogical(s);
    if (result.solved) {
      setNoticeWarn(false);
      setNotice(`Résolu en ${result.path.length} coup${result.path.length > 1 ? "s" : ""}.`);
    } else {
      setNoticeWarn(true);
      setNotice(failureNotice());
    }
    setBusy(false);
  }

  async function handleEvaluate() {
    if (busy) return;
    setBusy(true);
    setEvalStats(null);
    const stats = await task.evaluate(scrambleDepth, 80);
    setEvalStats(stats);
    setBusy(false);
  }

  async function handleManualMove(a: number) {
    if (busy || !viewRef.current) return;
    setBusy(true);
    setNotice(null);
    setSolutionList(null);
    setEvalStats(null);
    setScrambleList([]);
    await viewRef.current.animate(a);
    setLogical((s) => puzzle.apply(s, a));
    setBusy(false);
  }

  function handleResetView() {
    if (busy || !viewRef.current) return;
    viewRef.current.reset();
    setLogical(puzzle.solved);
    setScrambleList([]);
    setSolutionList(null);
    setEvalStats(null);
    setNotice(null);
    setPointer(null);
  }

  function handleResetAgent() {
    if (busy) return;
    task.reset();
    setEvalStats(null);
    setNotice(null);
    setTrainedDepth(null);
    mdpDepthRef.current = null;
  }

  const memoryUsed =
    algo === "mdp"
      ? state.mdp?.states ?? 0
      : (state.progress?.states ?? 0) * puzzle.nA * 4 * 2;

  return (
    <div className="container container-wider">
      <nav className="crumbs" aria-label="Fil d'Ariane">
        <Link to="/simulateur">Simulateur</Link>
        <span aria-hidden="true">/</span>
        <span>{puzzle.name}</span>
      </nav>

      <header className="workspace-head">
        <h1>{puzzle.name}</h1>
        <p className="muted">
          {puzzle.n} cellules · {puzzle.nA} actions · entraînement dans un Web Worker
        </p>
      </header>

      {state.error ? (
        <p className="note note--err" role="alert">
          {state.error}{" "}
          <button type="button" className="btn btn--sm" onClick={task.clearError}>
            Fermer
          </button>
        </p>
      ) : null}

      <div className="workspace">
        <section className="workspace__board" aria-label="Puzzle">
          {puzzleId === "cube" ? (
            <CubeView ref={viewRef} puzzle={puzzle as ReturnType<typeof buildCube>} />
          ) : (
            <MegaminxView
              ref={viewRef}
              puzzle={puzzle as ReturnType<typeof buildMegaminx>}
              onPickFace={handleManualMove}
            />
          )}

          <div className="board-controls">
            <div className="field">
              <label htmlFor="scramble-depth">
                Profondeur du mélange
                {trainedDepth !== null ? (
                  <span className="muted"> (apprise : {trainedDepth})</span>
                ) : null}
              </label>
              <input
                id="scramble-depth"
                type="number"
                min={1}
                max={scrambleMax}
                value={scrambleDepth}
                onChange={(e) =>
                  setScrambleDepth(
                    Math.max(1, Math.min(scrambleMax, Number(e.target.value) || 1)),
                  )
                }
              />
            </div>
            <label className="field field--toggle">
              <input
                type="checkbox"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
              />
              <span>Mode expert</span>
            </label>
            <button type="button" className="btn" onClick={handleScramble} disabled={busy}>
              Mélanger
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSolve}
              disabled={busy || !ready}
            >
              Résoudre
            </button>
            <button type="button" className="btn" onClick={handleResetView} disabled={busy}>
              Remettre résolu
            </button>
            <button type="button" className="btn" onClick={handleResetAgent} disabled={busy}>
              Réinitialiser l'agent
            </button>
          </div>

          {expertMode && trainedDepth !== null && scrambleDepth > trainedDepth ? (
            <p className="note note--warn" role="status">
              Profondeur supérieure à la profondeur apprise ({trainedDepth}) : l'échec est attendu,
              les états sont hors de l'espace exploré.
            </p>
          ) : null}

          <div className="field field--range">
            <label htmlFor="speed">Durée d'un coup : {speed} ms</label>
            <input
              id="speed"
              type="range"
              min={40}
              max={600}
              step={20}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </div>

          <dl className="move-log">
            <div>
              <dt>Mélange</dt>
              <dd>
                <MoveTokens
                  moves={scrambleList}
                  names={puzzle.names}
                  active={pointer?.phase === "scramble" ? pointer.index : -1}
                />
              </dd>
            </div>
            <div>
              <dt>Solution</dt>
              <dd>
                {solutionList === null ? (
                  "—"
                ) : solutionList.length === 0 ? (
                  "déjà résolu"
                ) : (
                  <MoveTokens
                    moves={solutionList}
                    names={puzzle.names}
                    active={pointer?.phase === "solve" ? pointer.index : solutionList.length}
                  />
                )}
              </dd>
            </div>
          </dl>

          {puzzleId === "megaminx" ? (
            <div className="manual-moves" aria-label="Coups manuels">
              <h3>Coups manuels</h3>
              <div className="manual-moves__grid">
                {Array.from({ length: 12 }, (_, g) => (
                  <div key={g} className="manual-moves__face">
                    {[0, 1].map((d) => {
                      const a = 2 * g + d;
                      return (
                        <button
                          key={a}
                          type="button"
                          className="btn btn--sm"
                          onClick={() => handleManualMove(a)}
                          disabled={busy}
                        >
                          {puzzle.names[a]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notice ? (
            <p className={noticeWarn ? "note note--warn" : "note note--ok"} role="status">
              {notice}
            </p>
          ) : null}
        </section>

        <section className="workspace__panel" aria-label="Entraînement">
          <h2>Agent</h2>
          <div className="algo-tabs" role="group" aria-label="Algorithme">
            {ALGO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={algo === tab.id}
                className={`algo-tab ${algo === tab.id ? "is-active" : ""}`}
                onClick={() => setAlgo(tab.id)}
                disabled={training || busy}
              >
                <strong>{tab.label}</strong>
                <small>{tab.hint}</small>
              </button>
            ))}
          </div>

          <div className="params-grid">
            <div className="field">
              <label htmlFor="max-depth">Profondeur cible</label>
              <input
                id="max-depth"
                type="number"
                min={1}
                max={maxDepthCap(puzzleId, algo)}
                value={maxDepth}
                onChange={(e) =>
                  setMaxDepth(
                    Math.max(1, Math.min(maxDepthCap(puzzleId, algo), Number(e.target.value) || 1)),
                  )
                }
              />
            </div>
            {algo !== "mdp" ? (
              <div className="field">
                <label htmlFor="max-episodes">Épisodes max.</label>
                <input
                  id="max-episodes"
                  type="number"
                  min={1000}
                  step={1000}
                  value={maxEpisodes}
                  onChange={(e) => setMaxEpisodes(Math.max(1000, Number(e.target.value) || 1000))}
                />
              </div>
            ) : null}
          </div>

          <details className="advanced">
            <summary>Hyperparamètres avancés</summary>
            <div className="params-grid">
              <label className="field">
                <span>α (apprentissage)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0.01}
                  max={1}
                  value={advanced.alpha}
                  onChange={(e) => setAdvanced({ ...advanced, alpha: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>γ (actualisation)</span>
                <input
                  type="number"
                  step={0.01}
                  min={0.1}
                  max={0.999}
                  value={advanced.gamma}
                  onChange={(e) => setAdvanced({ ...advanced, gamma: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>ε (exploration)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={advanced.eps}
                  onChange={(e) => setAdvanced({ ...advanced, eps: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>p (glissement)</span>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={advanced.slip}
                  onChange={(e) => setAdvanced({ ...advanced, slip: Number(e.target.value) })}
                />
              </label>
            </div>
          </details>

          <div className="train-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleTrain}
              disabled={training || busy}
            >
              {algo === "mdp" ? "Construire le graphe" : "Entraîner"}
            </button>
            <button type="button" className="btn" onClick={task.pause} disabled={state.phase !== "training"}>
              Pause
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleEvaluate}
              disabled={busy || !ready}
            >
              Évaluer (80 mélanges)
            </button>
          </div>

          <dl className="status" aria-live="polite">
            <div>
              <dt>État</dt>
              <dd>
                {state.phase === "idle"
                  ? "inactif"
                  : state.phase === "training"
                    ? "entraînement…"
                    : state.phase === "building"
                      ? "construction du graphe…"
                      : state.phase === "trained"
                        ? "entraîné"
                        : "graphe construit"}
              </dd>
            </div>
            {state.progress && algo !== "mdp" ? (
              <>
                <div>
                  <dt>Niveau</dt>
                  <dd className="num">{state.progress.level}</dd>
                </div>
                <div>
                  <dt>Épisodes</dt>
                  <dd className="num">{state.progress.episode.toLocaleString("fr-FR")}</dd>
                </div>
                <div>
                  <dt>États</dt>
                  <dd className="num">{state.progress.states.toLocaleString("fr-FR")}</dd>
                </div>
                <div>
                  <dt>Réussite (niveau courant)</dt>
                  <dd className="num">{Math.round(state.progress.rate * 100)} %</dd>
                </div>
              </>
            ) : null}
            {state.mdp ? (
              <>
                <div>
                  <dt>États du graphe</dt>
                  <dd className="num">{state.mdp.states.toLocaleString("fr-FR")}</dd>
                </div>
                <div>
                  <dt>Itérations</dt>
                  <dd className="num">{state.mdp.iterations}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Mémoire Q estimée</dt>
              <dd className="num">
                {algo === "mdp" ? "—" : `${Math.round(memoryUsed / 1_000_000)} Mo`}
              </dd>
            </div>
            <div>
              <dt>Profondeur apprise</dt>
              <dd className="num">{trainedDepth ?? "—"}</dd>
            </div>
          </dl>

          {state.progress?.full ? (
            <p className="note note--warn">
              Limite mémoire de la table Q atteinte : c'est la contrainte fondamentale du
              Q-learning tabulaire. Réduisez la profondeur cible.
            </p>
          ) : null}

          {state.reason ? (
            <p className="small muted">{REASON_LABELS[state.reason] ?? state.reason}</p>
          ) : null}

          {evalStats ? (
            <p className="note note--ok">
              Évaluation : {Math.round(evalStats.rate * 100)} % de réussite sur {evalStats.trials}{" "}
              mélanges de {scrambleDepth} coups ({evalStats.meanMoves.toFixed(2)} coups en moyenne).
            </p>
          ) : null}

          {algo !== "mdp" ? <LearningChart points={state.points} /> : null}
          {state.mdp ? <DeltasChart deltas={state.mdp.deltas} /> : null}
        </section>
      </div>

      <section className="workspace__compare">
        <h2>Comparaison des algorithmes</h2>
        <ComparisonTable puzzleId={puzzleId} depths={DEPTHS_BY_PUZZLE[puzzleId]} />
        <p className="note note--warn">
          {puzzleId === "cube"
            ? "Le cube est résolu de façon fiable par le Q-learning tabulaire jusqu'à 4 coups ; au-delà, la table devient trop grande (limite du Q-learning tabulaire). Le MDP exact reste parfait mais énumère tout le graphe."
            : "Le Megaminx est résolu de façon fiable par le Q-learning tabulaire jusqu'à 3 coups et par le MDP exact jusqu'à 4 coups ; au-delà, le graphe devient trop grand (limite du Q-learning tabulaire)."}
        </p>
      </section>
    </div>
  );
}