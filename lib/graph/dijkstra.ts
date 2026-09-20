import { buildAdjacency } from "./adjacency";
import { formatMetric, formatMetricShort } from "./format";
import { MinHeap } from "./min-heap";
import { validateGraph, type ValidationIssue } from "./validation";
import {
  METRICS,
  type EdgeWeights,
  type Graph,
  type GraphEdge,
  type Metric,
  type NodeId,
} from "./types";

/* ------------------------------------------------------------------ *
 * Tipos de la traza
 * ------------------------------------------------------------------ */

export type StepKind =
  | "init"
  | "extract"
  | "skip-stale"
  | "relax"
  | "dead-end"
  | "target-reached"
  | "done";

export interface QueueEntrySnapshot {
  node: NodeId;
  priority: number;
  /** La entrada quedó obsoleta: su nodo ya se consolidó o ya tiene mejor distancia. */
  stale: boolean;
}

export interface RelaxationInfo {
  edgeId: string;
  from: NodeId;
  to: NodeId;
  weight: number;
  /** d(to) antes de la relajación; puede ser Infinity. */
  previousDistance: number;
  /** d(from) + peso. */
  candidateDistance: number;
  improved: boolean;
}

/**
 * Instantánea completa del algoritmo en un instante.
 *
 * Se guarda el estado entero (no deltas). Cuesta O(V) por paso, pero a cambio
 * dibujar cualquier paso es acceso directo: el control deslizante salta a
 * cualquier índice sin rehacer la ejecución, e ir hacia atrás no puede
 * desincronizarse. Con los tamaños de grafo de esta aplicación el costo es
 * despreciable.
 */
export interface DijkstraStep {
  index: number;
  /** Número de extracciones efectivas acumuladas. */
  iteration: number;
  kind: StepKind;
  currentNode: NodeId | null;
  relaxation: RelaxationInfo | null;
  distances: Record<NodeId, number>;
  previous: Record<NodeId, NodeId | null>;
  /** Arista concreta usada para llegar a cada nodo. Imprescindible con paralelas. */
  previousEdge: Record<NodeId, string | null>;
  /** Nodos consolidados, en orden de extracción. */
  settled: NodeId[];
  queue: QueueEntrySnapshot[];
  /** Explicación en español, lista para mostrar. */
  explanation: string;
  /** Expresión matemática del paso, p. ej. "d(Cali) = min(∞, 0 + 460) = 460". */
  formula?: string;
}

export interface DijkstraStats {
  settledNodes: number;
  relaxedArcs: number;
  improvements: number;
  enqueued: number;
  staleEntries: number;
}

export interface DijkstraResult {
  source: NodeId;
  target: NodeId | null;
  metric: Metric;
  distances: Record<NodeId, number>;
  previous: Record<NodeId, NodeId | null>;
  previousEdge: Record<NodeId, string | null>;
  /** Secuencia de nodos del origen al destino. Vacía si no hay ruta. */
  path: NodeId[];
  /** Ids de las aristas concretas usadas por la ruta. */
  pathEdges: string[];
  /** Costo total en la métrica minimizada. Infinity si no hay ruta. */
  total: number;
  /** Los tres totales reales de la ruta hallada, no solo el minimizado. */
  totalsByMetric: EdgeWeights;
  reachable: boolean;
  visitOrder: NodeId[];
  /** Aristas del árbol de caminos mínimos completo. */
  shortestPathTree: string[];
  steps: DijkstraStep[];
  stats: DijkstraStats;
  issues: ValidationIssue[];
}

export interface DijkstraOptions {
  metric: Metric;
  /** Detenerse al consolidar el destino. Por defecto `true` si hay destino. */
  stopAtTarget?: boolean;
  /** Registrar la traza paso a paso. Por defecto `true`. */
  recordSteps?: boolean;
}

/* ------------------------------------------------------------------ *
 * Algoritmo
 * ------------------------------------------------------------------ */

const INF = Number.POSITIVE_INFINITY;

/**
 * Las explicaciones y las fórmulas llevan los valores ya formateados en la
 * métrica activa: un peso de flete mostrado como 2360000 no se lee, y como
 * "$2,4M" sí. La forma corta es la de las fórmulas; la larga, la de las frases.
 */
function formatters(metric: Metric) {
  return {
    short: (value: number) =>
      Number.isFinite(value) ? formatMetricShort(value, metric) : "∞",
    long: (value: number) =>
      Number.isFinite(value) ? formatMetric(value, metric) : "∞",
  };
}

export function dijkstra(
  graph: Graph,
  source: NodeId,
  target: NodeId | null,
  options: DijkstraOptions,
): DijkstraResult {
  const { metric } = options;
  const num = formatters(metric).short;
  const numLargo = formatters(metric).long;
  const recordSteps = options.recordSteps ?? true;
  const stopAtTarget = options.stopAtTarget ?? target !== null;

  const issues = validateGraph(graph, metric);
  const blocking = issues.filter((issue) => issue.severity === "error");

  const distances: Record<NodeId, number> = {};
  const previous: Record<NodeId, NodeId | null> = {};
  const previousEdge: Record<NodeId, string | null> = {};
  for (const node of graph.nodes) {
    distances[node.id] = INF;
    previous[node.id] = null;
    previousEdge[node.id] = null;
  }

  const edgeById = new Map<string, GraphEdge>(
    graph.edges.map((edge) => [edge.id, edge]),
  );
  const labelOf = new Map<NodeId, string>(
    graph.nodes.map((node) => [node.id, node.label]),
  );
  const name = (id: NodeId | null) =>
    id === null ? "—" : (labelOf.get(id) ?? id);

  const stats: DijkstraStats = {
    settledNodes: 0,
    relaxedArcs: 0,
    improvements: 0,
    enqueued: 0,
    staleEntries: 0,
  };

  const emptyResult = (): DijkstraResult => ({
    source,
    target,
    metric,
    distances,
    previous,
    previousEdge,
    path: [],
    pathEdges: [],
    total: INF,
    totalsByMetric: { cost: 0, distance: 0, time: 0 },
    reachable: false,
    visitOrder: [],
    shortestPathTree: [],
    steps: [],
    stats,
    issues,
  });

  if (blocking.length > 0) return emptyResult();
  if (!(source in distances)) return emptyResult();

  const adjacency = buildAdjacency(graph, metric);
  const heap = new MinHeap<NodeId>();
  const settledSet = new Set<NodeId>();
  const settled: NodeId[] = [];
  const steps: DijkstraStep[] = [];

  distances[source] = 0;
  heap.push(0, source);
  stats.enqueued++;

  /** Retrata la cola marcando las entradas que ya quedaron obsoletas. */
  const snapshotQueue = (): QueueEntrySnapshot[] =>
    heap.toSortedArray().map((entry) => ({
      node: entry.value,
      priority: entry.priority,
      stale:
        settledSet.has(entry.value) || entry.priority > distances[entry.value],
    }));

  const pushStep = (
    kind: StepKind,
    currentNode: NodeId | null,
    explanation: string,
    formula?: string,
    relaxation: RelaxationInfo | null = null,
  ) => {
    if (!recordSteps) return;
    steps.push({
      index: steps.length,
      iteration: settled.length,
      kind,
      currentNode,
      relaxation,
      distances: { ...distances },
      previous: { ...previous },
      previousEdge: { ...previousEdge },
      settled: [...settled],
      queue: snapshotQueue(),
      explanation,
      formula,
    });
  };

  pushStep(
    "init",
    source,
    `Inicialización: d(${name(source)}) = 0 y d(v) = ∞ para todos los demás nodos. ` +
      `Solo el origen entra en la cola de prioridad.`,
    `d(${name(source)}) = 0`,
  );

  let targetReached = false;

  while (!heap.isEmpty()) {
    const entry = heap.pop()!;
    const current = entry.value;

    // Borrado perezoso: esta entrada quedó obsoleta por una mejora posterior.
    if (settledSet.has(current) || entry.priority > distances[current]) {
      stats.staleEntries++;
      pushStep(
        "skip-stale",
        current,
        `Se descarta la entrada obsoleta de ${name(current)} con prioridad ${num(entry.priority)}: ` +
          `ese nodo ya se consolidó con d = ${num(distances[current])}. ` +
          `Es el costo de no usar decrease-key, y no afecta al resultado.`,
      );
      continue;
    }

    settledSet.add(current);
    settled.push(current);
    stats.settledNodes++;

    pushStep(
      "extract",
      current,
      `Se extrae ${name(current)}, el nodo no consolidado con menor distancia (d = ${numLargo(distances[current])}). ` +
        `Con pesos no negativos esa distancia ya es definitiva y no volverá a mejorar.`,
      `consolidar ${name(current)} con d = ${num(distances[current])}`,
    );

    if (stopAtTarget && target !== null && current === target) {
      targetReached = true;
      pushStep(
        "target-reached",
        current,
        `Se consolidó el destino ${name(target)}. El algoritmo puede detenerse aquí: ` +
          `cualquier nodo que quede en la cola tiene distancia mayor o igual, ` +
          `así que ninguna ruta pendiente podría mejorar esta.`,
        `d(${name(target)}) = ${numLargo(distances[target])}`,
      );
      break;
    }

    for (const arc of adjacency.get(current) ?? []) {
      const neighbor = arc.to;
      const previousDistance = distances[neighbor];
      const candidateDistance = distances[current] + arc.weight;
      const improved =
        !settledSet.has(neighbor) && candidateDistance < previousDistance;

      stats.relaxedArcs++;

      if (improved) {
        distances[neighbor] = candidateDistance;
        previous[neighbor] = current;
        previousEdge[neighbor] = arc.edgeId;
        heap.push(candidateDistance, neighbor);
        stats.improvements++;
        stats.enqueued++;
      }

      const relaxation: RelaxationInfo = {
        edgeId: arc.edgeId,
        from: current,
        to: neighbor,
        weight: arc.weight,
        previousDistance,
        candidateDistance,
        improved,
      };

      const formula =
        `d(${name(neighbor)}) = min(${num(previousDistance)}, ` +
        `${num(distances[current])} + ${num(arc.weight)}) = ` +
        `${num(Math.min(previousDistance, candidateDistance))}`;

      const explanation = settledSet.has(neighbor)
        ? `${name(neighbor)} ya está consolidado, así que no se relaja: su distancia definitiva no puede mejorar.`
        : improved
          ? `Relajación exitosa: llegar a ${name(neighbor)} pasando por ${name(current)} cuesta ` +
            `${num(candidateDistance)}, mejor que ${num(previousDistance)}. Se actualiza su distancia, ` +
            `su predecesor pasa a ser ${name(current)} y se encola con la nueva prioridad.`
          : `Sin mejora: por ${name(current)} llegaríamos a ${name(neighbor)} con ${num(candidateDistance)}, ` +
            `que no es mejor que ${num(previousDistance)}. Se descarta y se conserva el predecesor actual.`;

      pushStep("relax", current, explanation, formula, relaxation);
    }
  }

  const reachable =
    target === null ? true : Number.isFinite(distances[target] ?? INF);

  if (target !== null && !targetReached && !reachable) {
    pushStep(
      "dead-end",
      null,
      `La cola se vació sin llegar a ${name(target)}. No existe ninguna ruta desde ` +
        `${name(source)} hasta ${name(target)}: el destino está en otra componente del grafo.`,
    );
  }

  /* ---- Reconstrucción de la ruta ---- */

  const path: NodeId[] = [];
  const pathEdges: string[] = [];

  if (target !== null && reachable) {
    const guard = new Set<NodeId>();
    let cursor: NodeId | null = target;
    while (cursor !== null) {
      // Protección contra un `previous` cíclico por un JSON importado corrupto.
      if (guard.has(cursor) || path.length > graph.nodes.length) break;
      guard.add(cursor);
      path.unshift(cursor);
      const edgeId = previousEdge[cursor];
      if (edgeId) pathEdges.unshift(edgeId);
      cursor = previous[cursor];
    }
    if (path[0] !== source) {
      path.length = 0;
      pathEdges.length = 0;
    }
  } else if (target !== null && target === source) {
    path.push(source);
  }

  const totalsByMetric: EdgeWeights = { cost: 0, distance: 0, time: 0 };
  for (const edgeId of pathEdges) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;
    for (const m of METRICS) totalsByMetric[m] += edge.weights[m];
  }

  const shortestPathTree = Object.values(previousEdge).filter(
    (edgeId): edgeId is string => edgeId !== null,
  );

  const total =
    target === null ? 0 : reachable ? (distances[target] ?? INF) : INF;

  pushStep(
    "done",
    null,
    target === null
      ? `Fin. Se consolidaron ${settled.length} nodos y se conoce la distancia mínima desde ` +
        `${name(source)} hacia cada uno de ellos.`
      : reachable
        ? `Fin. La ruta mínima de ${name(source)} a ${name(target)} recorre ${path.length} nodos ` +
          `con un total de ${numLargo(total)}.`
        : `Fin. ${name(target)} es inalcanzable desde ${name(source)}.`,
  );

  return {
    source,
    target,
    metric,
    distances,
    previous,
    previousEdge,
    path,
    pathEdges,
    total,
    totalsByMetric,
    reachable,
    visitOrder: settled,
    shortestPathTree,
    steps,
    stats,
    issues,
  };
}

/**
 * Resuelve la misma pareja origen–destino con las tres métricas.
 *
 * Es lo que permite el argumento central de la sustentación: la ruta más
 * barata normalmente no es ni la más corta ni la más rápida.
 */
export function compareMetrics(
  graph: Graph,
  source: NodeId,
  target: NodeId,
): Record<Metric, DijkstraResult> {
  return {
    cost: dijkstra(graph, source, target, {
      metric: "cost",
      recordSteps: false,
    }),
    distance: dijkstra(graph, source, target, {
      metric: "distance",
      recordSteps: false,
    }),
    time: dijkstra(graph, source, target, {
      metric: "time",
      recordSteps: false,
    }),
  };
}
