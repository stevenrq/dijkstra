"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";

import { buildAdjacencyMatrix, buildAdjacencyRows } from "@/lib/graph/adjacency";
import { formatMetricShort, metricLabel } from "@/lib/graph/format";
import { usePlanner } from "./planner-context";

type Vista = "lista" | "matriz";

/**
 * Las dos representaciones canónicas del grafo, derivadas del mismo modelo que
 * consume el algoritmo — no de una copia aparte que pudiera desincronizarse.
 */
export function DataPanel() {
  const { graph, metric, result, runState } = usePlanner();
  const [vista, setVista] = useState<Vista>("lista");

  const filas = useMemo(
    () => buildAdjacencyRows(graph, metric),
    [graph, metric],
  );
  const matriz = useMemo(
    () => buildAdjacencyMatrix(graph, metric),
    [graph, metric],
  );

  // Dos conjuntos: la lista resalta el arco concreto (con aristas paralelas,
  // solo la que usa la ruta), y la matriz, que tiene una celda por par, el par.
  const enRuta = useMemo(() => {
    const arcos = new Set<string>();
    const pares = new Set<string>();
    if (runState !== "ready" || !result) return { arcos, pares };
    result.pathEdges.forEach((edgeId, i) => {
      const par = `${result.path[i]}->${result.path[i + 1]}`;
      arcos.add(`${edgeId}:${par}`);
      pares.add(par);
    });
    return { arcos, pares };
  }, [result, runState]);

  if (graph.nodes.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-4 text-sm text-pretty">
        El grafo está vacío. Agrega puntos para ver su lista y su matriz de
        adyacencia.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(["lista", "matriz"] as Vista[]).map((opcion) => (
          <button
            key={opcion}
            type="button"
            aria-pressed={vista === opcion}
            onClick={() => setVista(opcion)}
            className={cn(
              "focus-visible:ring-ring/50 rounded-md px-2 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
              vista === opcion
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcion === "lista" ? "Lista de adyacencia" : "Matriz"}
          </button>
        ))}
      </div>

      <p className="text-muted-foreground text-xs text-pretty">
        Valores en {metricLabel(metric).toLowerCase()}. Un corredor de doble
        sentido aparece en las dos direcciones.
      </p>

      {vista === "lista" ? (
        <ul className="grid gap-2">
          {filas.map((fila) => (
            <li key={fila.id} className="rounded-md border px-2.5 py-2">
              <p className="text-sm font-medium">{fila.label}</p>
              {fila.arcs.length === 0 ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Sin conexiones salientes
                </p>
              ) : (
                <ul className="mt-1 grid gap-0.5">
                  {fila.arcs.map((arco) => (
                    <li
                      key={`${arco.edgeId}-${arco.to}`}
                      className={cn(
                        "flex items-baseline justify-between gap-2 text-xs",
                        enRuta.arcos.has(`${arco.edgeId}:${fila.id}->${arco.to}`) &&
                          "text-graph-path font-medium",
                      )}
                    >
                      <span className="truncate">→ {arco.label}</span>
                      <span className="tabular-nums">
                        {formatMetricShort(arco.weight, metric)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-card sticky left-0 z-10" />
                {matriz.labels.map((label, j) => (
                  <TableHead
                    key={matriz.ids[j]}
                    className="text-right text-xs whitespace-nowrap"
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matriz.ids.map((rowId, i) => (
                <TableRow key={rowId}>
                  <TableCell className="bg-card sticky left-0 z-10 text-xs font-medium whitespace-nowrap">
                    {matriz.labels[i]}
                  </TableCell>
                  {matriz.ids.map((colId, j) => {
                    const valor = matriz.cells[i][j];
                    return (
                      <TableCell
                        key={colId}
                        className={cn(
                          "text-right text-xs tabular-nums",
                          valor === null && "text-muted-foreground/50",
                          enRuta.pares.has(`${rowId}->${colId}`) &&
                            "bg-graph-path/15 text-graph-path font-semibold",
                        )}
                      >
                        {valor === null
                          ? "∞"
                          : formatMetricShort(valor, metric)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
