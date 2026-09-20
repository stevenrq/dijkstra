"use client";

import { useMemo, useState } from "react";
import { CircleDot, Flag, Plus, Trash2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

import { METRIC_LABELS, METRIC_UNITS, METRICS, type Metric } from "@/lib/graph/types";
import { usePlanner, usePlannerDispatch } from "./planner-context";

/**
 * Editor por formulario.
 *
 * Duplica todo lo que se puede hacer en el lienzo: crear, renombrar, conectar,
 * editar pesos y borrar. No es solo la vía accesible con teclado y lector de
 * pantalla — también es más rápida para cargar datos a mano.
 */
export function EditorPanel() {
  const { graph, source, target, selection } = usePlanner();
  const dispatch = usePlannerDispatch();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );

  return (
    <Accordion defaultValue={["puntos", "corredores"]} className="grid gap-2">
      <AccordionItem value="puntos">
        <AccordionTrigger>
          Puntos
          <span className="text-muted-foreground ml-auto mr-2 text-xs tabular-nums">
            {graph.nodes.length}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-1.5">
            {graph.nodes.length === 0 && (
              <p className="text-muted-foreground py-2 text-sm text-pretty">
                Todavía no hay puntos. Agrega el primero con el botón de abajo o
                haciendo clic en el lienzo con la herramienta de agregar.
              </p>
            )}

            {graph.nodes.map((node) => (
              <div
                key={node.id}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-1.5 rounded-md border px-1.5 py-1.5",
                  selection?.kind === "node" &&
                    selection.id === node.id &&
                    "border-ring bg-muted/50",
                )}
              >
                <Input
                  value={node.label}
                  aria-label={`Nombre de ${node.label}`}
                  className="h-7 border-transparent bg-transparent px-1.5 text-sm shadow-none"
                  onFocus={() =>
                    dispatch({
                      type: "SELECT",
                      selection: { kind: "node", id: node.id },
                    })
                  }
                  onChange={(event) =>
                    dispatch({
                      type: "UPDATE_NODE",
                      id: node.id,
                      changes: { label: event.target.value },
                    })
                  }
                />
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant={source === node.id ? "secondary" : "ghost"}
                          size="icon-xs"
                          aria-label={`Usar ${node.label} como origen`}
                          aria-pressed={source === node.id}
                          onClick={() =>
                            dispatch({ type: "SET_SOURCE", id: node.id })
                          }
                        >
                          <CircleDot />
                        </Button>
                      }
                    />
                    <TooltipContent>Usar como origen</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant={target === node.id ? "secondary" : "ghost"}
                          size="icon-xs"
                          aria-label={`Usar ${node.label} como destino`}
                          aria-pressed={target === node.id}
                          onClick={() =>
                            dispatch({ type: "SET_TARGET", id: node.id })
                          }
                        >
                          <Flag />
                        </Button>
                      }
                    />
                    <TooltipContent>Usar como destino</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Eliminar ${node.label}`}
                          onClick={() =>
                            dispatch({ type: "DELETE_NODE", id: node.id })
                          }
                        >
                          <Trash2 />
                        </Button>
                      }
                    />
                    <TooltipContent>Eliminar punto y sus corredores</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="mt-1 justify-start"
              onClick={() =>
                dispatch({
                  type: "ADD_NODE",
                  x: 500 + Math.round((Math.random() - 0.5) * 320),
                  y: 700 + Math.round((Math.random() - 0.5) * 320),
                })
              }
            >
              <Plus />
              Agregar punto
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="corredores">
        <AccordionTrigger>
          Corredores
          <span className="text-muted-foreground ml-auto mr-2 text-xs tabular-nums">
            {graph.edges.length}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-2">
            {graph.edges.length === 0 && (
              <p className="text-muted-foreground py-2 text-sm text-pretty">
                No hay corredores. Usa la herramienta de conectar en el lienzo:
                haz clic en un punto y luego en otro.
              </p>
            )}

            {graph.edges.map((edge) => (
              <div
                key={edge.id}
                className={cn(
                  "grid gap-2 rounded-md border p-2",
                  selection?.kind === "edge" &&
                    selection.id === edge.id &&
                    "border-ring bg-muted/50",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm">
                    {nodeById.get(edge.from) ?? edge.from}{" "}
                    <span className="text-muted-foreground">
                      {edge.directed ? "→" : "↔"}
                    </span>{" "}
                    {nodeById.get(edge.to) ?? edge.to}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Eliminar corredor"
                    onClick={() => dispatch({ type: "DELETE_EDGE", id: edge.id })}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {edge.label && (
                  <p className="text-muted-foreground -mt-1 truncate text-xs">
                    {edge.label}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-1.5">
                  {METRICS.map((m) => (
                    <PesoInput key={m} edgeId={edge.id} metric={m} value={edge.weights[m]} />
                  ))}
                </div>

                <label className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Switch
                    size="sm"
                    checked={edge.directed}
                    onCheckedChange={(checked) =>
                      dispatch({
                        type: "UPDATE_EDGE",
                        id: edge.id,
                        changes: { directed: checked },
                      })
                    }
                  />
                  Sentido único
                </label>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * Campo de peso.
 *
 * Es `type="text"` con `inputMode="decimal"` y no `type="number"` a propósito:
 * en un input numérico controlado, el navegador reporta valor vacío mientras
 * el contenido es un número incompleto, así que al teclear el signo menos el
 * valor se perdía y era imposible escribir un peso negativo. Y escribir un
 * peso negativo tiene que ser posible: es lo que demuestra en vivo que
 * Dijkstra exige pesos no negativos.
 */
function PesoInput({
  edgeId,
  metric,
  value,
}: {
  edgeId: string;
  metric: Metric;
  value: number;
}) {
  const dispatch = usePlannerDispatch();
  const { graph } = usePlanner();
  const [text, setText] = useState(() => String(value));
  const [ultimoValor, setUltimoValor] = useState(value);

  // Resincronización cuando el valor cambia desde fuera (deshacer, otro
  // escenario). Se ajusta durante el render y no en un efecto: así React
  // reintenta el render de inmediato en vez de pintar el valor viejo primero.
  if (value !== ultimoValor) {
    setUltimoValor(value);
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
  }

  const parsed = Number(text.replace(",", "."));
  const invalido = text.trim() === "" || !Number.isFinite(parsed);

  return (
    <label className="grid gap-0.5">
      <span className="text-muted-foreground text-[11px]">
        {METRIC_LABELS[metric]} ({METRIC_UNITS[metric]})
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        className="h-7 px-1.5 text-sm tabular-nums"
        aria-invalid={invalido || parsed < 0}
        aria-label={`${METRIC_LABELS[metric]} en ${METRIC_UNITS[metric]}`}
        onChange={(event) => {
          const siguiente = event.target.value;
          setText(siguiente);
          const numero = Number(siguiente.replace(",", "."));
          // Estados intermedios como "-" o "" se dejan pasar sin despachar:
          // el grafo solo cambia cuando lo escrito ya es un número.
          if (siguiente.trim() === "" || !Number.isFinite(numero)) return;
          const edge = graph.edges.find((candidate) => candidate.id === edgeId);
          if (!edge || edge.weights[metric] === numero) return;
          dispatch({
            type: "UPDATE_EDGE",
            id: edgeId,
            changes: { weights: { ...edge.weights, [metric]: numero } },
          });
        }}
      />
    </label>
  );
}
