"use client";

import { useMemo } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "cn";

import { formatMetric } from "@/lib/graph/format";
import { usePlanner } from "./planner-context";

/**
 * Contenido del montículo en el paso actual.
 *
 * Las entradas obsoletas se muestran tachadas en vez de ocultarse: son la
 * consecuencia visible de resolver `decrease-key` con borrado perezoso, y
 * verlas aparecer y descartarse explica la estrategia mejor que cualquier nota.
 */
export function QueueView() {
  const { result, stepIndex, metric, runState, graph } = usePlanner();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );

  if (runState !== "ready" || !result || result.steps.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Cola vacía</EmptyTitle>
          <EmptyDescription>
            Calcula una ruta para ver la cola de prioridad en cada iteración.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const step = result.steps[stepIndex];
  const obsoletas = step.queue.filter((entry) => entry.stale).length;

  return (
    <div className="h-full overflow-auto px-3 py-3">
      <div className="mb-3">
        <p className="text-sm font-medium">
          Cola de prioridad · {step.queue.length}{" "}
          {step.queue.length === 1 ? "entrada" : "entradas"}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
          {step.queue.length === 0
            ? "La cola está vacía: no queda ningún punto por procesar."
            : obsoletas > 0
              ? `${obsoletas} ${obsoletas === 1 ? "entrada obsoleta" : "entradas obsoletas"}: quedaron dentro al mejorar la distancia de ese punto y se descartan al extraerlas.`
              : "El montículo mantiene arriba el punto de menor distancia."}
        </p>
      </div>

      <ol className="grid gap-1">
        {step.queue.map((entry, index) => (
          <li
            key={`${entry.node}-${entry.priority}-${index}`}
            className={cn(
              "flex items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm",
              entry.stale
                ? "border-dashed opacity-55"
                : index === 0
                  ? "border-graph-frontier bg-graph-frontier/10"
                  : "border-border",
            )}
          >
            <span className={cn("truncate", entry.stale && "line-through")}>
              {nodeById.get(entry.node) ?? entry.node}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {entry.stale && (
                <span className="text-muted-foreground text-xs">obsoleta</span>
              )}
              {!entry.stale && index === 0 && (
                <span className="text-graph-frontier text-xs">próxima</span>
              )}
              <span className="tabular-nums">
                {formatMetric(entry.priority, metric)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
