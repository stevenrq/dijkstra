"use client";

import { useMemo, useRef } from "react";
import {
  Download,
  Eraser,
  GitBranch,
  Printer,
  Redo2,
  RotateCcw,
  Undo2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";

import {
  downloadGraph,
  GraphParseError,
  parseGraph,
} from "@/lib/graph/serialization";
import { SCENARIOS } from "@/lib/scenarios";
import { usePlanner, usePlannerDispatch } from "./planner-context";
import { isScenarioPristine } from "./planner-reducer";
import { ThemeToggle } from "./theme-toggle";

export function Toolbar() {
  const { graph, scenarioId, source, target, history, showTree } = usePlanner();
  const dispatch = usePlannerDispatch();
  const fileRef = useRef<HTMLInputElement>(null);

  const escenarios = [
    ...SCENARIOS.map((scenario) => ({
      value: scenario.id,
      label: scenario.name,
    })),
    ...(scenarioId === "importado"
      ? [{ value: "importado", label: "Grafo importado" }]
      : []),
  ];

  const nombreEscenario = SCENARIOS.find((s) => s.id === scenarioId)?.name;
  const intacto = useMemo(
    () => isScenarioPristine({ graph, source, target, scenarioId }),
    [graph, source, target, scenarioId],
  );

  const importar = async (file: File) => {
    try {
      const texto = await file.text();
      dispatch({ type: "IMPORT_GRAPH", graph: parseGraph(texto) });
      toast.add({
        title: "Grafo importado",
        description: `Se cargó ${file.name}.`,
      });
    } catch (error) {
      toast.add({
        title: "No se pudo importar el archivo",
        description:
          error instanceof GraphParseError
            ? error.message
            : "El archivo no tiene el formato esperado.",
        type: "error",
      });
    }
  };

  return (
    <header className="no-imprimir flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate font-semibold tracking-tight">RutaÓptima</h1>
        <p className="text-muted-foreground hidden truncate text-sm sm:block">
          Dijkstra sobre la red de distribución
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Select
          items={escenarios}
          value={scenarioId}
          onValueChange={(value) =>
            typeof value === "string" &&
            value !== "importado" &&
            dispatch({ type: "LOAD_SCENARIO", scenarioId: value })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Escenario"
            className="w-32 sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {escenarios.map((escenario) => (
              <SelectItem key={escenario.value} value={escenario.value}>
                {escenario.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Restablecer el escenario a su estado inicial"
                disabled={scenarioId === "importado" || intacto}
                onClick={() => {
                  dispatch({ type: "RESET_SCENARIO" });
                  toast.add({
                    title: "Escenario restablecido",
                    description: `${nombreEscenario ?? "El escenario"} volvió a su estado inicial. Puedes deshacerlo con el botón de deshacer.`,
                  });
                }}
              >
                <RotateCcw />
              </Button>
            }
          />
          <TooltipContent>Restablecer escenario</TooltipContent>
        </Tooltip>

        <ButtonGroup className="hidden sm:flex">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Deshacer"
                  disabled={history.past.length === 0}
                  onClick={() => dispatch({ type: "UNDO" })}
                >
                  <Undo2 />
                </Button>
              }
            />
            <TooltipContent>Deshacer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rehacer"
                  disabled={history.future.length === 0}
                  onClick={() => dispatch({ type: "REDO" })}
                >
                  <Redo2 />
                </Button>
              }
            />
            <TooltipContent>Rehacer</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={showTree ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Mostrar el árbol de caminos mínimos"
                  aria-pressed={showTree}
                  onClick={() => dispatch({ type: "TOGGLE_TREE" })}
                >
                  <GitBranch />
                </Button>
              }
            />
            <TooltipContent className="max-w-56">
              Resalta el árbol de caminos mínimos completo, no solo la ruta al
              destino
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Exportar el grafo como JSON"
                  onClick={() => {
                    downloadGraph(graph);
                    toast.add({ title: "Grafo exportado" });
                  }}
                >
                  <Download />
                </Button>
              }
            />
            <TooltipContent>Exportar JSON</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Importar un grafo desde JSON"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload />
                </Button>
              }
            />
            <TooltipContent>Importar JSON</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                  aria-label="Imprimir el informe"
                  onClick={() => window.print()}
                >
                  <Printer />
                </Button>
              }
            />
            <TooltipContent>Imprimir informe</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                  aria-label="Vaciar el grafo"
                  onClick={() => {
                    dispatch({ type: "CLEAR_GRAPH" });
                    toast.add({
                      title: "Grafo vaciado",
                      description: "Puedes deshacerlo con el botón de deshacer.",
                    });
                  }}
                >
                  <Eraser />
                </Button>
              }
            />
            <TooltipContent>Vaciar el grafo</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <ThemeToggle />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importar(file);
          event.target.value = "";
        }}
      />
    </header>
  );
}
