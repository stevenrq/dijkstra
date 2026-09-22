"use client";

import { useId, useMemo } from "react";
import { cn } from "cn";

import {
  formatMetric,
  formatPercent,
  metricLabel,
  percentDelta,
} from "@/lib/graph/format";
import { hasBlockingErrors } from "@/lib/graph/validation";
import { METRICS } from "@/lib/graph/types";
import { usePlanner, useRunAlgorithm } from "./planner-context";

/**
 * Las tres rutas óptimas, una por métrica, sobre el mismo par origen-destino.
 *
 * Es el argumento central de la actividad: en una red real la ruta más barata
 * casi nunca es la más corta ni la más rápida, y aquí se ve de un vistazo.
 * Cada fila es un botón: tocarla muestra esa ruta en el mapa y en la hoja.
 */
export function MetricComparison() {
  const { comparison, metric, graph } = usePlanner();
  const run = useRunAlgorithm();
  const tituloId = useId();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );

  if (!comparison) return null;

  // Una métrica con pesos negativos no tiene ruta que comparar; si se contara,
  // su ruta vacía haría creer que las tres métricas llevan por caminos distintos.
  const validas = METRICS.filter(
    (m) => comparison[m].reachable && !hasBlockingErrors(comparison[m].issues),
  );
  const distintas = new Set(validas.map((m) => comparison[m].path.join(">"))).size;
  const resumen =
    validas.length < 2
      ? "Solo una métrica tiene ruta calculable en este par."
      : distintas === 1
        ? validas.length === 3
          ? "En este par, las tres métricas coinciden en la misma ruta."
          : "En este par, las métricas calculables coinciden en la misma ruta."
        : distintas === validas.length
          ? validas.length === 3
            ? "Cada métrica lleva por un camino distinto: la ruta más barata no es la más corta ni la más rápida."
            : "Las métricas calculables llevan por caminos distintos."
          : "Dos de las métricas coinciden en la misma ruta y la otra lleva por un camino distinto.";

  return (
    <section className="bg-card rounded-lg border" aria-labelledby={tituloId}>
      <header className="border-b px-4 py-3">
        <h2 id={tituloId} className="font-medium">
          Las tres rutas óptimas
        </h2>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">{resumen}</p>
      </header>

      <div className="divide-y">
        {METRICS.map((m) => {
          const resultado = comparison[m];
          const activa = m === metric;

          if (hasBlockingErrors(resultado.issues)) {
            return (
              <div key={m} className="px-4 py-3">
                <p className="text-sm font-medium">
                  Menor {metricLabel(m).toLowerCase()}
                </p>
                <p className="text-muted-foreground mt-1 text-xs text-pretty">
                  No aplica: hay pesos negativos en {metricLabel(m).toLowerCase()},
                  y Dijkstra exige pesos no negativos.
                </p>
              </div>
            );
          }
          if (!resultado.reachable) return null;

          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (!activa) run({ metric: m });
              }}
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
                  {formatMetric(resultado.totalsByMetric[m], m)}
                </span>
              </div>

              <p className="text-muted-foreground mt-1 text-xs text-pretty">
                {resultado.path.map((id) => nodeById.get(id) ?? id).join(" → ")}
              </p>

              <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
                {METRICS.filter((otra) => otra !== m).map((otra) => {
                  const mejor = comparison[otra];
                  if (!mejor.reachable || hasBlockingErrors(mejor.issues)) return null;
                  const delta = percentDelta(
                    resultado.totalsByMetric[otra],
                    mejor.totalsByMetric[otra],
                  );
                  if (delta === null || Math.abs(delta) < 0.05) return null;
                  return (
                    <span key={otra}>
                      {metricLabel(otra).toLowerCase()} +{formatPercent(delta)}
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
