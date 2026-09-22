import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateEndpoints, validateGraph } from "../validation";
import type { Graph, GraphEdge } from "../types";
import { getScenario } from "../../scenarios/index";

function grafo(edges: GraphEdge[], ids = ["A", "B"]): Graph {
  return {
    id: "g",
    name: "g",
    description: "",
    nodes: ids.map((id, i) => ({ id, label: id, kind: "hub", x: i * 100, y: 0 })),
    edges,
  };
}

function arista(id: string, from: string, to: string, directed: boolean, peso = 1): GraphEdge {
  return { id, from, to, directed, weights: { cost: peso, distance: peso, time: peso } };
}

const codigos = (g: Graph, metric: "cost" | "distance" | "time" = "cost") =>
  validateGraph(g, metric).map((i) => i.code);

describe("Validación del grafo", () => {
  it("grafo vacío", () => {
    const issues = validateGraph(getScenario("vacio").graph, "cost");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "EMPTY_GRAPH");
    assert.equal(issues[0].severity, "error");
  });

  it("arista colgante", () => {
    assert.deepEqual(codigos(grafo([arista("x", "A", "Z", true)])), ["DANGLING_EDGE"]);
  });

  it("peso no finito", () => {
    const g = grafo([arista("x", "A", "B", true)]);
    g.edges[0].weights.cost = NaN;
    assert.deepEqual(codigos(g), ["NON_FINITE_WEIGHT"]);
    g.edges[0].weights.cost = Infinity;
    assert.deepEqual(codigos(g), ["NON_FINITE_WEIGHT"]);
  });

  it("peso negativo, con la explicación de Bellman-Ford", () => {
    const g = grafo([arista("x", "A", "B", true, -2)]);
    const [issue] = validateGraph(g, "distance");
    assert.equal(issue.code, "NEGATIVE_WEIGHT");
    assert.equal(issue.severity, "error");
    assert.match(issue.message, /Bellman-Ford/);
  });

  it("un peso negativo en otra métrica no bloquea la métrica elegida", () => {
    const g = grafo([arista("x", "A", "B", true)]);
    g.edges[0].weights.time = -0.5;
    assert.deepEqual(codigos(g, "cost"), []);
    assert.deepEqual(codigos(g, "time"), ["NEGATIVE_WEIGHT"]);
  });

  it("lazo: advertencia, no error", () => {
    const issues = validateGraph(grafo([arista("x", "A", "A", true)]), "cost");
    assert.equal(issues[0].code, "SELF_LOOP");
    assert.equal(issues[0].severity, "warning");
  });

  it("aristas paralelas", () => {
    // Dos de doble sentido sobre el mismo par.
    assert.deepEqual(codigos(grafo([arista("1", "A", "B", false), arista("2", "B", "A", false)])), ["PARALLEL_EDGE"]);
    // Dos de sentido único en la misma dirección.
    assert.deepEqual(codigos(grafo([arista("1", "A", "B", true), arista("2", "A", "B", true)])), ["PARALLEL_EDGE"]);
    // Un sentido único junto a un doble sentido: los dos ofrecen A→B.
    assert.deepEqual(codigos(grafo([arista("1", "A", "B", false), arista("2", "A", "B", true)])), ["PARALLEL_EDGE"]);
    assert.deepEqual(codigos(grafo([arista("1", "A", "B", true), arista("2", "B", "A", false)])), ["PARALLEL_EDGE"]);
    // Dos sentidos únicos opuestos no son paralelos: son la ida y la vuelta.
    assert.deepEqual(codigos(grafo([arista("1", "A", "B", true), arista("2", "B", "A", true)])), []);
  });

  it("el escenario de paralelas avisa, y el de Colombia no", () => {
    assert.ok(codigos(getScenario("academico-paralelas").graph).includes("PARALLEL_EDGE"));
    assert.deepEqual(codigos(getScenario("colombia").graph), []);
  });
});

describe("Origen y destino", () => {
  const g = grafo([]);
  it("ambos presentes", () => {
    assert.deepEqual(validateEndpoints(g, "A", "B"), []);
    assert.deepEqual(validateEndpoints(g, "A", "A"), []);
  });
  it("sin origen", () => {
    assert.deepEqual(validateEndpoints(g, null, "B").map((i) => i.code), ["NO_SOURCE"]);
    assert.deepEqual(validateEndpoints(g, "Z", "B").map((i) => i.code), ["NO_SOURCE"]);
  });
  it("sin destino", () => {
    assert.deepEqual(validateEndpoints(g, "A", null).map((i) => i.code), ["NO_TARGET"]);
    assert.deepEqual(validateEndpoints(g, "A", "Z").map((i) => i.code), ["NO_TARGET"]);
  });
});
