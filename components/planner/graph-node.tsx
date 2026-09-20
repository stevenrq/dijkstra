"use client";

import { memo } from "react";
import { cn } from "cn";
import { NODE_RADIUS } from "@/lib/graph/geometry";
import type { NodePhase } from "./planner-context";

export interface GraphNodeViewProps {
  id: string;
  x: number;
  y: number;
  label: string;
  kindLabel: string;
  phase: NodePhase;
  onPath: boolean;
  isSource: boolean;
  isTarget: boolean;
  /** Distancia ya formateada; cadena vacía si todavía no hay ejecución. */
  distanceText: string;
  selected: boolean;
  /** Único nodo que entra en el orden de tabulación (roving tabindex). */
  tabbable: boolean;
  pendingConnection: boolean;
  /** Unidades de mundo por píxel CSS: con esto se dimensiona el texto. */
  unitsPerPx: number;
  /** Tope del área táctil para que no invada la del nodo vecino. */
  maxHitRadius: number;
  showLabel: boolean;
  showDistance: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>, id: string) => void;
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>, id: string) => void;
}

/**
 * Cada estado se distingue por color **y** por una señal no cromática, para
 * que el lienzo siga siendo legible con daltonismo o impreso en blanco y negro:
 *
 *   pendiente   relleno hueco, trazo fino
 *   frontera    relleno hueco, trazo grueso  (está en la cola)
 *   consolidado relleno sólido               (su distancia ya es definitiva)
 *   actual      relleno sólido + halo pulsante
 *   origen      anillo doble
 *   destino     anillo punteado
 *   en la ruta  aro grueso color ruta
 */
const FILL: Record<NodePhase, string> = {
  pending: "fill-card",
  frontier: "fill-card",
  settled: "fill-graph-settled",
  current: "fill-graph-current",
};

const STROKE: Record<NodePhase, string> = {
  pending: "stroke-graph-pending",
  frontier: "stroke-graph-frontier",
  settled: "stroke-graph-settled",
  current: "stroke-graph-current",
};

/** Radio mínimo del área táctil, en píxeles CSS (objetivo de 44 px de lado). */
const HIT_RADIUS_PX = 22;

const STROKE_WIDTH: Record<NodePhase, number> = {
  pending: 2,
  frontier: 4,
  settled: 2,
  current: 2,
};

function GraphNodeViewImpl({
  id,
  x,
  y,
  label,
  kindLabel,
  phase,
  onPath,
  isSource,
  isTarget,
  distanceText,
  selected,
  tabbable,
  pendingConnection,
  unitsPerPx,
  maxHitRadius,
  showLabel,
  showDistance,
  onPointerDown,
  onKeyDown,
}: GraphNodeViewProps) {
  const solid = phase === "settled" || phase === "current";
  const descripcion = [
    label,
    kindLabel,
    distanceText ? `distancia ${distanceText}` : null,
    isSource ? "origen" : null,
    isTarget ? "destino" : null,
    onPath ? "en la ruta mínima" : null,
  ]
    .filter(Boolean)
    .join(". ");

  // El círculo dibujado puede quedar en 6 px en un teléfono, así que el área
  // que recibe el toque se agranda... pero con tope. Sin él, con el mapa
  // alejado las áreas se solapan y el nodo dibujado más tarde intercepta el
  // toque dirigido a su vecino: se acaba arrastrando un nodo distinto del que
  // se tocó. Para afinar en zonas densas hay que acercar el mapa.
  const hitRadius = Math.max(
    NODE_RADIUS,
    Math.min(HIT_RADIUS_PX * unitsPerPx, maxHitRadius),
  );

  // La distancia va dentro del círculo, así que solo se dibuja si cabe: con el
  // mapa alejado, "$2,4M" es más ancho que el nodo entero y se derramaría por
  // encima del dibujo. El valor sigue estando en la pestaña Tabla.
  const diametroPx = (2 * NODE_RADIUS) / unitsPerPx;
  const anchoTextoPx = distanceText.length * 5 + 2;
  const cabeLaDistancia = showDistance && anchoTextoPx <= diametroPx;

  return (
    <g
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={descripcion}
      aria-pressed={selected}
      className="cursor-grab outline-none focus-visible:outline-none active:cursor-grabbing"
      onPointerDown={(event) => onPointerDown(event, id)}
      onKeyDown={(event) => onKeyDown(event, id)}
    >
      <title>{descripcion}</title>

      <circle cx={x} cy={y} r={hitRadius} fill="transparent" />

      {/* Halo pulsante del nodo que se está extrayendo de la cola. */}
      {phase === "current" && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 5}
          className="nodo-pulsante fill-graph-current"
          pointerEvents="none"
        />
      )}

      {selected && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 11}
          className="fill-none stroke-ring"
          strokeWidth={2.5}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}

      {pendingConnection && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 8}
          className="fill-none stroke-graph-frontier"
          strokeWidth={3}
          pointerEvents="none"
        />
      )}

      {/* Aro de la ruta mínima: el trazo más grueso del lienzo. */}
      {onPath && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 6}
          className="fill-none stroke-graph-path"
          strokeWidth={4}
          pointerEvents="none"
        />
      )}

      {/* Anillo doble = origen. */}
      {isSource && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 4}
          className="fill-none stroke-graph-source"
          strokeWidth={2.5}
          pointerEvents="none"
        />
      )}

      {/* Anillo punteado = destino. */}
      {isTarget && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 4}
          className="fill-none stroke-graph-target"
          strokeWidth={3}
          strokeDasharray="5 4"
          pointerEvents="none"
        />
      )}

      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS}
        className={cn(
          FILL[phase],
          STROKE[phase],
          "transition-[fill,stroke] duration-200",
        )}
        strokeWidth={STROKE_WIDTH[phase]}
        pointerEvents="none"
      />

      {distanceText && cabeLaDistancia && (
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          fontSize={10 * unitsPerPx}
          className={cn(
            "font-condensed font-semibold tabular-nums",
            solid ? "fill-graph-on-accent" : "fill-foreground",
          )}
        >
          {distanceText}
        </text>
      )}

      {/* Rótulo cartográfico: condensada, con halo del color del lienzo para
          que se lea aunque pase una arista por debajo. */}
      {showLabel && (
        <text
          x={x}
          y={y + NODE_RADIUS + 13 * unitsPerPx}
          textAnchor="middle"
          pointerEvents="none"
          fontSize={12 * unitsPerPx}
          className="font-condensed fill-foreground font-medium"
          style={{
            paintOrder: "stroke",
            stroke: "var(--graph-surface)",
            strokeWidth: 4 * unitsPerPx,
            strokeLinejoin: "round",
          }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);
