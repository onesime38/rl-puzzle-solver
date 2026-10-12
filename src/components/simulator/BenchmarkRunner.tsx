import { useEffect, useRef, useState } from "react";
import type { BenchmarkConfig, BenchmarkResult } from "../../agents";
import { benchmarkToCsv, benchmarkToJson, downloadText } from "../../lib/download";
import { getSolver } from "../../lib/solver";
import "./benchmark.css";

/** Conservative configuration so a live run stays responsive and bounded. */
const LIVE_CONFIG: BenchmarkConfig = {
  puzzles: ["cube", "megaminx"],
  algorithms: ["q", "dq", "mdp"],
  depths: [1, 2, 3, 4],
  maxDepth: 4,
  trials: 30,
  maxEpisodes: 200_000,
  epochSize: 400,
  testTrials: 60,
  maxStates: 400_000,
  seed: 12345,
  robustnessDepths: [1, 2, 3, 4, 5, 6, 7, 8],
};

export function BenchmarkRunner() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const instanceRef = useRef(result);
  instanceRef.current = result;

  useEffect(() => {
    const unsubscribe = getSolver().onResponse((response) => {
      if (response.type === "status") setLog(response.message);
    });
    return unsubscribe;
  }, []);

  async function run() {
    const client = getSolver();
    setRunning(true);
    setResult(null);
    setLog("Préparation…");
    const response = await client.request({ type: "benchmark", id: client.nextId(), config: LIVE_CONFIG });
    if (response.type === "benchmark-result") setResult(response.result);
    setRunning(false);
  }

  return (
    <section className="bench-runner">
      <h2>Relancer un benchmark dans le navigateur</h2>
      <p className="muted small">
        Exécute un petit benchmark (profondeurs 1 à 4, 30 essais par cellule) dans le Web Worker,
        puis permet de télécharger les résultats. La configuration complète du projet reste
        <code> npm run bench</code>.
      </p>
      <div className="bench-actions">
        <button type="button" className="btn btn--primary" onClick={run} disabled={running}>
          {running ? "Exécution…" : "Lancer le benchmark"}
        </button>
        {result ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => downloadText("benchmark-live.csv", benchmarkToCsv(result), "text/csv")}
            >
              Exporter en CSV
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadText("benchmark-live.json", benchmarkToJson(result), "application/json")}
            >
              Exporter en JSON
            </button>
          </>
        ) : null}
      </div>
      {running ? <p className="small mono">{log}</p> : null}
      {result ? (
        <p className="note note--ok">
          Benchmark terminé : {result.cells.length} cellules mesurées, {result.config.trials} essais
          par cellule.
        </p>
      ) : null}
    </section>
  );
}