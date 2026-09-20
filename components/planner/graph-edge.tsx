"use client";

import { memo } from "react";
import { cn } from "cn";
import type { EdgePhase } from "./planner-context";

export interface GraphEdgeViewProps {
  id: string;
  /** Atributo `d` ya calculado en coordenadas de mundo. */
  path: string;
  labelX: number;
  labelY: number;
  /** Peso ya formateado según la métrica activa. */
  weightText: string;
  corridorName?: string;
  fromLabel: string;
  toLabel: string;
  directed: boolean;
  selfLoop: boolean;
  phase: EdgePhase;
  selected: boolean;
  dimmed: boolean;
  /** Unidades de mundo por píxel CSS: con esto se dimensiona el texto. */
  unitsPerPx: number;
  showWeight: boolean;
  onSelect: (id: string) => void;
}

const STROKE: Record<EdgePhase, string> = {
  idle: "stroke-graph-edge",
  tree: "stroke-graph-tree",
  relaxing: "stroke-graph-current",
  improved: "stroke-graph-improved",
  rejected: "stroke-graph-rejected",
  path: "stroke-graph-path",
};

const WIDTH: Record<EdgePhase, number> = {
  idle: 2,
  tree: 3,
  relaxing: 4,
  improved: 4.5,
  rejected: 2.5,
  path: 6,
};

const MARKER: Record<EdgePhase, string> = {
  idle: "url(#punta-normal)",
  tree: "url(#punta-arbol)",
  relaxing: "url(#punta-activa)",
  improved: "url(#punta-mejora)",
  rejected: "url(#punta-descarte)",
  path: "url(#punta-ruta)",
};

function GraphEdgeViewImpl({
  id,
  path,
  labelX,
  labelY,
  weightText,
  corridorName,
  fromLabel,
  toLabel,
  directed,
  selfLoop,
  phase,
  selected,
  dimmed,
  unitsPerPx,
  showWeight,
  onSelect,
}: GraphEdgeViewProps) {
  // La etiqueta se dimensiona en píxeles de pantalla, así que su caja también.
  const fontSize = 11 * unitsPerPx;
  const labelWidth = (weightText.length * 5.6 + 11) * unitsPerPx;
  const labelHeight = 16 * unitsPerPx;
  const descripcion = `${fromLabel} ${directed ? "→" : "↔"} ${toLabel}: ${weightText}${
    corridorName ? `. ${corridorName}` : ""
  }`;

  return (
    <g
      className={cn(
        "transition-opacity",
        dimmed && phase === "idle" ? "opacity-40" : "opacity-100",
      )}
    >
      <title>{descripcion}</title>

      {/*
        Zona de clic invisible y ancha. Sin ella, una línea de 2 px exige una
        puntería imposible. `fill="none"` con `pointerEvents="stroke"` hace que
        solo el trazo reciba el clic, no el área encerrada por la curva.
      */}
      <path
        d={path}
        stroke="transparent"
        strokeWidth={Math.max(20, 22 * unitsPerPx)}
        fill="none"
        pointerEvents="stroke"
        className="cursor-pointer"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(id);
        }}
      />

      {selected && (
        <path
          d={path}
          className="stroke-ring"
          strokeWidth={WIDTH[phase] + 7}
          strokeOpacity={0.35}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}

      <path
        d={path}
        className={cn(
          STROKE[phase],
          "transition-[stroke-width] duration-200",
          phase === "path" && "ruta-animada",
        )}
        strokeWidth={WIDTH[phase]}
        strokeDasharray={phase === "rejected" ? "6 5" : undefined}
        fill="none"
        strokeLinecap="round"
        markerEnd={directed || selfLoop ? MARKER[phase] : undefined}
        pointerEvents="none"
      />

      {showWeight && (
      <g pointerEvents="none">
        <rect
          x={labelX - labelWidth / 2}
          y={labelY - labelHeight / 2}
          width={labelWidth}
          height={labelHeight}
          rx={4 * unitsPerPx}
          className={cn(
            "fill-card transition-colors",
            phase === "path"
              ? "stroke-graph-path"
              : phase === "improved"
                ? "stroke-graph-improved"
                : "stroke-border",
          )}
          strokeWidth={(phase === "idle" ? 1 : 1.6) * unitsPerPx}
        />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          className={cn(
            "font-condensed tabular-nums",
            phase === "path"
              ? "fill-graph-path font-semibold"
              : "fill-muted-foreground",
          )}
        >
          {weightText}
        </text>
      </g>
      )}
    </g>
  );
}

export const GraphEdgeView = memo(GraphEdgeViewImpl);
