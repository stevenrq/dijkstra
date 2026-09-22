import { compareMetrics, dijkstra, type DijkstraResult } from "./dijkstra";
import type { Graph, GraphEdge, Metric, NodeId } from "./types";
import {
  hasBlockingErrors,
  validateEndpoints,
  validateGraph,
  type ValidationIssue,
} from "./validation";

/** Un tramo de la hoja de ruta: la arista usada y el acumulado al llegar. */
export interface RouteLeg {
  from: NodeId;
  to: NodeId;
  edge: GraphEdge;
  /** Total acumulado, en la métrica minimizada, al terminar este tramo. */
  accumulated: number;
}

/**
 * Tramos de la ruta hallada, en orden. La usan la hoja de ruta en pantalla y
 * el informe impreso, así que los dos suman exactamente lo mismo.
 */
export function buildRouteLegs(graph: Graph, result: DijkstraResult): RouteLeg[] {
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const legs: RouteLeg[] = [];
  let suma = 0;
  result.pathEdges.forEach((edgeId, index) => {
    const edge = edgeById.get(edgeId);
    if (!edge) return;
    suma += edge.weights[result.metric];
    legs.push({
      from: result.path[index],
      to: result.path[index + 1],
      edge,
      accumulated: suma,
    });
  });
  return legs;
}

export type RouteSolution =
  | {
      ok: true;
      result: DijkstraResult;
      comparison: Record<Metric, DijkstraResult> | null;
    }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Todo lo que hace el botón «Calcular»: comprueba origen y destino, valida el
 * grafo contra la métrica elegida, ejecuta Dijkstra con la traza y resuelve la
 * misma pareja con las tres métricas para la comparativa.
 *
 * Solo bloquean los pesos negativos de la métrica que se minimiza: la
 * precondición de Dijkstra es sobre los pesos que usa. Si otra métrica tiene
 * un peso negativo, su fila de la comparativa lo explica en vez de calcularse.
 */
export function solveRoute(
  graph: Graph,
  source: NodeId | null,
  target: NodeId | null,
  metric: Metric,
): RouteSolution {
  const endpoints = validateEndpoints(graph, source, target);
  if (endpoints.length > 0) return { ok: false, issues: endpoints };

  const issues = validateGraph(graph, metric);
  if (hasBlockingErrors(issues)) return { ok: false, issues };

  const result = dijkstra(graph, source!, target, { metric });
  const comparison = result.reachable
    ? compareMetrics(graph, source!, target!)
    : null;
  return { ok: true, result, comparison };
}
