"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Slider } from "@/components/ui/slider";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

import type { StepKind } from "@/lib/graph/dijkstra";
import { usePlanner, usePlannerDispatch } from "./planner-context";
import type { Speed } from "./planner-reducer";

const VELOCIDADES: Speed[] = [0.5, 1, 2, 4];

const ETIQUETA_PASO: Record<StepKind, string> = {
  init: "Inicialización",
  extract: "Extracción del mínimo",
  "skip-stale": "Entrada obsoleta",
  relax: "Relajación de arista",
  "dead-end": "Sin salida",
  "target-reached": "Destino consolidado",
  done: "Fin",
};

const COLOR_PASO: Record<StepKind, string> = {
  init: "bg-muted text-muted-foreground",
  extract: "bg-graph-current/15 text-graph-current",
  "skip-stale": "bg-muted text-muted-foreground",
  relax: "bg-graph-frontier/15 text-graph-frontier",
  "dead-end": "bg-destructive/10 text-destructive",
  "target-reached": "bg-graph-path/20 text-graph-path",
  done: "bg-graph-source/15 text-graph-source",
};

export function StepsPanel() {
  const { result, stepIndex, isPlaying, speed, runState } = usePlanner();
  const dispatch = usePlannerDispatch();

  if (runState !== "ready" || !result || result.steps.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Sin ejecución</EmptyTitle>
          <EmptyDescription>
            Calcula una ruta para recorrer el algoritmo paso a paso.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const total = result.steps.length;
  const step = result.steps[stepIndex];
  const enElFinal = stepIndex >= total - 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Primer paso"
                  disabled={stepIndex === 0}
                  onClick={() => dispatch({ type: "FIRST_STEP" })}
                >
                  <ChevronFirst />
                </Button>
              }
            />
            <TooltipContent>Primer paso</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Paso anterior"
                  disabled={stepIndex === 0}
                  onClick={() => dispatch({ type: "STEP_PREV" })}
                >
                  <ChevronLeft />
                </Button>
              }
            />
            <TooltipContent>Paso anterior</TooltipContent>
          </Tooltip>
          <Button
            variant="default"
            size="icon-sm"
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            onClick={() => dispatch({ type: "TOGGLE_PLAY" })}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Paso siguiente"
                  disabled={enElFinal}
                  onClick={() => dispatch({ type: "STEP_NEXT" })}
                >
                  <ChevronRight />
                </Button>
              }
            />
            <TooltipContent>Paso siguiente</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Último paso"
                  disabled={enElFinal}
                  onClick={() => dispatch({ type: "LAST_STEP" })}
                >
                  <ChevronLast />
                </Button>
              }
            />
            <TooltipContent>Último paso</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <div className="ml-auto flex items-center gap-1">
          {VELOCIDADES.map((velocidad) => (
            <button
              key={velocidad}
              type="button"
              aria-pressed={speed === velocidad}
              aria-label={`Velocidad ${velocidad}x`}
              onClick={() => dispatch({ type: "SET_SPEED", speed: velocidad })}
              className={cn(
                "focus-visible:ring-ring/50 rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors outline-none focus-visible:ring-3",
                speed === velocidad
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {velocidad}×
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              COLOR_PASO[step.kind],
            )}
          >
            {ETIQUETA_PASO[step.kind]}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            Paso {stepIndex + 1} de {total} · iteración {step.iteration}
          </span>
        </div>

        <Slider
          value={stepIndex}
          min={0}
          max={total - 1}
          step={1}
          aria-label="Avance de la ejecución"
          onValueChange={(value) =>
            dispatch({
              type: "SEEK",
              index: Array.isArray(value) ? value[0] : value,
            })
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p aria-live="polite" className="text-sm text-pretty">
          {step.explanation}
        </p>

        {step.formula && (
          <p className="bg-muted mt-2.5 rounded-md px-2.5 py-2 font-mono text-xs break-words">
            {step.formula}
          </p>
        )}
      </div>
    </div>
  );
}
