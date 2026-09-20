"use client";

import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "cn";

import { formatMetric, metricLabel } from "@/lib/graph/format";
import { usePlanner } from "./planner-context";

/**
 * El tableau clásico de Dijkstra: una fila por nodo con su distancia, su
 * predecesor y su situación en la cola. Es la tabla que se llena a mano en
 * clase, y aquí se llena sola a medida que avanza la animación.
 */
export function DistanceTable() {
  const { graph, result, stepIndex, metric, runState, source } = usePlanner();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );

  if (runState !== "ready" || !result || result.steps.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Tabla vacía</EmptyTitle>
          <EmptyDescription>
            Calcula una ruta para ver cómo se llena la tabla de distancias.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const step = result.steps[stepIndex];
  const settled = new Set(step.settled);
  const enCola = new Set(
    step.queue.filter((entry) => !entry.stale).map((entry) => entry.node),
  );
  const anterior = stepIndex > 0 ? result.steps[stepIndex - 1] : null;

  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader className="bg-card sticky top-0 z-10">
          <TableRow>
            <TableHead>Punto</TableHead>
            <TableHead className="text-right">
              d(v) en {metricLabel(metric).toLowerCase()}
            </TableHead>
            <TableHead>Predecesor</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {graph.nodes.map((node) => {
            const distancia = step.distances[node.id] ?? Infinity;
            const previo = step.previous[node.id];
            const esActual = step.currentNode === node.id;
            const cambio =
              anterior && anterior.distances[node.id] !== distancia;

            return (
              <TableRow
                key={node.id}
                className={cn(
                  esActual && "bg-graph-current/10",
                  node.id === source && "font-medium",
                )}
              >
                <TableCell className="whitespace-nowrap">
                  {node.label}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums transition-colors",
                    cambio && "text-graph-improved font-semibold",
                    !Number.isFinite(distancia) && "text-muted-foreground",
                  )}
                >
                  {Number.isFinite(distancia)
                    ? formatMetric(distancia, metric)
                    : "∞"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {previo ? (nodeById.get(previo) ?? previo) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <EstadoCelda
                    settled={settled.has(node.id)}
                    enCola={enCola.has(node.id)}
                    esActual={esActual}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EstadoCelda({
  settled,
  enCola,
  esActual,
}: {
  settled: boolean;
  enCola: boolean;
  esActual: boolean;
}) {
  if (esActual)
    return (
      <span className="text-graph-current inline-flex items-center gap-1.5 text-xs font-medium">
        <span className="bg-graph-current size-2 rounded-full" />
        Procesando
      </span>
    );
  if (settled)
    return (
      <span className="text-graph-settled inline-flex items-center gap-1.5 text-xs">
        <span className="bg-graph-settled size-2 rounded-full" />
        Consolidado
      </span>
    );
  if (enCola)
    return (
      <span className="text-graph-frontier inline-flex items-center gap-1.5 text-xs">
        <span className="border-graph-frontier size-2 rounded-full border-2" />
        En la cola
      </span>
    );
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className="border-graph-pending size-2 rounded-full border-2" />
      Sin visitar
    </span>
  );
}
