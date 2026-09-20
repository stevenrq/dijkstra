/**
 * Modelo de datos del grafo de distribución.
 *
 * Un grafo ponderado G = (V, A) donde:
 *   - V son centros logísticos (acopio, bodega, punto de entrega, puerto, cruce)
 *   - A son corredores viales, cada uno con tres pesos no negativos
 *
 * Este módulo y el resto de `lib/graph/` son TypeScript puro: no importan React
 * ni Next, para poder ejecutarse y verificarse de forma aislada.
 */

export type NodeId = string;

/** Criterio que Dijkstra minimiza. */
export type Metric = "cost" | "distance" | "time";

export const METRICS: readonly Metric[] = ["cost", "distance", "time"] as const;

/** Tipo de instalación logística; solo afecta al ícono y al color del nodo. */
export type NodeKind = "hub" | "warehouse" | "delivery" | "port" | "junction";

export interface GraphNode {
  id: NodeId;
  /** Nombre visible, p. ej. "Bogotá D.C." */
  label: string;
  kind: NodeKind;
  /** Posición en coordenadas de mundo del lienzo (no píxeles de pantalla). */
  x: number;
  y: number;
  notes?: string;
}

/** Los tres pesos de un corredor: pesos COP, kilómetros y horas. */
export interface EdgeWeights {
  cost: number;
  distance: number;
  time: number;
}

export interface GraphEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  /**
   * `false` (por defecto) = corredor de doble sentido: al construir la lista de
   * adyacencia genera los dos arcos. `true` = sentido único.
   *
   * Para pesos asimétricos reales (una subida gasta más combustible que la
   * bajada) se marca `directed: true` y se agrega la arista inversa como una
   * arista aparte con sus propios pesos.
   */
  directed: boolean;
  weights: EdgeWeights;
  /** Nombre del corredor, p. ej. "Ruta 25 — Panamericana". */
  label?: string;
}

export interface Graph {
  id: string;
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Arco dirigido ya proyectado sobre una métrica concreta. */
export interface Arc {
  edgeId: string;
  to: NodeId;
  weight: number;
}

export type AdjacencyList = ReadonlyMap<NodeId, readonly Arc[]>;

export const METRIC_LABELS: Record<Metric, string> = {
  cost: "Costo",
  distance: "Distancia",
  time: "Tiempo",
};

export const METRIC_UNITS: Record<Metric, string> = {
  cost: "COP",
  distance: "km",
  time: "h",
};

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  hub: "Centro de acopio",
  warehouse: "Bodega",
  delivery: "Punto de entrega",
  port: "Puerto",
  junction: "Cruce vial",
};
