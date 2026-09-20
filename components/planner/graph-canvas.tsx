"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Maximize2,
  MousePointer2,
  Minus,
  Plus,
  Spline,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "cn";

import {
  edgeGeometry,
  edgeOffsets,
  graphBounds,
  nearestNodeInDirection,
  NODE_RADIUS,
} from "@/lib/graph/geometry";
import { formatMetricShort } from "@/lib/graph/format";
import { NODE_KIND_LABELS } from "@/lib/graph/types";

import { CanvasDefs } from "./canvas-defs";
import { EdgeDialog } from "./edge-dialog";
import { GraphEdgeView } from "./graph-edge";
import { GraphNodeView } from "./graph-node";
import { usePlanner, usePlannerDispatch, useGraphVisuals } from "./planner-context";
import type { Tool } from "./planner-reducer";
import { useSvgViewport } from "@/hooks/use-svg-viewport";

const HERRAMIENTAS: {
  tool: Tool;
  icon: typeof MousePointer2;
  label: string;
  shortcut: string;
}[] = [
  { tool: "select", icon: MousePointer2, label: "Seleccionar y mover", shortcut: "V" },
  { tool: "add-node", icon: Plus, label: "Agregar punto", shortcut: "N" },
  { tool: "connect", icon: Spline, label: "Conectar dos puntos", shortcut: "E" },
  { tool: "delete", icon: Trash2, label: "Eliminar", shortcut: "D" },
];

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  fromX: number;
  fromY: number;
  moved: boolean;
}

export function GraphCanvas() {
  const state = usePlanner();
  const dispatch = usePlannerDispatch();
  const visuals = useGraphVisuals();

  const { graph, metric, tool, selection, connectingFrom, result, runState } = state;

  const viewport = useSvgViewport({ x: 0, y: 0, width: 1060, height: 1460 });
  const {
    svgRef,
    containerRef,
    unitsPerPx,
    viewBox,
    toWorld,
    zoomBy,
    beginPan,
    movePan,
    endPan,
    fitTo,
  } = viewport;

  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [connectPreview, setConnectPreview] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [pendingEdge, setPendingEdge] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [aviso, setAviso] = useState("");

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  /**
   * Mitad de la separación más corta entre dos puntos del grafo. Es el tope
   * del área táctil: más allá, las áreas de dos vecinos se pisarían.
   */
  const maxHitRadius = useMemo(() => {
    let minima = Infinity;
    const { nodes } = graph;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d > 0) minima = Math.min(minima, d);
      }
    }
    return Number.isFinite(minima) ? minima * 0.48 : NODE_RADIUS * 3;
  }, [graph]);

  /** Geometría de cada arista, recalculada solo cuando cambia el grafo. */
  const geometries = useMemo(() => {
    const offsets = edgeOffsets(graph.edges);
    return graph.edges.map((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return null;
      return {
        edge,
        geometry: edgeGeometry(from, to, offsets.get(edge.id) ?? 0, {
          endGap: edge.directed ? NODE_RADIUS + 13 : NODE_RADIUS + 3,
        }),
        fromLabel: from.label,
        toLabel: to.label,
      };
    });
  }, [graph.edges, nodeById]);

  /* -------------------- Encuadre inicial -------------------- */

  /**
   * El encuadre se hace cuando el <svg> ya tiene tamaño medible: en el primer
   * efecto de montaje `clientWidth` todavía puede ser 0 y la proporción
   * saldría mal, dejando el grafo minúsculo.
   */
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || graph.nodes.length === 0) return;
    if (fittedFor.current === graph.id) return;

    const intentar = () => {
      if (svg.clientWidth === 0 || svg.clientHeight === 0) return false;
      fittedFor.current = graph.id;
      fitTo(graphBounds(graph));
      return true;
    };

    if (intentar()) return;
    const observer = new ResizeObserver(() => {
      if (intentar()) observer.disconnect();
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [graph, fitTo, svgRef]);

  const ajustarVista = useCallback(() => {
    fitTo(graphBounds(graph));
  }, [graph, fitTo]);

  /* -------------------- Arrastre de nodos -------------------- */

  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.moved) {
      dispatch({
        type: "COMMIT_MOVE",
        id: drag.id,
        fromX: drag.fromX,
        fromY: drag.fromY,
      });
    }
    dragRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
  }, [dispatch]);

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, id: string) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.stopPropagation();

      const node = nodeById.get(id);
      if (!node) return;

      if (tool === "delete") {
        dispatch({ type: "DELETE_NODE", id });
        setAviso(`Se eliminó ${node.label} y sus corredores.`);
        return;
      }

      if (tool === "connect") {
        if (!connectingFrom) {
          dispatch({ type: "START_CONNECT", from: id });
          setAviso(`Conectando desde ${node.label}. Escoge el punto de destino.`);
        } else if (connectingFrom !== id) {
          setPendingEdge({ from: connectingFrom, to: id });
          setConnectPreview(null);
        }
        return;
      }

      dispatch({ type: "SELECT", selection: { kind: "node", id } });

      const world = toWorld(event.clientX, event.clientY);
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        offsetX: node.x - world.x,
        offsetY: node.y - world.y,
        fromX: node.x,
        fromY: node.y,
        moved: false,
      };
      try {
        svgRef.current?.setPointerCapture(event.pointerId);
      } catch {
        // Si el puntero ya no está activo la captura falla; el arrastre sigue
        // funcionando con los eventos normales, así que no debe romper nada.
      }
    },
    [connectingFrom, dispatch, nodeById, svgRef, tool, toWorld],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;

      if (drag && drag.pointerId === event.pointerId) {
        const world = toWorld(event.clientX, event.clientY);
        pendingRef.current = {
          x: world.x + drag.offsetX,
          y: world.y + drag.offsetY,
        };
        drag.moved = true;
        // Se coalescen los movimientos en un frame: sin esto se despacharía
        // una acción por cada pointermove y el arrastre iría a tirones.
        if (frameRef.current === null) {
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            const position = pendingRef.current;
            const current = dragRef.current;
            if (!position || !current) return;
            dispatch({ type: "MOVE_NODE", id: current.id, ...position });
          });
        }
        return;
      }

      if (connectingFrom) {
        setConnectPreview(toWorld(event.clientX, event.clientY));
      }

      movePan(event);
    },
    [connectingFrom, dispatch, movePan, toWorld],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        try {
          svgRef.current?.releasePointerCapture(event.pointerId);
        } catch {
          // Ya liberado.
        }
        commitDrag();
        return;
      }
      endPan(event);
    },
    [commitDrag, endPan, svgRef],
  );

  /* -------------------- Fondo -------------------- */

  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (tool === "add-node") {
        const world = toWorld(event.clientX, event.clientY);
        dispatch({ type: "ADD_NODE", x: world.x, y: world.y });
        setAviso("Punto agregado. Renómbralo en el panel de edición.");
        return;
      }

      if (connectingFrom) {
        dispatch({ type: "CANCEL_CONNECT" });
        setConnectPreview(null);
        setAviso("Conexión cancelada.");
        return;
      }

      dispatch({ type: "SELECT", selection: null });
      beginPan(event as unknown as React.PointerEvent);
    },
    [beginPan, connectingFrom, dispatch, tool, toWorld],
  );

  /* -------------------- Teclado -------------------- */

  const handleNodeKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGGElement>, id: string) => {
      const node = nodeById.get(id);
      if (!node) return;

      const direcciones: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const direccion = direcciones[event.key];

      if (direccion) {
        event.preventDefault();
        if (event.shiftKey) {
          // Shift + flechas mueve el nodo enfocado.
          const paso = 12;
          const delta = {
            up: { x: 0, y: -paso },
            down: { x: 0, y: paso },
            left: { x: -paso, y: 0 },
            right: { x: paso, y: 0 },
          }[direccion];
          dispatch({ type: "MOVE_NODE", id, x: node.x + delta.x, y: node.y + delta.y });
          dispatch({ type: "COMMIT_MOVE", id, fromX: node.x, fromY: node.y });
          setAviso(`${node.label} movido.`);
        } else {
          const siguiente = nearestNodeInDirection(graph.nodes, id, direccion);
          if (siguiente) {
            dispatch({ type: "SELECT", selection: { kind: "node", id: siguiente } });
            setAviso(`${nodeById.get(siguiente)?.label ?? siguiente} seleccionado.`);
          }
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (connectingFrom && connectingFrom !== id) {
          setPendingEdge({ from: connectingFrom, to: id });
        } else {
          dispatch({ type: "START_CONNECT", from: id });
          setAviso(`Conectando desde ${node.label}. Muévete al destino y pulsa Entrar.`);
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "DELETE_NODE", id });
        setAviso(`${node.label} eliminado.`);
      }
    },
    [connectingFrom, dispatch, graph.nodes, nodeById],
  );

  // Atajos globales del lienzo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape" && connectingFrom) {
        dispatch({ type: "CANCEL_CONNECT" });
        setConnectPreview(null);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const atajos: Record<string, Tool> = {
        v: "select",
        n: "add-node",
        e: "connect",
        d: "delete",
      };
      const herramienta = atajos[event.key.toLowerCase()];
      if (herramienta) {
        dispatch({ type: "SET_TOOL", tool: herramienta });
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selection
      ) {
        event.preventDefault();
        dispatch(
          selection.kind === "node"
            ? { type: "DELETE_NODE", id: selection.id }
            : { type: "DELETE_EDGE", id: selection.id },
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectingFrom, dispatch, selection]);

  /* -------------------- Render -------------------- */

  const connectingNode = connectingFrom ? nodeById.get(connectingFrom) : null;
  const dimOthers = runState === "ready" && (result?.path.length ?? 0) > 0;

  /**
   * Revelado progresivo de rótulos.
   *
   * Toda la red de Colombia metida en la pantalla de un teléfono deja los
   * nodos en unos 6 px: ahí no caben veinte nombres de ciudad, se encabalgan
   * y no se lee ninguno. Así que los rótulos aparecen por etapas según lo
   * grande que se esté dibujando el grafo, como en cualquier mapa: de lejos
   * solo se nombran el origen, el destino y la ruta; al acercarse, todos.
   */
  const radioPx = NODE_RADIUS / unitsPerPx;
  const mostrarTodosLosRotulos = radioPx >= 9;
  const mostrarRotulosClave = radioPx >= 3.5;
  const mostrarPesos = radioPx >= 8;
  const mostrarDistancias = radioPx >= 7;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full flex-col bg-graph-surface"
    >
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={`Lienzo del grafo de distribución. ${graph.nodes.length} puntos y ${graph.edges.length} corredores.`}
        /* touch-none es obligatorio: sin él, el desplazamiento táctil se queda
           con el gesto y no se puede arrastrar un nodo en el móvil. */
        className={cn(
          "h-full w-full touch-none select-none",
          tool === "add-node" && "cursor-crosshair",
          tool === "connect" && "cursor-crosshair",
          tool === "delete" && "cursor-not-allowed",
        )}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <CanvasDefs />

        {/* fill="transparent" y no "none": con `none` el rectángulo no recibe
            eventos de puntero y el pan dejaría de funcionar. */}
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="transparent"
          onPointerDown={handleBackgroundPointerDown}
        />
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="url(#rejilla)"
          pointerEvents="none"
          opacity={0.7}
        />

        {geometries.map((item) => {
          if (!item) return null;
          const { edge, geometry, fromLabel, toLabel } = item;
          const fase = visuals.edges.get(edge.id) ?? "idle";
          return (
            <GraphEdgeView
              key={edge.id}
              id={edge.id}
              path={geometry.path}
              labelX={geometry.labelPoint.x}
              labelY={geometry.labelPoint.y}
              weightText={formatMetricShort(edge.weights[metric], metric)}
              corridorName={edge.label}
              fromLabel={fromLabel}
              toLabel={toLabel}
              directed={edge.directed}
              selfLoop={geometry.selfLoop}
              phase={fase}
              selected={selection?.kind === "edge" && selection.id === edge.id}
              dimmed={dimOthers}
              unitsPerPx={unitsPerPx}
              // El peso de la ruta hallada se muestra siempre: es el dato que
              // se está buscando.
              showWeight={mostrarPesos || fase === "path"}
              onSelect={(id) => {
                if (tool === "delete") {
                  dispatch({ type: "DELETE_EDGE", id });
                  setAviso("Corredor eliminado.");
                } else {
                  dispatch({ type: "SELECT", selection: { kind: "edge", id } });
                }
              }}
            />
          );
        })}

        {/* Línea elástica mientras se está conectando. */}
        {connectingNode && connectPreview && (
          <line
            x1={connectingNode.x}
            y1={connectingNode.y}
            x2={connectPreview.x}
            y2={connectPreview.y}
            className="stroke-graph-frontier"
            strokeWidth={3}
            strokeDasharray="8 6"
            pointerEvents="none"
          />
        )}

        {graph.nodes.map((node, index) => {
          const visual = visuals.nodes.get(node.id);
          const seleccionado =
            selection?.kind === "node" && selection.id === node.id;
          // Roving tabindex: siempre tiene que haber exactamente un nodo
          // enfocable, o con el teclado no habría forma de entrar al grafo.
          const tabulable =
            seleccionado || (selection?.kind !== "node" && index === 0);
          return (
            <GraphNodeView
              key={node.id}
              id={node.id}
              x={node.x}
              y={node.y}
              label={node.label}
              kindLabel={NODE_KIND_LABELS[node.kind]}
              phase={visual?.phase ?? "pending"}
              onPath={visual?.onPath ?? false}
              isSource={visual?.isSource ?? false}
              isTarget={visual?.isTarget ?? false}
              distanceText={
                visuals.step && visual
                  ? Number.isFinite(visual.distance)
                    ? formatMetricShort(visual.distance, metric)
                    : "∞"
                  : ""
              }
              selected={seleccionado}
              tabbable={tabulable}
              pendingConnection={connectingFrom === node.id}
              unitsPerPx={unitsPerPx}
              maxHitRadius={maxHitRadius}
              showLabel={
                mostrarTodosLosRotulos ||
                (mostrarRotulosClave &&
                  Boolean(
                    visual?.isSource || visual?.isTarget || visual?.onPath,
                  ))
              }
              showDistance={mostrarDistancias}
              onPointerDown={handleNodePointerDown}
              onKeyDown={handleNodeKeyDown}
            />
          );
        })}
      </svg>

      {/* Barra de herramientas */}
      <div className="no-imprimir absolute top-3 left-3 flex flex-col gap-2">
        <ButtonGroup className="bg-card/95 rounded-lg shadow-sm backdrop-blur">
          {HERRAMIENTAS.map(({ tool: t, icon: Icon, label, shortcut }) => (
            <Tooltip key={t}>
              <TooltipTrigger
                render={
                  <Button
                    variant={tool === t ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={label}
                    aria-pressed={tool === t}
                    onClick={() => dispatch({ type: "SET_TOOL", tool: t })}
                  >
                    <Icon />
                  </Button>
                }
              />
              <TooltipContent className="flex items-center gap-2">
                {label}
                <Kbd>{shortcut}</Kbd>
              </TooltipContent>
            </Tooltip>
          ))}
        </ButtonGroup>

        {connectingFrom && (
          <p className="bg-card/95 text-muted-foreground max-w-48 rounded-lg px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
            Escoge el punto de destino, o pulsa <Kbd>Esc</Kbd> para cancelar.
          </p>
        )}
      </div>

      {/* Zoom */}
      <ButtonGroup className="no-imprimir bg-card/95 absolute right-3 bottom-3 rounded-lg shadow-sm backdrop-blur">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Acercar"
                onClick={() => zoomBy(0.8)}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>Acercar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Alejar"
                onClick={() => zoomBy(1.25)}
              >
                <Minus />
              </Button>
            }
          />
          <TooltipContent>Alejar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Ajustar a la vista"
                onClick={ajustarVista}
              >
                <Maximize2 />
              </Button>
            }
          />
          <TooltipContent>Ajustar a la vista</TooltipContent>
        </Tooltip>
      </ButtonGroup>

      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-xs text-center">
            <Crosshair className="text-muted-foreground mx-auto mb-3 size-7" />
            <p className="text-muted-foreground text-sm text-balance">
              El lienzo está vacío. Escoge la herramienta de agregar punto y haz
              clic para crear el primer centro logístico.
            </p>
          </div>
        </div>
      )}

      {/* Equivalente accesible de lo que ocurre en el lienzo. */}
      <p aria-live="polite" className="sr-only">
        {aviso}
      </p>

      <EdgeDialog
        pending={pendingEdge}
        nodeById={nodeById}
        onClose={() => {
          setPendingEdge(null);
          dispatch({ type: "CANCEL_CONNECT" });
        }}
        onAnnounce={setAviso}
      />
    </div>
  );
}
