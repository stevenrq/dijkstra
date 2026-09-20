import type { Graph, GraphEdge, GraphNode, NodeId } from "./types";

/** Radio de un nodo en unidades de mundo del lienzo. */
export const NODE_RADIUS = 26;

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  /** Atributo `d` del <path>. */
  path: string;
  /** Punto donde va la etiqueta de peso. */
  labelPoint: Point;
  /** Extremo inicial ya recortado al borde del nodo. */
  start: Point;
  /** Extremo final ya recortado al borde del nodo. */
  end: Point;
  curved: boolean;
  selfLoop: boolean;
}

/**
 * Decide, de forma determinista, cuánto se desplaza una arista respecto a la
 * recta que une sus nodos.
 *
 * Dos aristas entre el mismo par se solaparían si ambas fueran rectas. El signo
 * depende del orden lexicográfico de los extremos, de modo que A→B siempre se
 * curva hacia un lado y B→A hacia el otro, sin depender del orden del array.
 */
export function edgeOffsets(edges: readonly GraphEdge[]): Map<string, number> {
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const key = [edge.from, edge.to].sort().join("--");
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }

  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      offsets.set(group[0].id, 0);
      continue;
    }
    // Orden estable dentro del grupo para que el reparto no baile entre renders.
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((edge, index) => {
      const sign = edge.from < edge.to ? 1 : -1;
      const magnitude = 26 + Math.floor(index / 2) * 22;
      offsets.set(edge.id, sign * magnitude * (index % 2 === 0 ? 1 : -1));
    });
  }
  return offsets;
}

function shorten(from: Point, to: Point, by: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...from };
  const ratio = by / length;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

/**
 * Geometría de una arista.
 *
 * Los extremos se recortan al borde del círculo del nodo para que la punta de
 * flecha toque el borde y no quede oculta bajo el nodo. En la curva cuadrática
 * la tangente en t=0 es (control - p1) y en t=1 es (p2 - control), así que
 * recortar sobre esas tangentes es exacto y evita medir el DOM.
 */
export function edgeGeometry(
  from: GraphNode,
  to: GraphNode,
  offset: number,
  options: { endGap?: number; startGap?: number } = {},
): EdgeGeometry {
  const startGap = options.startGap ?? NODE_RADIUS + 2;
  const endGap = options.endGap ?? NODE_RADIUS + 10;

  if (from.id === to.id) {
    // Lazo: arco sobre el nodo.
    const r = NODE_RADIUS;
    const start = { x: from.x - 9, y: from.y - r };
    const end = { x: from.x + 9, y: from.y - r };
    return {
      path: `M ${start.x} ${start.y} A 20 20 0 1 1 ${end.x} ${end.y}`,
      labelPoint: { x: from.x, y: from.y - r - 34 },
      start,
      end,
      curved: true,
      selfLoop: true,
    };
  }

  const p1 = { x: from.x, y: from.y };
  const p2 = { x: to.x, y: to.y };

  if (offset === 0) {
    const start = shorten(p1, p2, startGap);
    const end = shorten(p2, p1, endGap);
    return {
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      start,
      end,
      curved: false,
      selfLoop: false,
    };
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  // Normal unitaria a la recta p1→p2.
  const nx = -dy / length;
  const ny = dx / length;
  const control = {
    x: (p1.x + p2.x) / 2 + nx * offset,
    y: (p1.y + p2.y) / 2 + ny * offset,
  };

  const start = shorten(p1, control, startGap);
  const end = shorten(p2, control, endGap);

  // Punto de la curva cuadrática en t = 0.5: 0.25·p1 + 0.5·control + 0.25·p2.
  const labelPoint = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };

  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    labelPoint,
    start,
    end,
    curved: true,
    selfLoop: false,
  };
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Caja que contiene todos los nodos, con margen. Para "ajustar a la vista". */
export function graphBounds(graph: Graph, padding = 90): BoundingBox | null {
  if (graph.nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Nodo más cercano en una dirección cardinal, para navegar el grafo con las
 * flechas del teclado. Solo considera los nodos que caen dentro de un cono de
 * 90° en esa dirección, y entre ellos elige el más próximo.
 */
export function nearestNodeInDirection(
  nodes: readonly GraphNode[],
  fromId: NodeId,
  direction: "up" | "down" | "left" | "right",
): NodeId | null {
  const origin = nodes.find((node) => node.id === fromId);
  if (!origin) return null;

  let best: { id: NodeId; distance: number } | null = null;

  for (const node of nodes) {
    if (node.id === fromId) continue;
    const dx = node.x - origin.x;
    const dy = node.y - origin.y;

    const aligned =
      direction === "right"
        ? dx > 0 && Math.abs(dx) >= Math.abs(dy)
        : direction === "left"
          ? dx < 0 && Math.abs(dx) >= Math.abs(dy)
          : direction === "down"
            ? dy > 0 && Math.abs(dy) >= Math.abs(dx)
            : dy < 0 && Math.abs(dy) >= Math.abs(dx);

    if (!aligned) continue;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { id: node.id, distance };
  }

  return best?.id ?? null;
}
