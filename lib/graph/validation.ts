import { METRIC_LABELS, type Graph, type Metric, type NodeId } from "./types";

export type IssueCode =
  | "NEGATIVE_WEIGHT"
  | "NON_FINITE_WEIGHT"
  | "SELF_LOOP"
  | "PARALLEL_EDGE"
  | "DANGLING_EDGE"
  | "EMPTY_GRAPH"
  | "NO_SOURCE"
  | "NO_TARGET"
  | "UNREACHABLE_TARGET"
  | "DISCONNECTED";

export interface ValidationIssue {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  edgeId?: string;
  nodeId?: NodeId;
}

/**
 * El mensaje de la precondición de Dijkstra. Se muestra completo y de forma
 * persistente (no en un aviso que se desvanece) porque es material evaluable:
 * entender *por qué* falla es parte del tema.
 */
export const NEGATIVE_WEIGHT_EXPLANATION =
  "Dijkstra exige pesos no negativos. Al extraer un nodo del montículo se " +
  "asume que su distancia ya es definitiva; con un peso negativo esa " +
  "distancia podría mejorarse más adelante y la suposición se rompe. Para " +
  "grafos con pesos negativos se usa Bellman-Ford.";

/**
 * Revisa el grafo contra una métrica concreta.
 *
 * Solo `error` bloquea la ejecución. Las advertencias se muestran pero no
 * impiden calcular (un lazo o una arista paralela son grafos perfectamente
 * válidos, simplemente conviene señalarlos).
 */
export function validateGraph(graph: Graph, metric: Metric): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const metricName = METRIC_LABELS[metric].toLowerCase();

  if (graph.nodes.length === 0) {
    issues.push({
      code: "EMPTY_GRAPH",
      severity: "error",
      message: "El grafo no tiene nodos. Agrega al menos un centro logístico.",
    });
    return issues;
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const labelOf = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const seenPairs = new Map<string, string>();

  for (const edge of graph.edges) {
    const weight = edge.weights[metric];
    const fromLabel = labelOf.get(edge.from) ?? edge.from;
    const toLabel = labelOf.get(edge.to) ?? edge.to;

    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        code: "DANGLING_EDGE",
        severity: "error",
        edgeId: edge.id,
        message: `La arista ${edge.id} apunta a un nodo que ya no existe.`,
      });
      continue;
    }

    if (!Number.isFinite(weight)) {
      issues.push({
        code: "NON_FINITE_WEIGHT",
        severity: "error",
        edgeId: edge.id,
        message: `El peso de ${metricName} en ${fromLabel} → ${toLabel} no es un número válido.`,
      });
    } else if (weight < 0) {
      issues.push({
        code: "NEGATIVE_WEIGHT",
        severity: "error",
        edgeId: edge.id,
        message: `${fromLabel} → ${toLabel} tiene ${metricName} negativo (${weight}). ${NEGATIVE_WEIGHT_EXPLANATION}`,
      });
    }

    if (edge.from === edge.to) {
      issues.push({
        code: "SELF_LOOP",
        severity: "warning",
        edgeId: edge.id,
        message: `${fromLabel} tiene un lazo. Los lazos no afectan a Dijkstra: con pesos no negativos nunca mejoran una distancia, así que se ignoran.`,
      });
    } else {
      const key = edge.directed
        ? `${edge.from}->${edge.to}`
        : [edge.from, edge.to].sort().join("--");
      const previous = seenPairs.get(key);
      if (previous) {
        issues.push({
          code: "PARALLEL_EDGE",
          severity: "warning",
          edgeId: edge.id,
          message: `Hay más de un corredor entre ${fromLabel} y ${toLabel}. Se conservan ambos: la relajación se queda automáticamente con el de menor ${metricName}.`,
        });
      } else {
        seenPairs.set(key, edge.id);
      }
    }
  }

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
