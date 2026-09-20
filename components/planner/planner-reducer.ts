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
import { cloneGraph, DEFAULT_SCENARIO_ID, getScenario } from "@/lib/scenarios";

export type Tool = "select" | "add-node" | "connect" | "delete";
export type RunState = "idle" | "ready" | "error";
export type Speed = 0.5 | 1 | 2 | 4;

export type Selection =
  | { kind: "node"; id: NodeId }
  | { kind: "edge"; id: string }
  | null;

export interface PlannerState {
  graph: Graph;
  scenarioId: string;
  metric: Metric;
  source: NodeId | null;
  target: NodeId | null;
  /** Contadores puros: generar ids con crypto.randomUUID() dentro del reductor
   *  sería impuro y StrictMode lo ejecutaría dos veces en desarrollo. */
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

  history: { past: Graph[]; future: Graph[] };
  hydrated: boolean;
}

export type PlannerAction =
  // Edición del grafo
  | { type: "ADD_NODE"; x: number; y: number; label?: string; kind?: GraphNode["kind"] }
  | { type: "UPDATE_NODE"; id: NodeId; changes: Partial<Omit<GraphNode, "id">> }
  | { type: "DELETE_NODE"; id: NodeId }
  | { type: "MOVE_NODE"; id: NodeId; x: number; y: number }
  | { type: "COMMIT_MOVE"; id: NodeId; fromX: number; fromY: number }
  | { type: "ADD_EDGE"; from: NodeId; to: NodeId; weights: EdgeWeights; directed: boolean; label?: string }
  | { type: "UPDATE_EDGE"; id: string; changes: Partial<Omit<GraphEdge, "id">> }
  | { type: "DELETE_EDGE"; id: string }
  | { type: "REVERSE_EDGE"; id: string }
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
  | { type: "RUN_FAILED"; issues: ValidationIssue[] }
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
    history: { past: [], future: [] },
    hydrated: false,
  };
}

/**
 * Toda edición del grafo pasa por aquí: empuja el grafo anterior al historial
 * e invalida el resultado, porque un resultado calculado sobre otro grafo
 * mostraría una ruta que ya no existe.
 */
function withGraphEdit(state: PlannerState, graph: Graph): PlannerState {
  return {
    ...state,
    graph,
    history: {
      past: [...state.history.past, state.graph].slice(-HISTORY_LIMIT),
      future: [],
    },
    result: null,
    comparison: null,
    runState: "idle",
    issues: [],
    stepIndex: 0,
    isPlaying: false,
  };
}

function clampStep(state: PlannerState, index: number): number {
  const last = (state.result?.steps.length ?? 1) - 1;
  return Math.max(0, Math.min(index, Math.max(0, last)));
}

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction,
): PlannerState {
  switch (action.type) {
    /* ---------------- Edición del grafo ---------------- */

    case "ADD_NODE": {
      const id = `N${state.nextNodeNumber}`;
      const node: GraphNode = {
        id,
        label: action.label?.trim() || `Punto ${state.nextNodeNumber}`,
        kind: action.kind ?? "delivery",
        x: Math.round(action.x),
        y: Math.round(action.y),
      };
      const next = withGraphEdit(state, {
        ...state.graph,
        nodes: [...state.graph.nodes, node],
      });
      return {
        ...next,
        nextNodeNumber: state.nextNodeNumber + 1,
        selection: { kind: "node", id },
        source: state.source ?? id,
      };
    }

    case "UPDATE_NODE": {
      return withGraphEdit(state, {
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === action.id ? { ...node, ...action.changes } : node,
        ),
      });
    }

    case "DELETE_NODE": {
      // Borrar un nodo debe arrastrar sus aristas y limpiar todo lo que lo
      // referencie, en una sola transición.
      const next = withGraphEdit(state, {
        ...state.graph,
        nodes: state.graph.nodes.filter((node) => node.id !== action.id),
        edges: state.graph.edges.filter(
          (edge) => edge.from !== action.id && edge.to !== action.id,
        ),
      });
      return {
        ...next,
        source: state.source === action.id ? null : state.source,
        target: state.target === action.id ? null : state.target,
        selection:
          state.selection?.kind === "node" && state.selection.id === action.id
            ? null
            : state.selection,
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
          past: [...state.history.past, before].slice(-HISTORY_LIMIT),
          future: [],
        },
      };
    }

    case "ADD_EDGE": {
      const id = `A${state.nextEdgeNumber}`;
      const edge: GraphEdge = {
        id,
        from: action.from,
        to: action.to,
        directed: action.directed,
        weights: { ...action.weights },
        label: action.label?.trim() || undefined,
      };
      const next = withGraphEdit(state, {
        ...state.graph,
        edges: [...state.graph.edges, edge],
      });
      return {
        ...next,
        nextEdgeNumber: state.nextEdgeNumber + 1,
        connectingFrom: null,
        selection: { kind: "edge", id },
      };
    }

    case "UPDATE_EDGE": {
      return withGraphEdit(state, {
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
      });
    }

    case "DELETE_EDGE": {
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
      return withGraphEdit(state, {
        ...state.graph,
        edges: state.graph.edges.map((edge) =>
          edge.id === action.id
            ? { ...edge, from: edge.to, to: edge.from }
            : edge,
        ),
      });
    }

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
      return {
        ...state,
        source: action.id,
        result: null,
        comparison: null,
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };

    case "SET_TARGET":
      return {
        ...state,
        target: action.id,
        result: null,
        comparison: null,
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };

    case "SWAP_ENDPOINTS":
      return {
        ...state,
        source: state.target,
        target: state.source,
        result: null,
        comparison: null,
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };

    case "SET_METRIC":
      return {
        ...state,
        metric: action.metric,
        result: null,
        comparison: null,
        runState: "idle",
        issues: [],
        stepIndex: 0,
        isPlaying: false,
      };

    /* ---------------- Ejecución ---------------- */

    case "RUN_OK":
      return {
        ...state,
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
        result: null,
        comparison: null,
        issues: action.issues,
        runState: "error",
        stepIndex: 0,
        isPlaying: false,
      };

    case "CLEAR_RESULT":
      return {
        ...state,
        result: null,
        comparison: null,
        issues: [],
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };

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
      const fresh = initialState(action.scenarioId);
      return { ...fresh, metric: state.metric, speed: state.speed, hydrated: true };
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
        result: null,
        comparison: null,
        issues: [],
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
        history: { past: [...state.history.past, state.graph].slice(-HISTORY_LIMIT), future: [] },
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
      };
    }

    case "UNDO": {
      const previous = state.history.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        graph: previous,
        history: {
          past: state.history.past.slice(0, -1),
          future: [state.graph, ...state.history.future].slice(0, HISTORY_LIMIT),
        },
        result: null,
        comparison: null,
        issues: [],
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };
    }

    case "REDO": {
      const next = state.history.future[0];
      if (!next) return state;
      return {
        ...state,
        graph: next,
        history: {
          past: [...state.history.past, state.graph].slice(-HISTORY_LIMIT),
          future: state.history.future.slice(1),
        },
        result: null,
        comparison: null,
        issues: [],
        runState: "idle",
        stepIndex: 0,
        isPlaying: false,
      };
    }

    case "HYDRATE":
      return { ...state, ...action.state, hydrated: true };

    default:
      return state;
  }
}
