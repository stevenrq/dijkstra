"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import { compareMetrics, dijkstra, type DijkstraStep } from "@/lib/graph/dijkstra";
import { hasBlockingErrors, validateGraph } from "@/lib/graph/validation";
import type { Metric, NodeId } from "@/lib/graph/types";
import { usePlayback } from "@/hooks/use-playback";
import {
  initialState,
  plannerReducer,
  type PlannerAction,
  type PlannerState,
} from "./planner-reducer";

/* ------------------------------------------------------------------ *
 * Contextos separados
 *
 * El estado y el despachador viajan por contextos distintos para que los
 * componentes que solo despachan (barra de herramientas, botones) no se
 * re-rendericen cada vez que cambia el paso de la animación.
 * ------------------------------------------------------------------ */

const PlannerStateContext = createContext<PlannerState | null>(null);
const PlannerDispatchContext = createContext<Dispatch<PlannerAction> | null>(null);
const PlannerRunContext = createContext<(() => void) | null>(null);

const STORAGE_KEY = "rutaoptima-estado";
/** Subir esta versión invalida los estados guardados con datos antiguos. */
const STORAGE_VERSION = 1;

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(plannerReducer, undefined, () =>
    initialState(),
  );

  /**
   * Dijkstra se ejecuta aquí y no dentro del reductor: el reductor es puro,
   * pero StrictMode lo invoca dos veces en desarrollo y calcularía todo por
   * duplicado. El resultado entra al estado como un dato ya calculado.
   */
  const run = useCallback(() => {
    const { graph, source, target, metric } = state;
    if (!source) {
      dispatch({
        type: "RUN_FAILED",
        issues: [
          {
            code: "NO_SOURCE",
            severity: "error",
            message: "Escoge un punto de origen antes de calcular la ruta.",
          },
        ],
      });
      return;
    }

    const issues = validateGraph(graph, metric);
    if (hasBlockingErrors(issues)) {
      dispatch({ type: "RUN_FAILED", issues });
      return;
    }

    const result = dijkstra(graph, source, target, { metric });
    const comparison =
      target && result.reachable ? compareMetrics(graph, source, target) : null;
    dispatch({ type: "RUN_OK", result, comparison });
  }, [state]);

  const advance = useCallback(() => dispatch({ type: "STEP_NEXT" }), []);

  usePlayback({
    isPlaying: state.isPlaying,
    speed: state.speed,
    step: state.stepIndex,
    canAdvance: state.stepIndex < (state.result?.steps.length ?? 1) - 1,
    onTick: advance,
  });

  /* ---- Persistencia ----
   * Nunca se lee localStorage durante el render: el HTML del servidor no
   * puede verlo y React reportaría un error de hidratación. Se lee en un
   * efecto de montaje y se despacha HYDRATE. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        dispatch({ type: "HYDRATE", state: {} });
        return;
      }
      const parsed = JSON.parse(raw) as {
        version?: number;
      } & Partial<PlannerState>;
      if (parsed.version !== STORAGE_VERSION) {
        window.localStorage.removeItem(STORAGE_KEY);
        dispatch({ type: "HYDRATE", state: {} });
        return;
      }
      const saved = parsed;
      dispatch({
        type: "HYDRATE",
        state: {
          graph: saved.graph,
          scenarioId: saved.scenarioId,
          metric: saved.metric,
          source: saved.source,
          target: saved.target,
          nextNodeNumber: saved.nextNodeNumber,
          nextEdgeNumber: saved.nextEdgeNumber,
        },
      });
    } catch {
      dispatch({ type: "HYDRATE", state: {} });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: STORAGE_VERSION,
            graph: state.graph,
            scenarioId: state.scenarioId,
            metric: state.metric,
            source: state.source,
            target: state.target,
            nextNodeNumber: state.nextNodeNumber,
            nextEdgeNumber: state.nextEdgeNumber,
          }),
        );
      } catch {
        // Cuota llena o almacenamiento bloqueado: no es motivo para romper la app.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    state.hydrated,
    state.graph,
    state.scenarioId,
    state.metric,
    state.source,
    state.target,
    state.nextNodeNumber,
    state.nextEdgeNumber,
  ]);

  return (
    <PlannerStateContext.Provider value={state}>
      <PlannerDispatchContext.Provider value={dispatch}>
        <PlannerRunContext.Provider value={run}>
          {children}
        </PlannerRunContext.Provider>
      </PlannerDispatchContext.Provider>
    </PlannerStateContext.Provider>
  );
}

export function usePlanner(): PlannerState {
  const state = useContext(PlannerStateContext);
  if (!state) throw new Error("usePlanner debe usarse dentro de PlannerProvider");
  return state;
}

export function usePlannerDispatch(): Dispatch<PlannerAction> {
  const dispatch = useContext(PlannerDispatchContext);
  if (!dispatch)
    throw new Error("usePlannerDispatch debe usarse dentro de PlannerProvider");
  return dispatch;
}

export function useRunAlgorithm(): () => void {
  const run = useContext(PlannerRunContext);
  if (!run) throw new Error("useRunAlgorithm debe usarse dentro de PlannerProvider");
  return run;
}

/* ------------------------------------------------------------------ *
 * Estado visual derivado
 * ------------------------------------------------------------------ */

export type NodePhase = "pending" | "frontier" | "settled" | "current";

export interface NodeVisual {
  phase: NodePhase;
  onPath: boolean;
  isSource: boolean;
  isTarget: boolean;
  distance: number;
}

export type EdgePhase =
  | "idle"
  | "relaxing"
  | "improved"
  | "rejected"
  | "tree"
  | "path";

export interface GraphVisuals {
  step: DijkstraStep | null;
  nodes: Map<NodeId, NodeVisual>;
  edges: Map<string, EdgePhase>;
}

/**
 * Traduce el paso actual del algoritmo a estados de dibujo.
 *
 * Se calcula una vez por render y se reparte a los nodos y aristas como
 * primitivas, para que memoizarlos sirva de algo: el compilador de React no
 * está activo en este proyecto.
 */
export function useGraphVisuals(): GraphVisuals {
  const { graph, result, stepIndex, source, target, showTree, runState } =
    usePlanner();

  return useMemo(() => {
    const nodes = new Map<NodeId, NodeVisual>();
    const edges = new Map<string, EdgePhase>();

    const step =
      result && runState === "ready" ? (result.steps[stepIndex] ?? null) : null;

    for (const node of graph.nodes) {
      nodes.set(node.id, {
        phase: "pending",
        onPath: false,
        isSource: node.id === source,
        isTarget: node.id === target,
        distance: step ? (step.distances[node.id] ?? Infinity) : Infinity,
      });
    }

    if (!step) {
      for (const edge of graph.edges) edges.set(edge.id, "idle");
      return { step: null, nodes, edges };
    }

    const settled = new Set(step.settled);
    const inQueue = new Set(
      step.queue.filter((entry) => !entry.stale).map((entry) => entry.node),
    );

    for (const [id, visual] of nodes) {
      const phase: NodePhase = settled.has(id)
        ? "settled"
        : inQueue.has(id)
          ? "frontier"
          : "pending";
      nodes.set(id, { ...visual, phase });
    }

    if (step.currentNode && step.kind !== "done") {
      const current = nodes.get(step.currentNode);
      if (current) nodes.set(step.currentNode, { ...current, phase: "current" });
    }

    // Árbol de caminos mínimos construido hasta este paso.
    const treeEdges = new Set(
      Object.values(step.previousEdge).filter(
        (edgeId): edgeId is string => edgeId !== null,
      ),
    );

    for (const edge of graph.edges) {
      edges.set(
        edge.id,
        showTree && treeEdges.has(edge.id) ? "tree" : "idle",
      );
    }

    if (step.relaxation) {
      edges.set(
        step.relaxation.edgeId,
        step.relaxation.improved ? "improved" : "rejected",
      );
    }

    // En el último paso se resalta la ruta completa sobre todo lo demás.
    const isFinalStep = stepIndex === result!.steps.length - 1;
    if (isFinalStep && result!.path.length > 0) {
      for (const edgeId of result!.pathEdges) edges.set(edgeId, "path");
      for (const nodeId of result!.path) {
        const visual = nodes.get(nodeId);
        if (visual) nodes.set(nodeId, { ...visual, onPath: true });
      }
    }

    return { step, nodes, edges };
  }, [graph, result, stepIndex, source, target, showTree, runState]);
}

/** Métrica activa, para los componentes que solo necesitan formatear. */
export function useMetric(): Metric {
  return usePlanner().metric;
}
