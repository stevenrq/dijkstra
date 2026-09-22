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
  /** Arcos dirigidos ya vistos. Un corredor de doble sentido aporta los dos. */
  const seenArcs = new Set<string>();

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
      // Se compara por arcos y no por pares de nodos: así un sentido único
      // A→B junto a un doble sentido A–B también cuenta como paralelo (los dos
      // ofrecen el arco A→B), y dos sentidos únicos opuestos no.
      const arcs = edge.directed
        ? [`${edge.from}->${edge.to}`]
        : [`${edge.from}->${edge.to}`, `${edge.to}->${edge.from}`];
      if (arcs.some((arc) => seenArcs.has(arc))) {
        issues.push({
          code: "PARALLEL_EDGE",
          severity: "warning",
          edgeId: edge.id,
          message: `Hay más de un corredor entre ${fromLabel} y ${toLabel}. Se conservan ambos: la relajación se queda automáticamente con el de menor ${metricName}.`,
        });
      }
      for (const arc of arcs) seenArcs.add(arc);
    }
  }

  return issues;
}

/**
 * Origen y destino: los dos tienen que existir en el grafo. Sin destino no hay
 * ruta que mostrar, y calcular «algo» daría una hoja de ruta vacía de $ 0.
 */
export function validateEndpoints(
  graph: Graph,
  source: NodeId | null,
  target: NodeId | null,
): ValidationIssue[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const issues: ValidationIssue[] = [];
  if (source === null || !ids.has(source)) {
    issues.push({
      code: "NO_SOURCE",
      severity: "error",
      message: "Escoge un punto de origen antes de calcular la ruta.",
    });
  }
  if (target === null || !ids.has(target)) {
    issues.push({
      code: "NO_TARGET",
      severity: "error",
      message: "Escoge un punto de destino antes de calcular la ruta.",
    });
  }
  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
