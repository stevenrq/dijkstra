"use client";

import { useMemo } from "react";

import {
  formatCount,
  formatCurrency,
  formatDistance,
  formatDuration,
  formatMetric,
  metricLabel,
} from "@/lib/graph/format";
import { buildRouteLegs } from "@/lib/graph/route-sheet";
import { hasBlockingErrors } from "@/lib/graph/validation";
import { METRICS } from "@/lib/graph/types";
import { usePlanner } from "./planner-context";

/**
 * Hoja de ruta para imprimir.
 *
 * Existe aparte de la tarjeta de la pantalla porque esa depende del ancho
 * (vive en una columna que se oculta por debajo de 1024 px) y de la pestaña
 * que esté abierta. Esta se lee del estado directamente, así que lo impreso
 * siempre trae la ruta calculada, se imprima desde donde se imprima.
 */
export function PrintReport() {
  const { graph, result, comparison, metric, runState } = usePlanner();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );
  const legs = useMemo(
    () => (result ? buildRouteLegs(graph, result) : []),
    [graph, result],
  );

  if (runState !== "ready" || !result || !result.reachable) return null;

  const nombre = (id: string) => nodeById.get(id) ?? id;

  return (
    <section className="informe-impresion hidden text-sm text-black print:block">
      <h2 className="mt-4 text-lg font-semibold">Hoja de ruta</h2>
      <p className="mt-1">
        Ruta de menor {metricLabel(metric).toLowerCase()}:{" "}
        <strong>{formatMetric(result.total, metric)}</strong> ·{" "}
        {formatCount(result.path.length, "punto", "puntos")} ·{" "}
        {formatCount(result.pathEdges.length, "tramo", "tramos")}
      </p>
      <p className="mt-1">{result.path.map(nombre).join(" → ")}</p>

      {legs.length > 0 && (
        <table className="mt-3 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-2 font-semibold">Tramo</th>
              <th className="py-1 pr-2 font-semibold">Corredor</th>
              <th className="py-1 pr-2 text-right font-semibold">Costo</th>
              <th className="py-1 pr-2 text-right font-semibold">Distancia</th>
              <th className="py-1 pr-2 text-right font-semibold">Tiempo</th>
              <th className="py-1 text-right font-semibold">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={leg.edge.id} className="border-b border-neutral-300 break-inside-avoid">
                <td className="py-1 pr-2">
                  {nombre(leg.from)} → {nombre(leg.to)}
                </td>
                <td className="py-1 pr-2">{leg.edge.label ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {formatCurrency(leg.edge.weights.cost)}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {formatDistance(leg.edge.weights.distance)}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {formatDuration(leg.edge.weights.time)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatMetric(leg.accumulated, metric)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-1 pr-2 font-semibold" colSpan={2}>
                Total
              </td>
              <td className="pt-1 pr-2 text-right font-semibold tabular-nums">
                {formatCurrency(result.totalsByMetric.cost)}
              </td>
              <td className="pt-1 pr-2 text-right font-semibold tabular-nums">
                {formatDistance(result.totalsByMetric.distance)}
              </td>
              <td className="pt-1 pr-2 text-right font-semibold tabular-nums">
                {formatDuration(result.totalsByMetric.time)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {comparison && (
        <>
          <h2 className="mt-4 text-base font-semibold">Las tres rutas óptimas</h2>
          <ul className="mt-1 grid gap-1">
            {METRICS.map((m) => {
              const r = comparison[m];
              if (hasBlockingErrors(r.issues)) {
                return (
                  <li key={m}>
                    Menor {metricLabel(m).toLowerCase()}: no aplica, hay pesos
                    negativos en {metricLabel(m).toLowerCase()}.
                  </li>
                );
              }
              if (!r.reachable) return null;
              return (
                <li key={m}>
                  Menor {metricLabel(m).toLowerCase()}:{" "}
                  <strong>{formatMetric(r.totalsByMetric[m], m)}</strong> —{" "}
                  {r.path.map(nombre).join(" → ")}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
