import type { DijkstraResult } from "@/lib/graph/dijkstra";
import type { ValidationIssue } from "@/lib/graph/validation";
import type {
  EdgeWeights,
  Graph,
  GraphEdge,
  GraphNode,
  Metric,
  NodeId,
} from "@/lib/graph/types";
// Importaciones relativas a propósito: este módulo también se compila para
// `node --test`, que no resuelve el alias `@/`.
import { cloneGraph, DEFAULT_SCENARIO_ID, getScenario } from "../../lib/scenarios";
import { freePosition } from "../../lib/graph/geometry";
import { parseGraphObject } from "../../lib/graph/serialization";
import { METRICS } from "../../lib/graph/types";

export type Tool = "select" | "add-node" | "connect" | "delete";
export type RunState = "idle" | "ready" | "error";
export type Speed = 0.5 | 1 | 2 | 4;

export type Selection =
  | { kind: "node"; id: NodeId }
  | { kind: "edge"; id: string }
  | null;

/**
 * Lo que guarda cada entrada del historial. No basta con el grafo: deshacer
 * el borrado del origen tiene que devolver también el origen, y deshacer una
 * importación, el escenario y los extremos que había.
 */
export interface HistorySnapshot {
  graph: Graph;
  source: NodeId | null;
  target: NodeId | null;
  scenarioId: string;
}

export interface PlannerState {
  graph: Graph;
  scenarioId: string;
  metric: Metric;
  source: NodeId | null;
  target: NodeId | null;
  /** Contadores puros: generar ids con crypto.randomUUID() dentro del reductor
   *  sería impuro y StrictMode lo ejecutaría dos veces en desarrollo. Son solo
   *  una pista: el id que se asigna siempre salta los que ya existen. */
  nextNodeNumber: number;
  nextEdgeNumber: number;

  tool: Tool;
  selection: Selection;
  connectingFrom: NodeId | null;

  result: DijkstraResult | null;
  comparison: Record<Metric, DijkstraResult> | null;
  runState: RunState;
  issues: ValidationIssue[];

  stepIndex: number;
  isPlaying: boolean;
  speed: Speed;
  showTree: boolean;

  history: {
    past: HistorySnapshot[];
    future: HistorySnapshot[];
    /**
     * Grupo de edición abierto. Las pulsaciones seguidas sobre el mismo campo
     * (renombrar un punto, escribir un peso) se funden en una sola entrada:
     * sin esto, cada tecla era un paso de deshacer y un nombre largo llenaba
     * el historial entero.
     */
    group: string | null;
  };
  /**
   * Sube cada vez que el grafo se reemplaza entero (escenario, importación,
   * vaciar, deshacer entre grafos distintos). El lienzo reencuadra cuando
   * cambia, en vez de fiarse del id del grafo, que puede repetirse.
   */
  vista: number;
  hydrated: boolean;
}

export type PlannerAction =
  // Edición del grafo
  | { type: "ADD_NODE"; x?: number; y?: number; label?: string; kind?: GraphNode["kind"] }
  | { type: "UPDATE_NODE"; id: NodeId; changes: Partial<Omit<GraphNode, "id">> }
  | { type: "DELETE_NODE"; id: NodeId }
  | { type: "MOVE_NODE"; id: NodeId; x: number; y: number }
  | { type: "COMMIT_MOVE"; id: NodeId; fromX: number; fromY: number }
  | { type: "ADD_EDGE"; from: NodeId; to: NodeId; weights: EdgeWeights; directed: boolean; label?: string }
  | { type: "UPDATE_EDGE"; id: string; changes: Partial<Omit<GraphEdge, "id">> }
  | { type: "DELETE_EDGE"; id: string }
  | { type: "REVERSE_EDGE"; id: string }
  | { type: "END_EDIT_GROUP" }
  // Selección y herramientas
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SELECT"; selection: Selection }
  | { type: "START_CONNECT"; from: NodeId }
  | { type: "CANCEL_CONNECT" }
  | { type: "SET_SOURCE"; id: NodeId | null }
  | { type: "SET_TARGET"; id: NodeId | null }
  | { type: "SWAP_ENDPOINTS" }
  | { type: "SET_METRIC"; metric: Metric }
  // Ejecución
  | { type: "RUN_OK"; result: DijkstraResult; comparison: Record<Metric, DijkstraResult> | null }
  | { type: "RUN_FAILED"; issues: ValidationIssue[]; metric?: Metric }
  | { type: "CLEAR_RESULT" }
  | { type: "STEP_NEXT" }
  | { type: "STEP_PREV" }
  | { type: "SEEK"; index: number }
  | { type: "FIRST_STEP" }
  | { type: "LAST_STEP" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TOGGLE_PLAY" }
  | { type: "SET_SPEED"; speed: Speed }
  | { type: "TOGGLE_TREE" }
  // Datos
  | { type: "LOAD_SCENARIO"; scenarioId: string }
  | { type: "RESET_SCENARIO" }
  | { type: "IMPORT_GRAPH"; graph: Graph }
  | { type: "CLEAR_GRAPH" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "HYDRATE"; state: Partial<PlannerState> };

const HISTORY_LIMIT = 30;

/** Arranca los contadores por encima de cualquier id ya presente. */
function nextCounters(graph: Graph): { node: number; edge: number } {
  let node = 1;
  let edge = 1;
  for (const n of graph.nodes) {
    const match = /^N(\d+)$/.exec(n.id);
    if (match) node = Math.max(node, Number(match[1]) + 1);
  }
  for (const e of graph.edges) {
    const match = /^A(\d+)$/.exec(e.id);
    if (match) edge = Math.max(edge, Number(match[1]) + 1);
  }
  return { node, edge };
}

/**
 * Primer número libre a partir del contador. Después de vaciar y deshacer, o
 * de importar y deshacer, el contador puede quedar por debajo de ids que ya
 * existen; sin este salto se creaban dos "N1" y borrar uno borraba los dos.
 */
function freeNumber(prefix: string, desde: number, usados: Set<string>): number {
  let n = Math.max(1, desde);
  while (usados.has(`${prefix}${n}`)) n++;
  return n;
}

export function initialState(scenarioId = DEFAULT_SCENARIO_ID): PlannerState {
  const scenario = getScenario(scenarioId);
  const graph = cloneGraph(scenario.graph);
  const counters = nextCounters(graph);
  return {
    graph,
    scenarioId: scenario.id,
    metric: "cost",
    source: scenario.suggested?.source ?? graph.nodes[0]?.id ?? null,
    target: scenario.suggested?.target ?? graph.nodes.at(-1)?.id ?? null,
    nextNodeNumber: counters.node,
    nextEdgeNumber: counters.edge,
    tool: "select",
    selection: null,
    connectingFrom: null,
    result: null,
    comparison: null,
    runState: "idle",
    issues: [],
    stepIndex: 0,
    isPlaying: false,
    speed: 1,
    showTree: false,
    history: { past: [], future: [], group: null },
    vista: 0,
    hydrated: false,
  };
}

/** Sustituye el grafo por una copia limpia del escenario, conservando las preferencias. */
function cargarEscenario(state: PlannerState, scenarioId: string): PlannerState {
  const fresh = initialState(scenarioId);
  return {
    ...fresh,
    metric: state.metric,
    speed: state.speed,
    showTree: state.showTree,
    // Cambiar o restablecer el escenario se puede deshacer, como cualquier edición.
    history: {
      past: [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      group: null,
    },
    vista: state.vista + 1,
    hydrated: true,
  };
}

/** Indica si el grafo y los extremos siguen tal como los define el escenario. */
export function isScenarioPristine(
  state: Pick<PlannerState, "graph" | "source" | "target" | "scenarioId">,
): boolean {
  if (state.scenarioId === "importado") return false;
  const fresh = initialState(state.scenarioId);
  return (
    fresh.source === state.source &&
    fresh.target === state.target &&
    JSON.stringify(fresh.graph) === JSON.stringify(state.graph)
  );
}

function snapshot(state: PlannerState): HistorySnapshot {
  return {
    graph: state.graph,
    source: state.source,
    target: state.target,
    scenarioId: state.scenarioId,
  };
}

/** Todo lo que se descarta cuando el resultado deja de corresponder al grafo. */
const RESULTADO_VACIO: Pick<
  PlannerState,
  "result" | "comparison" | "runState" | "issues" | "stepIndex" | "isPlaying"
> = {
  result: null,
  comparison: null,
  runState: "idle",
  issues: [],
  stepIndex: 0,
  isPlaying: false,
};

/**
 * Toda edición del grafo pasa por aquí: empuja el estado anterior al historial
 * e invalida el resultado, porque un resultado calculado sobre otro grafo
 * mostraría una ruta que ya no existe.
 *
 * Con `group`, una edición que continúa el grupo abierto no crea entrada
 * nueva: la que ya existe guarda el estado de antes de empezar a escribir.
 */
function withGraphEdit(
  state: PlannerState,
  graph: Graph,
  group: string | null = null,
): PlannerState {
  const continua = group !== null && state.history.group === group;
  return {
    ...state,
    graph,
    history: {
      past: continua
        ? state.history.past
        : [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      group,
    },
    ...RESULTADO_VACIO,
  };
}

/** Quita las referencias a elementos que ya no existen en el grafo. */
function sanitizeReferences(state: PlannerState): PlannerState {
  const nodos = new Set(state.graph.nodes.map((node) => node.id));
  const aristas = new Set(state.graph.edges.map((edge) => edge.id));
  const selection =
    state.selection === null
      ? null
      : state.selection.kind === "node"
        ? nodos.has(state.selection.id)
          ? state.selection
          : null
        : aristas.has(state.selection.id)
          ? state.selection
          : null;
  return {
    ...state,
    selection,
    connectingFrom:
      state.connectingFrom && nodos.has(state.connectingFrom)
        ? state.connectingFrom
        : null,
    source: state.source && nodos.has(state.source) ? state.source : null,
    target: state.target && nodos.has(state.target) ? state.target : null,
  };
}

function restore(
  state: PlannerState,
  entrada: HistorySnapshot,
  history: PlannerState["history"],
): PlannerState {
  return sanitizeReferences({
    ...state,
    ...entrada,
    history,
    vista: entrada.graph.id !== state.graph.id ? state.vista + 1 : state.vista,
    ...RESULTADO_VACIO,
  });
}

function clampStep(state: PlannerState, index: number): number {
  const last = (state.result?.steps.length ?? 1) - 1;
  const entero = Number.isFinite(index) ? Math.round(index) : 0;
  return Math.max(0, Math.min(entero, Math.max(0, last)));
}

/** Clave del grupo de edición: mismo tipo, mismo elemento, mismos campos. */
function grupo(tipo: string, id: string, changes: object): string {
  return `${tipo}:${id}:${Object.keys(changes).sort().join(",")}`;
}

function sameWeights(a: EdgeWeights, b: EdgeWeights): boolean {
  return METRICS.every((m) => Object.is(a[m], b[m]));
}

/**
 * Valida lo que se leyó del almacenamiento local antes de meterlo al estado.
 *
 * Lo que hay en localStorage puede estar corrupto, a medias o venir de una
 * versión anterior; antes se volcaba tal cual y un `{"version":1}` sin grafo
 * dejaba la página rota en cada carga, sin forma de salir. Devuelve `null` si
 * el grafo no es válido: entonces se usan los valores por defecto.
 */
export function sanitizeSavedState(saved: Partial<PlannerState>): Partial<PlannerState> | null {
  let graph: Graph;
  try {
    graph = parseGraphObject(saved.graph);
  } catch {
    return null;
  }
  const ids = new Set(graph.nodes.map((node) => node.id));
  const counters = nextCounters(graph);
  const contador = (valor: unknown, minimo: number) =>
    Number.isInteger(valor) && (valor as number) >= 1
      ? Math.max(valor as number, minimo)
      : minimo;

  return {
    graph,
    scenarioId: typeof saved.scenarioId === "string" ? saved.scenarioId : "importado",
    metric: METRICS.includes(saved.metric as Metric) ? (saved.metric as Metric) : "cost",
    source: typeof saved.source === "string" && ids.has(saved.source) ? saved.source : null,
    target: typeof saved.target === "string" && ids.has(saved.target) ? saved.target : null,
    nextNodeNumber: contador(saved.nextNodeNumber, counters.node),
    nextEdgeNumber: contador(saved.nextEdgeNumber, counters.edge),
  };
}

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction,
): PlannerState {
  switch (action.type) {
    /* ---------------- Edición del grafo ---------------- */

    case "ADD_NODE": {
      const numero = freeNumber(
        "N",
        state.nextNodeNumber,
        new Set(state.graph.nodes.map((node) => node.id)),
      );
      const id = `N${numero}`;
      const posicion =
        action.x !== undefined && action.y !== undefined
          ? { x: action.x, y: action.y }
          : freePosition(state.graph);
      const node: GraphNode = {
        id,
        label: action.label?.trim() || `Punto ${numero}`,
        kind: action.kind ?? "delivery",
        x: Math.round(posicion.x),
        y: Math.round(posicion.y),
      };
      const next = withGraphEdit(state, {
        ...state.graph,
        nodes: [...state.graph.nodes, node],
      });
      return {
        ...next,
        nextNodeNumber: numero + 1,
        selection: { kind: "node", id },
        source: state.source ?? id,
      };
    }

    case "UPDATE_NODE": {
      const actual = state.graph.nodes.find((node) => node.id === action.id);
      if (!actual) return state;
      const cambia = (Object.keys(action.changes) as (keyof typeof action.changes)[]).some(
        (clave) => !Object.is(actual[clave], action.changes[clave]),
      );
      if (!cambia) return state;
      return withGraphEdit(
        state,
        {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === action.id ? { ...node, ...action.changes } : node,
          ),
        },
        grupo("UPDATE_NODE", action.id, action.changes),
      );
    }

    case "DELETE_NODE": {
      if (!state.graph.nodes.some((node) => node.id === action.id)) return state;
      // Borrar un nodo debe arrastrar sus aristas y limpiar todo lo que lo
      // referencie, en una sola transición.
      const incidentes = new Set(
        state.graph.edges
          .filter((edge) => edge.from === action.id || edge.to === action.id)
          .map((edge) => edge.id),
      );
      const next = withGraphEdit(state, {
        ...state.graph,
        nodes: state.graph.nodes.filter((node) => node.id !== action.id),
        edges: state.graph.edges.filter((edge) => !incidentes.has(edge.id)),
      });
      const seleccionBorrada =
        (state.selection?.kind === "node" && state.selection.id === action.id) ||
        (state.selection?.kind === "edge" && incidentes.has(state.selection.id));
      return {
        ...next,
        source: state.source === action.id ? null : state.source,
        target: state.target === action.id ? null : state.target,
        selection: seleccionBorrada ? null : state.selection,
        connectingFrom:
          state.connectingFrom === action.id ? null : state.connectingFrom,
      };
    }

    case "MOVE_NODE": {
      // Transitoria: la posición es cosmética, así que no invalida el
      // resultado ni entra al historial.
      return {
        ...state,
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === action.id
              ? { ...node, x: Math.round(action.x), y: Math.round(action.y) }
              : node,
          ),
        },
      };
    }

    case "COMMIT_MOVE": {
      const node = state.graph.nodes.find((n) => n.id === action.id);
      if (!node || (node.x === action.fromX && node.y === action.fromY)) {
        return state;
      }
      // Una sola entrada de historial por arrastre completo, no una por frame.
      const before: Graph = {
        ...state.graph,
        nodes: state.graph.nodes.map((n) =>
          n.id === action.id ? { ...n, x: action.fromX, y: action.fromY } : n,
        ),
      };
      return {
        ...state,
        history: {
          past: [...state.history.past, { ...snapshot(state), graph: before }].slice(
            -HISTORY_LIMIT,
          ),
          future: [],
          group: null,
        },
      };
    }

    case "ADD_EDGE": {
      const numero = freeNumber(
        "A",
        state.nextEdgeNumber,
        new Set(state.graph.edges.map((edge) => edge.id)),
      );
      const id = `A${numero}`;
      const label = action.label?.trim();
      const edge: GraphEdge = {
        id,
        from: action.from,
        to: action.to,
        directed: action.directed,
        weights: { ...action.weights },
        ...(label ? { label } : {}),
      };
      const next = withGraphEdit(state, {
        ...state.graph,
        edges: [...state.graph.edges, edge],
      });
      return {
        ...next,
        nextEdgeNumber: numero + 1,
        connectingFrom: null,
        selection: { kind: "edge", id },
      };
    }

    case "UPDATE_EDGE": {
      const actual = state.graph.edges.find((edge) => edge.id === action.id);
      if (!actual) return state;
      const cambia = (Object.keys(action.changes) as (keyof typeof action.changes)[]).some(
        (clave) =>
          clave === "weights"
            ? !sameWeights(actual.weights, action.changes.weights!)
            : !Object.is(actual[clave], action.changes[clave]),
      );
      if (!cambia) return state;
      return withGraphEdit(
        state,
        {
          ...state.graph,
          edges: state.graph.edges.map((edge) =>
            edge.id === action.id
              ? {
                  ...edge,
                  ...action.changes,
                  weights: action.changes.weights
                    ? { ...action.changes.weights }
                    : edge.weights,
                }
              : edge,
          ),
        },
        grupo("UPDATE_EDGE", action.id, action.changes),
      );
    }

    case "DELETE_EDGE": {
      if (!state.graph.edges.some((edge) => edge.id === action.id)) return state;
      const next = withGraphEdit(state, {
        ...state.graph,
        edges: state.graph.edges.filter((edge) => edge.id !== action.id),
      });
      return {
        ...next,
        selection:
          state.selection?.kind === "edge" && state.selection.id === action.id
            ? null
            : state.selection,
      };
    }

    case "REVERSE_EDGE": {
      if (!state.graph.edges.some((edge) => edge.id === action.id)) return state;
      return withGraphEdit(state, {
        ...state.graph,
        edges: state.graph.edges.map((edge) =>
          edge.id === action.id
            ? { ...edge, from: edge.to, to: edge.from }
            : edge,
        ),
      });
    }

    case "END_EDIT_GROUP":
      if (state.history.group === null) return state;
      return { ...state, history: { ...state.history, group: null } };

    /* ---------------- Selección y herramientas ---------------- */

    case "SET_TOOL":
      return {
        ...state,
        tool: action.tool,
        connectingFrom: action.tool === "connect" ? state.connectingFrom : null,
      };

    case "SELECT":
      return { ...state, selection: action.selection };

    case "START_CONNECT":
      return { ...state, connectingFrom: action.from, tool: "connect" };

    case "CANCEL_CONNECT":
      return { ...state, connectingFrom: null };

    case "SET_SOURCE":
      if (state.source === action.id) return state;
      return { ...state, source: action.id, ...RESULTADO_VACIO };

    case "SET_TARGET":
      if (state.target === action.id) return state;
      return { ...state, target: action.id, ...RESULTADO_VACIO };

    case "SWAP_ENDPOINTS":
      return {
        ...state,
        source: state.target,
        target: state.source,
        ...RESULTADO_VACIO,
      };

    case "SET_METRIC":
      if (state.metric === action.metric) return state;
      return { ...state, metric: action.metric, ...RESULTADO_VACIO };

    /* ---------------- Ejecución ---------------- */

    case "RUN_OK":
      return {
        ...state,
        // La ejecución puede haberse pedido con otra métrica (una fila de la
        // comparativa): el resultado manda.
        metric: action.result.metric,
        result: action.result,
        comparison: action.comparison,
        issues: action.result.issues,
        runState: "ready",
        // Se abre en el último paso, con la ruta ya resaltada en el mapa: eso
        // es lo que se pidió. Recorrer el algoritmo es exploración posterior,
        // y pulsar reproducir vuelve al principio por su cuenta.
        stepIndex: Math.max(0, action.result.steps.length - 1),
        isPlaying: false,
      };

    case "RUN_FAILED":
      return {
        ...state,
        metric: action.metric ?? state.metric,
        result: null,
        comparison: null,
        issues: action.issues,
        runState: "error",
        stepIndex: 0,
        isPlaying: false,
      };

    case "CLEAR_RESULT":
      return { ...state, ...RESULTADO_VACIO };

    case "STEP_NEXT": {
      const last = (state.result?.steps.length ?? 1) - 1;
      const index = clampStep(state, state.stepIndex + 1);
      // Al llegar al final la reproducción se detiene sola.
      return { ...state, stepIndex: index, isPlaying: index >= last ? false : state.isPlaying };
    }

    case "STEP_PREV":
      return { ...state, stepIndex: clampStep(state, state.stepIndex - 1), isPlaying: false };

    case "SEEK":
      return { ...state, stepIndex: clampStep(state, action.index), isPlaying: false };

    case "FIRST_STEP":
      return { ...state, stepIndex: 0, isPlaying: false };

    case "LAST_STEP":
      return {
        ...state,
        stepIndex: Math.max(0, (state.result?.steps.length ?? 1) - 1),
        isPlaying: false,
      };

    case "PLAY": {
      if (!state.result || state.result.steps.length === 0) return state;
      const last = state.result.steps.length - 1;
      // Pulsar reproducir al final vuelve a empezar.
      return {
        ...state,
        isPlaying: true,
        stepIndex: state.stepIndex >= last ? 0 : state.stepIndex,
      };
    }

    case "PAUSE":
      return { ...state, isPlaying: false };

    case "TOGGLE_PLAY":
      return state.isPlaying
        ? plannerReducer(state, { type: "PAUSE" })
        : plannerReducer(state, { type: "PLAY" });

    case "SET_SPEED":
      return { ...state, speed: action.speed };

    case "TOGGLE_TREE":
      return { ...state, showTree: !state.showTree };

    /* ---------------- Datos ---------------- */

    case "LOAD_SCENARIO": {
      // Volver a escoger el escenario que ya está cargado no hace nada: antes
      // lo recargaba y se perdían todos los cambios sin aviso.
      if (action.scenarioId === state.scenarioId) return state;
      return cargarEscenario(state, action.scenarioId);
    }

    case "RESET_SCENARIO": {
      // Recarga explícita del escenario activo; un grafo importado no tiene
      // estado inicial al que volver, y uno intacto no necesita historial.
      if (state.scenarioId === "importado" || isScenarioPristine(state)) {
        return state;
      }
      return cargarEscenario(state, state.scenarioId);
    }

    case "IMPORT_GRAPH": {
      const counters = nextCounters(action.graph);
      return {
        ...state,
        graph: action.graph,
        scenarioId: "importado",
        nextNodeNumber: counters.node,
        nextEdgeNumber: counters.edge,
        source: action.graph.nodes[0]?.id ?? null,
        target: action.graph.nodes.at(-1)?.id ?? null,
        selection: null,
        connectingFrom: null,
        ...RESULTADO_VACIO,
        history: {
          past: [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: [],
          group: null,
        },
        vista: state.vista + 1,
      };
    }

    case "CLEAR_GRAPH": {
      const next = withGraphEdit(state, {
        id: "vacio",
        name: "Red en blanco",
        description: "",
        nodes: [],
        edges: [],
      });
      return {
        ...next,
        source: null,
        target: null,
        selection: null,
        connectingFrom: null,
        nextNodeNumber: 1,
        nextEdgeNumber: 1,
        vista: state.vista + 1,
      };
    }

    case "UNDO": {
      const previous = state.history.past.at(-1);
      if (!previous) return state;
      return restore(state, previous, {
        past: state.history.past.slice(0, -1),
        future: [snapshot(state), ...state.history.future].slice(0, HISTORY_LIMIT),
        group: null,
      });
    }

    case "REDO": {
      const next = state.history.future[0];
      if (!next) return state;
      return restore(state, next, {
        past: [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.history.future.slice(1),
        group: null,
      });
    }

    case "HYDRATE": {
      const guardado = sanitizeSavedState(action.state);
      if (!guardado) return { ...state, hydrated: true };
      return { ...state, ...guardado, hydrated: true, vista: state.vista + 1 };
    }

    default:
      return state;
  }
}
