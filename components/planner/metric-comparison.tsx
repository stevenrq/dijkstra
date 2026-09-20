"use client";

import { useMemo } from "react";
import { cn } from "cn";

import {
  formatCurrency,
  formatDistance,
  formatDuration,
  metricLabel,
  percentDelta,
} from "@/lib/graph/format";
import { METRICS, type Metric } from "@/lib/graph/types";
import { usePlanner, usePlannerDispatch } from "./planner-context";

/**
 * Las tres rutas óptimas, una por métrica, sobre el mismo par origen-destino.
 *
 * Es el argumento central de la actividad: en una red real la ruta más barata
 * casi nunca es la más corta ni la más rápida, y aquí se ve de un vistazo.
 */
export function MetricComparison() {
  const { comparison, metric, graph } = usePlanner();
  const dispatch = usePlannerDispatch();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );

  if (!comparison) return null;

  const rutas = METRICS.map((m) => comparison[m].path.join(">"));
  const todasIguales = new Set(rutas).size === 1;

  return (
    <section className="bg-card rounded-lg border" aria-labelledby="comparativa">
      <header className="border-b px-4 py-3">
        <h3 id="comparativa" className="font-medium">
          Las tres rutas óptimas
        </h3>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">
          {todasIguales
            ? "En este par, las tres métricas coinciden en la misma ruta."
            : "Cada métrica lleva por un camino distinto. Ahorrar dinero cuesta tiempo, y el trayecto más corto no es el más barato."}
        </p>
      </header>

      <div className="divide-y">
        {METRICS.map((m) => {
          const resultado = comparison[m];
          const activa = m === metric;
          if (!resultado.reachable) return null;

          return (
            <button
              key={m}
              type="button"
              onClick={() => dispatch({ type: "SET_METRIC", metric: m })}
              aria-pressed={activa}
              className={cn(
                "hover:bg-muted/60 focus-visible:ring-ring/50 block w-full px-4 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset",
                activa && "bg-muted/40",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-sm",
                    activa ? "text-foreground font-semibold" : "font-medium",
                  )}
                >
                  Menor {metricLabel(m).toLowerCase()}
                </span>
                <span className="text-sm tabular-nums">
                  {valorPrincipal(resultado.totalsByMetric, m)}
                </span>
              </div>

              <p className="text-muted-foreground mt-1 text-xs text-pretty">
                {resultado.path.map((id) => nodeById.get(id) ?? id).join(" → ")}
              </p>

              <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
                {METRICS.filter((otra) => otra !== m).map((otra) => {
                  const delta = percentDelta(
                    resultado.totalsByMetric[otra],
                    comparison[otra].totalsByMetric[otra],
                  );
                  if (delta === null || Math.abs(delta) < 0.05) return null;
                  return (
                    <span key={otra}>
                      {metricLabel(otra).toLowerCase()} +{delta.toFixed(1)} %
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function valorPrincipal(
  totals: { cost: number; distance: number; time: number },
  metric: Metric,
): string {
  switch (metric) {
    case "cost":
      return formatCurrency(totals.cost);
    case "distance":
      return formatDistance(totals.distance);
    case "time":
      return formatDuration(totals.time);
  }
}
