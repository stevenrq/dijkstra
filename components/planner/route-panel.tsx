"use client";

import { useId, useMemo } from "react";
import { ArrowUpDown, Ban, Info, Route, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";

import {
  formatCount,
  formatCurrency,
  formatDistance,
  formatDuration,
  formatMetric,
  metricLabel,
} from "@/lib/graph/format";
import { buildRouteLegs } from "@/lib/graph/route-sheet";
import { METRICS } from "@/lib/graph/types";
import { usePlanner, usePlannerDispatch, useRunAlgorithm } from "./planner-context";
import { MetricComparison } from "./metric-comparison";

export function RoutePanel() {
  const { graph, source, target, metric, result, runState, issues } = usePlanner();
  const dispatch = usePlannerDispatch();
  const run = useRunAlgorithm();
  // Este panel se monta dos veces (columna lateral y panel inferior), así que
  // los ids fijos se repetían y las etiquetas nombraban a la copia oculta.
  const origenId = useId();
  const destinoId = useId();
  const pistaId = useId();

  const items = useMemo(
    () => graph.nodes.map((node) => ({ value: node.id, label: node.label })),
    [graph.nodes],
  );

  const errores = issues.filter((issue) => issue.severity === "error");
  const avisos = issues.filter((issue) => issue.severity === "warning");
  const pista =
    graph.nodes.length === 0
      ? "Agrega puntos al grafo para poder calcular una ruta."
      : source === null
        ? "Escoge un punto de origen."
        : target === null
          ? "Escoge un punto de destino."
          : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field>
            <FieldLabel htmlFor={origenId}>Origen</FieldLabel>
            <Select
              items={items}
              value={source}
              onValueChange={(value) =>
                typeof value === "string" &&
                dispatch({ type: "SET_SOURCE", id: value })
              }
            >
              <SelectTrigger id={origenId} className="w-full">
                <SelectValue placeholder="Escoge un punto" />
              </SelectTrigger>
              <SelectContent>
                {graph.nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button
            variant="outline"
            size="icon"
            aria-label="Intercambiar origen y destino"
            onClick={() => dispatch({ type: "SWAP_ENDPOINTS" })}
          >
            <ArrowUpDown />
          </Button>
        </div>

        <Field>
          <FieldLabel htmlFor={destinoId}>Destino</FieldLabel>
          <Select
            items={items}
            value={target}
            onValueChange={(value) =>
              typeof value === "string" &&
              dispatch({ type: "SET_TARGET", id: value })
            }
          >
            <SelectTrigger id={destinoId} className="w-full">
              <SelectValue placeholder="Escoge un punto" />
            </SelectTrigger>
            <SelectContent>
              {graph.nodes.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <FieldSet className="gap-0">
          <FieldLegend variant="label">Minimizar</FieldLegend>
          <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
            {METRICS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() =>
                  // Con una ruta (o un error) a la vista, cambiar de métrica
                  // recalcula en el acto: borrar el resultado obligaba a
                  // volver a pulsar «Calcular» para ver la otra ruta.
                  runState === "idle"
                    ? dispatch({ type: "SET_METRIC", metric: m })
                    : metric !== m && run({ metric: m })
                }
                className={cn(
                  "focus-visible:ring-ring/50 rounded-md px-2 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                  metric === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {metricLabel(m)}
              </button>
            ))}
          </div>
        </FieldSet>

        <Button
          onClick={() => run()}
          disabled={pista !== null}
          aria-describedby={pista ? pistaId : undefined}
          size="lg"
        >
          <Route />
          Calcular ruta mínima
        </Button>
        {pista && (
          <p id={pistaId} className="text-muted-foreground -mt-1 text-xs">
            {pista}
          </p>
        )}
      </div>

      {runState === "error" && errores.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>No se puede ejecutar Dijkstra</AlertTitle>
          <AlertDescription>
            <ul className="grid gap-2">
              {errores.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {runState === "ready" && result && <ResultCard />}

      {runState === "ready" && avisos.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle>Para tener en cuenta</AlertTitle>
          <AlertDescription>
            <ul className="grid gap-2">
              {avisos.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {runState === "idle" && (
        <Empty className="border-border rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Route />
            </EmptyMedia>
            <EmptyTitle>Sin ruta calculada</EmptyTitle>
            <EmptyDescription>
              Escoge origen y destino, decide qué minimizar y calcula la ruta.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <MetricComparison />
    </div>
  );
}

/**
 * Hoja de ruta: la ruta se lee como un documento de flete, con el riel de
 * tramos y los totales acumulados, no como una tarjeta de panel genérica.
 */
function ResultCard() {
  const { graph, result, metric } = usePlanner();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const legs = useMemo(
    () => (result ? buildRouteLegs(graph, result) : []),
    [graph, result],
  );

  if (!result) return null;

  if (!result.reachable) {
    return (
      <Alert>
        <Ban />
        <AlertTitle>No existe ruta</AlertTitle>
        <AlertDescription>
          No hay ningún camino desde{" "}
          {nodeById.get(result.source)?.label ?? result.source} hasta{" "}
          {nodeById.get(result.target ?? "")?.label ?? result.target}. El destino
          está en otra componente del grafo: se alcanzaron{" "}
          {result.visitOrder.length} de {graph.nodes.length} puntos.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="bg-card rounded-lg border" aria-label="Hoja de ruta">
      <header className="border-b px-4 py-3">
        <p className="text-muted-foreground text-sm">
          Ruta de menor {metricLabel(metric).toLowerCase()}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums">
          {formatMetric(result.total, metric)}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatCount(result.path.length, "punto", "puntos")} ·{" "}
          {formatCount(result.pathEdges.length, "tramo", "tramos")}
        </p>
      </header>

      {/* Riel vertical de tramos. */}
      <ol className="grid gap-0 px-4 py-3">
        {result.path.map((nodeId, index) => {
          const node = nodeById.get(nodeId);
          const leg = index > 0 ? legs[index - 1] : null;
          const esUltimo = index === result.path.length - 1;

          return (
            <li key={nodeId} className="grid grid-cols-[18px_1fr] gap-x-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "mt-1 size-3 shrink-0 rounded-full border-2",
                    index === 0
                      ? "border-graph-source bg-graph-source"
                      : esUltimo
                        ? "border-graph-target bg-graph-target"
                        : "border-graph-path bg-card",
                  )}
                />
                {!esUltimo && (
                  <span className="bg-graph-path my-1 w-0.5 flex-1 rounded-full" />
                )}
              </div>

              <div className={cn("min-w-0", esUltimo ? "pb-0" : "pb-4")}>
                <p className="font-medium">{node?.label ?? nodeId}</p>
                {index === 0 && (
                  <p className="text-muted-foreground text-xs">Origen</p>
                )}
                {esUltimo && (
                  <p className="text-muted-foreground text-xs">Destino</p>
                )}

                {leg && (
                  <div className="text-muted-foreground mt-1.5 text-xs">
                    {leg.edge.label && <p className="truncate">{leg.edge.label}</p>}
                    <p className="tabular-nums">
                      {formatCurrency(leg.edge.weights.cost)} ·{" "}
                      {formatDistance(leg.edge.weights.distance)} ·{" "}
                      {formatDuration(leg.edge.weights.time)}
                    </p>
                    <p className="tabular-nums">
                      Acumulado: {formatMetric(leg.accumulated, metric)}
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="grid grid-cols-3 gap-2 border-t px-4 py-3">
        {METRICS.map((m) => (
          <div key={m}>
            <p className="text-muted-foreground text-xs">{metricLabel(m)}</p>
            <p
              className={cn(
                "text-sm tabular-nums",
                m === metric ? "text-foreground font-semibold" : "text-muted-foreground",
              )}
            >
              {formatMetric(result.totalsByMetric[m], m)}
            </p>
          </div>
        ))}
      </footer>
    </section>
  );
}
