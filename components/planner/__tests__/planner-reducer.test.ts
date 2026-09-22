import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  initialState,
  isScenarioPristine,
  plannerReducer,
  type PlannerAction,
  type PlannerState,
} from "../planner-reducer";
import { solveRoute } from "../../../lib/graph/route-sheet";
import { getScenario, SCENARIOS } from "../../../lib/scenarios/index";

const aplicar = (state: PlannerState, ...acciones: PlannerAction[]) =>
  acciones.reduce(plannerReducer, state);

const colombia = () => aplicar(initialState(), { type: "HYDRATE", state: {} });
const vacio = () => aplicar(colombia(), { type: "LOAD_SCENARIO", scenarioId: "vacio" });
const ids = (s: PlannerState) => s.graph.nodes.map((n) => n.id);
const unicos = (lista: string[]) => new Set(lista).size === lista.length;

function conResultado(state: PlannerState): PlannerState {
  const solucion = solveRoute(state.graph, state.source, state.target, state.metric);
  assert.ok(solucion.ok);
  return plannerReducer(state, { type: "RUN_OK", result: solucion.result, comparison: solucion.comparison });
}

describe("Reductor — identificadores únicos", () => {
  it("Agregar → Vaciar → Deshacer → Agregar no repite N1", () => {
    const s = aplicar(
      vacio(),
      { type: "ADD_NODE", x: 0, y: 0 },
      { type: "CLEAR_GRAPH" },
      { type: "UNDO" },
      { type: "ADD_NODE", x: 100, y: 0 },
    );
    assert.deepEqual(ids(s), ["N1", "N2"]);
  });

  it("Importar → Deshacer → Agregar no repite ids", () => {
    const importado = { ...getScenario("academico-clrs").graph, nodes: [
      ...getScenario("academico-clrs").graph.nodes,
      { id: "N7", label: "N7", kind: "hub" as const, x: 0, y: 0 },
    ] };
    let s = aplicar(vacio(), { type: "ADD_NODE", x: 0, y: 0 }, { type: "ADD_NODE", x: 90, y: 0 });
    s = aplicar(s, { type: "IMPORT_GRAPH", graph: importado }, { type: "UNDO" }, { type: "ADD_NODE", x: 200, y: 0 });
    assert.ok(unicos(ids(s)), ids(s).join(","));
  });

  it("un grafo importado que ya trae N7 no recibe otro N7", () => {
    const g = { id: "g", name: "g", description: "", nodes: [{ id: "N7", label: "x", kind: "hub" as const, x: 0, y: 0 }], edges: [] };
    const s = aplicar(colombia(), { type: "IMPORT_GRAPH", graph: g }, { type: "ADD_NODE", x: 10, y: 10 });
    assert.ok(unicos(ids(s)));
  });

  it("las aristas tampoco repiten ids", () => {
    const pesos = { cost: 1, distance: 1, time: 1 };
    let s = aplicar(vacio(), { type: "ADD_NODE", x: 0, y: 0 }, { type: "ADD_NODE", x: 90, y: 0 });
    s = aplicar(s,
      { type: "ADD_EDGE", from: "N1", to: "N2", weights: pesos, directed: false },
      { type: "CLEAR_GRAPH" },
      { type: "UNDO" },
      { type: "ADD_EDGE", from: "N2", to: "N1", weights: pesos, directed: true },
    );
    assert.ok(unicos(s.graph.edges.map((e) => e.id)));
  });

  it("sin coordenadas, el punto nuevo cae en un sitio libre", () => {
    const s = aplicar(colombia(), { type: "ADD_NODE" });
    const nuevo = s.graph.nodes.at(-1)!;
    assert.ok(Number.isFinite(nuevo.x) && Number.isFinite(nuevo.y));
    assert.ok(s.graph.nodes.slice(0, -1).every((n) => Math.hypot(n.x - nuevo.x, n.y - nuevo.y) > 80));
  });
});

describe("Reductor — deshacer restaura todo lo que hace falta", () => {
  it("borrar el origen y deshacer devuelve el origen", () => {
    const s = aplicar(colombia(), { type: "DELETE_NODE", id: "bog" }, { type: "UNDO" });
    assert.equal(s.source, "bog");
    assert.equal(s.target, "ctg");
    assert.equal(s.graph.nodes.length, 20);
  });

  it("importar y deshacer devuelve extremos y escenario", () => {
    const s = aplicar(
      colombia(),
      { type: "IMPORT_GRAPH", graph: getScenario("academico-clrs").graph },
      { type: "UNDO" },
    );
    assert.equal(s.scenarioId, "colombia");
    assert.equal(s.source, "bog");
    assert.equal(s.target, "ctg");
  });

  it("deshacer un punto nuevo limpia la selección que apuntaba a él", () => {
    const s = aplicar(colombia(), { type: "ADD_NODE", x: 1, y: 1 }, { type: "UNDO" });
    assert.equal(s.selection, null);
  });

  it("deshacer no deja una conexión a medias hacia un punto inexistente", () => {
    const s = aplicar(
      colombia(),
      { type: "ADD_NODE", x: 1, y: 1 },
      { type: "START_CONNECT", from: "N1" },
      { type: "UNDO" },
    );
    assert.equal(s.connectingFrom, null);
  });

  it("rehacer es simétrico", () => {
    const s = aplicar(colombia(), { type: "DELETE_NODE", id: "bog" }, { type: "UNDO" }, { type: "REDO" });
    assert.equal(s.source, null);
    assert.equal(s.graph.nodes.length, 19);
  });

  it("deshacer entre grafos distintos pide reencuadrar", () => {
    const antes = colombia();
    const s = aplicar(antes, { type: "CLEAR_GRAPH" }, { type: "UNDO" });
    assert.ok(s.vista > antes.vista + 1);
  });
});

describe("Reductor — acciones sin efecto", () => {
  it("borrar algo que no existe no toca el estado", () => {
    const s = colombia();
    assert.equal(plannerReducer(s, { type: "DELETE_NODE", id: "zzz" }), s);
    assert.equal(plannerReducer(s, { type: "DELETE_EDGE", id: "zzz" }), s);
    assert.equal(plannerReducer(s, { type: "UPDATE_NODE", id: "zzz", changes: { label: "x" } }), s);
    assert.equal(plannerReducer(s, { type: "REVERSE_EDGE", id: "zzz" }), s);
  });

  it("borrar dos veces el mismo punto se deshace con un solo paso", () => {
    const s = aplicar(colombia(), { type: "DELETE_NODE", id: "bog" }, { type: "DELETE_NODE", id: "bog" }, { type: "UNDO" });
    assert.equal(s.graph.nodes.length, 20);
  });

  it("borrar un punto deselecciona la arista suya que estaba seleccionada", () => {
    const s = aplicar(
      colombia(),
      { type: "SELECT", selection: { kind: "edge", id: "bog-tun" } },
      { type: "DELETE_NODE", id: "tun" },
    );
    assert.equal(s.selection, null);
  });

  it("escribir el mismo valor no crea historial", () => {
    const s = colombia();
    assert.equal(plannerReducer(s, { type: "UPDATE_NODE", id: "bog", changes: { label: "Bogotá D.C." } }), s);
  });

  it("la misma métrica no borra el resultado", () => {
    const s = conResultado(colombia());
    assert.equal(plannerReducer(s, { type: "SET_METRIC", metric: "cost" }), s);
  });

  it("reelegir el escenario cargado no pierde los cambios", () => {
    const s = aplicar(colombia(), { type: "UPDATE_NODE", id: "bog", changes: { label: "Bogotá Centro" } });
    assert.equal(plannerReducer(s, { type: "LOAD_SCENARIO", scenarioId: "colombia" }), s);
  });

  it("restablecer un escenario intacto no crea historial", () => {
    const s = colombia();
    assert.equal(plannerReducer(s, { type: "RESET_SCENARIO" }), s);
  });
});

describe("Reductor — agrupación de ediciones", () => {
  it("38 pulsaciones al renombrar se deshacen de una vez", () => {
    let s = colombia();
    const final = "Cartagena Puerto de la Costa Caribe N";
    for (let i = "Cartagena".length + 1; i <= final.length; i++) {
      s = plannerReducer(s, { type: "UPDATE_NODE", id: "ctg", changes: { label: final.slice(0, i) } });
    }
    assert.equal(s.history.past.length, 1);
    s = plannerReducer(s, { type: "UNDO" });
    assert.equal(s.graph.nodes.find((n) => n.id === "ctg")!.label, "Cartagena");
  });

  it("otro punto u otro campo abren una entrada nueva", () => {
    const s = aplicar(
      colombia(),
      { type: "UPDATE_NODE", id: "ctg", changes: { label: "C1" } },
      { type: "UPDATE_NODE", id: "bog", changes: { label: "B1" } },
      { type: "UPDATE_EDGE", id: "bog-tun", changes: { weights: { cost: 1, distance: 145, time: 3 } } },
      { type: "UPDATE_EDGE", id: "bog-tun", changes: { directed: true } },
    );
    assert.equal(s.history.past.length, 4);
  });

  it("salir del campo cierra el grupo", () => {
    const s = aplicar(
      colombia(),
      { type: "UPDATE_NODE", id: "ctg", changes: { label: "C1" } },
      { type: "END_EDIT_GROUP" },
      { type: "UPDATE_NODE", id: "ctg", changes: { label: "C2" } },
    );
    assert.equal(s.history.past.length, 2);
  });
});

describe("Reductor — escenarios", () => {
  it("cambiar de escenario se puede deshacer y conserva el árbol", () => {
    let s = aplicar(colombia(), { type: "TOGGLE_TREE" }, { type: "LOAD_SCENARIO", scenarioId: "academico-clrs" });
    assert.equal(s.graph.nodes.length, 5);
    assert.equal(s.showTree, true);
    s = plannerReducer(s, { type: "UNDO" });
    assert.equal(s.scenarioId, "colombia");
    assert.equal(s.graph.nodes.length, 20);
    assert.equal(s.source, "bog");
  });
});

describe("Reductor — restablecer escenario", () => {
  it("devuelve cada escenario a su estado inicial y se puede deshacer", () => {
    for (const { id } of SCENARIOS) {
      const base = aplicar(colombia(), { type: "LOAD_SCENARIO", scenarioId: id });
      const editado = aplicar(base, { type: "ADD_NODE", x: 10, y: 10 }, { type: "SET_SOURCE", id: null });
      assert.equal(isScenarioPristine(editado), false);
      const restablecido = plannerReducer(editado, { type: "RESET_SCENARIO" });
      assert.equal(isScenarioPristine(restablecido), true);
      assert.deepEqual(restablecido.graph, getScenario(id).graph);
      assert.equal(restablecido.scenarioId, id);
      assert.deepEqual(plannerReducer(restablecido, { type: "UNDO" }).graph, editado.graph);
    }
  });

  it("no hace nada con un grafo importado", () => {
    const s = aplicar(colombia(), { type: "IMPORT_GRAPH", graph: getScenario("academico-clrs").graph });
    assert.equal(plannerReducer(s, { type: "RESET_SCENARIO" }), s);
  });
});

describe("Reductor — reproducción", () => {
  it("SEEK se ajusta al rango y a enteros", () => {
    const s = conResultado(colombia());
    const ultimo = s.result!.steps.length - 1;
    assert.equal(plannerReducer(s, { type: "SEEK", index: -5 }).stepIndex, 0);
    assert.equal(plannerReducer(s, { type: "SEEK", index: 1e6 }).stepIndex, ultimo);
    assert.equal(plannerReducer(s, { type: "SEEK", index: NaN }).stepIndex, 0);
    assert.equal(plannerReducer(s, { type: "SEEK", index: 3.7 }).stepIndex, 4);
    assert.equal(plannerReducer(colombia(), { type: "SEEK", index: 9 }).stepIndex, 0);
  });

  it("al final, avanzar detiene y reproducir vuelve a empezar", () => {
    let s = aplicar(conResultado(colombia()), { type: "PLAY" });
    assert.equal(s.stepIndex, 0);
    assert.equal(s.isPlaying, true);
    s = aplicar(s, { type: "LAST_STEP" }, { type: "PLAY" });
    assert.equal(s.stepIndex, 0);
    s = aplicar(s, { type: "SEEK", index: s.result!.steps.length - 2 }, { type: "PLAY" });
    assert.equal(s.isPlaying, true);
    s = plannerReducer(s, { type: "STEP_NEXT" });
    assert.equal(s.stepIndex, s.result!.steps.length - 1);
    assert.equal(s.isPlaying, false);
    assert.equal(plannerReducer(s, { type: "TOGGLE_PLAY" }).isPlaying, true);
  });

  it("RUN_OK adopta la métrica del resultado", () => {
    const s = colombia();
    const solucion = solveRoute(s.graph, "bog", "ctg", "distance");
    assert.ok(solucion.ok);
    const t = plannerReducer(s, { type: "RUN_OK", result: solucion.result, comparison: solucion.comparison });
    assert.equal(t.metric, "distance");
  });
});

describe("Reductor — estado guardado", () => {
  it("un estado sin grafo vuelve a los valores por defecto", () => {
    const s = plannerReducer(initialState(), { type: "HYDRATE", state: { version: 1 } as never });
    assert.equal(s.graph.nodes.length, 20);
    assert.equal(s.hydrated, true);
  });

  it("una métrica inválida vuelve a costo", () => {
    const s = plannerReducer(initialState(), {
      type: "HYDRATE",
      state: { graph: getScenario("colombia").graph, metric: "nave" as never },
    });
    assert.equal(s.metric, "cost");
  });

  it("un origen que no existe queda vacío", () => {
    const s = plannerReducer(initialState(), {
      type: "HYDRATE",
      state: { graph: getScenario("academico-clrs").graph, source: "bog", target: "C" },
    });
    assert.equal(s.source, null);
    assert.equal(s.target, "C");
  });

  it("un grafo guardado con un peso negativo se respeta", () => {
    const g = structuredClone(getScenario("colombia").graph);
    g.edges[0].weights.cost = -1;
    const s = plannerReducer(initialState(), { type: "HYDRATE", state: { graph: g, scenarioId: "colombia" } });
    assert.equal(s.graph.edges[0].weights.cost, -1);
  });

  it("un grafo guardado malformado vuelve a los valores por defecto", () => {
    const s = plannerReducer(initialState(), {
      type: "HYDRATE",
      state: { graph: { nodes: [{ id: "A" }], edges: [] } as never },
    });
    assert.equal(s.graph.nodes.length, 20);
  });
});
