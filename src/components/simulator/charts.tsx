import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { LearningPoint } from "../../agents";
import "./charts.css";

const GRID = "rgba(128,128,128,0.18)";
const TICK = "rgba(128,128,128,0.35)";
const LABEL = "rgba(128,128,128,0.95)";

function useChart(
  build: (width: number, host: HTMLElement) => uPlot | null,
  deps: unknown[],
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    chartRef.current = build(host.clientWidth || 320, host);
    const observer = new ResizeObserver(() => {
      chartRef.current?.setSize({
        width: host.clientWidth || 320,
        height: chartRef.current.height,
      });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return hostRef;
}

/** Learning curve: success rate (%) and curriculum level over episodes. */
export function LearningChart({ points }: { points: LearningPoint[] }) {
  const hostRef = useChart(
    (width, host) => {
      const xs = points.map((p) => p.episode);
      const rates = points.map((p) => p.rate * 100);
      const levels = points.map((p) => p.level);
      const data: uPlot.AlignedData = [xs, rates, levels];
      const opts: uPlot.Options = {
        width,
        height: 240,
        padding: [8, 14, 4, 4],
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: false }, y: { range: [0, 100] }, y2: { range: [0, 6] } },
        axes: [
          {
            label: "Épisodes",
            stroke: LABEL,
            font: "11px 'IBM Plex Mono', monospace",
            grid: { stroke: GRID },
            ticks: { stroke: TICK },
            values: (_u, splits) =>
              splits.map((v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))),
          },
          {
            scale: "y",
            label: "% réussite",
            stroke: LABEL,
            font: "11px 'IBM Plex Mono', monospace",
            grid: { stroke: GRID },
            ticks: { stroke: TICK },
          },
          {
            scale: "y2",
            side: 1,
            label: "Niveau",
            stroke: "#c98900",
            font: "11px 'IBM Plex Mono', monospace",
            grid: { show: false },
            ticks: { stroke: TICK },
            values: (_u, splits) => splits.map((v) => String(Math.round(v))),
          },
        ],
        series: [
          {},
          { label: "Réussite", scale: "y", stroke: "#0f9d76", width: 2.2 },
          { label: "Niveau", scale: "y2", stroke: "#c98900", width: 1.8, dash: [5, 4] },
        ],
      };
      return new uPlot(opts, data, host);
    },
    [points],
  );

  if (points.length === 0) {
    return (
      <p className="chart-empty muted small">
        La courbe d'apprentissage apparaîtra ici pendant l'entraînement.
      </p>
    );
  }
  return <div className="chart" ref={hostRef} />;
}

/** Value-iteration convergence: maximum change ΔV per iteration (log scale). */
export function DeltasChart({ deltas }: { deltas: number[] }) {
  const hostRef = useChart(
    (width, host) => {
      const xs = deltas.map((_, i) => i + 1);
      const ys = deltas.map((d) => Math.max(d, 1e-12));
      const data: uPlot.AlignedData = [xs, ys];
      const opts: uPlot.Options = {
        width,
        height: 220,
        padding: [8, 14, 4, 4],
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: false }, y: { distr: 3 } },
        axes: [
          {
            label: "Itérations",
            stroke: LABEL,
            font: "11px 'IBM Plex Mono', monospace",
            grid: { stroke: GRID },
            ticks: { stroke: TICK },
          },
          {
            scale: "y",
            label: "ΔV (échelle log.)",
            stroke: LABEL,
            font: "11px 'IBM Plex Mono', monospace",
            grid: { stroke: GRID },
            ticks: { stroke: TICK },
          },
        ],
        series: [{}, { label: "ΔV", stroke: "#4f66e8", width: 2, value: (_u, v) => (v == null ? "—" : v.toExponential(2)) }],
      };
      return new uPlot(opts, data, host);
    },
    [deltas],
  );

  if (deltas.length === 0) return null;
  return (
    <div className="chart-block">
      <h3>Convergence de l'itération de valeur</h3>
      <div className="chart" ref={hostRef} />
    </div>
  );
}