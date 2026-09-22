import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GraphParseError, parseGraph, serializeGraph } from "../serialization";
import type { Graph } from "../types";
import { SCENARIOS, cloneGraph } from "../../scenarios/index";

/** Lo que de verdad viaja en el archivo: JSON no conserva las claves `undefined`. */
const comoJson = (g: Graph) => JSON.parse(JSON.stringify(g));

function base() {
  return {
    version: 1,
    graph: {
      id: "prueba",
      name: "Prueba",
      description: "",
      nodes: [
        { id: "A", label: "A", kind: "hub", x: 0, y: 0 },
        { id: "B", label: "B", kind: "port", x: 100, y: 0 },
      ] as Record<string, unknown>[],
      edges: [
        { id: "A-B", from: "A", to: "B", directed: false, weights: { cost: 1, distance: 2, time: 3 } },
      ] as Record<string, unknown>[],
    },
  };
}

function rechaza(datos: unknown, mensaje: RegExp) {
  const texto = typeof datos === "string" ? datos : JSON.stringify(datos);
  assert.throws(() => parseGraph(texto), (error: unknown) => {
    assert.ok(error instanceof GraphParseError, "debe ser GraphParseError");
    assert.match((error as Error).message, mensaje);
    return true;
  });
}

describe("Importación: lo que se rechaza", () => {
  it("JSON inválido", () => rechaza("{no es json", /JSON válido/));
  it("no es un objeto", () => rechaza("[1,2]", /objeto JSON/));
  it("null", () => rechaza("null", /objeto JSON/));
  it("sin arreglos", () => rechaza({ graph: { nodes: {} } }, /"nodes" y "edges"/));
  it("versión desconocida", () => rechaza({ ...base(), version: 2 }, /versión 2/));

  it("nodo que no es objeto", () => {
    const d = base();
    d.graph.nodes = [5 as unknown as Record<string, unknown>];
    rechaza(d, /nodo #1 no es un objeto/);
  });
  it("id vacío o con espacios", () => {
    const d = base();
    d.graph.nodes[0].id = "  ";
    rechaza(d, /identificador/);
    const e = base();
    e.graph.nodes[0].id = " A";
    rechaza(e, /espacios/);
  });
  for (const reservado of ["__proto__", "constructor", "prototype"]) {
    it(`id reservado «${reservado}»`, () => {
      rechaza(
        `{"graph":{"nodes":[{"id":"${reservado}","label":"X","kind":"hub","x":0,"y":0}],"edges":[]}}`,
        /no se puede usar/,
      );
    });
  }
  it("nombre vacío", () => {
    const d = base();
    d.graph.nodes[0].label = "   ";
    rechaza(d, /label/);
  });
  it("tipo de nodo desconocido", () => {
    const d = base();
    d.graph.nodes[0].kind = "nave";
    rechaza(d, /tipo desconocido/);
  });
  it("coordenada no finita o fuera de rango", () => {
    const d = base();
    d.graph.nodes[0].x = "3";
    rechaza(d, /número finito/);
    const e = base();
    e.graph.nodes[0].x = 1e308;
    rechaza(e, /fuera de rango/);
  });
  it("ids de nodo repetidos", () => {
    const d = base();
    d.graph.nodes[1].id = "A";
    d.graph.edges = [];
    rechaza(d, /nodo repetidos/);
  });
  it("arista hacia un nodo inexistente", () => {
    const d = base();
    d.graph.edges[0].to = "Z";
    rechaza(d, /no existen/);
  });
  it("arista sin pesos o con un peso que no es número", () => {
    const d = base();
    delete d.graph.edges[0].weights;
    rechaza(d, /no tiene pesos/);
    const e = base();
    e.graph.edges[0].weights = { cost: "5", distance: 1, time: 1 };
    rechaza(e, /número finito/);
    const f = base();
    f.graph.edges[0].weights = { cost: 1e13, distance: 1, time: 1 };
    rechaza(f, /fuera de rango/);
  });
  it("«directed» que no es booleano", () => {
    const d = base();
    d.graph.edges[0].directed = "true";
    rechaza(d, /true o false/);
  });
  it("ids de arista repetidos", () => {
    const d = base();
    d.graph.edges.push({ ...d.graph.edges[0] });
    rechaza(d, /arista repetidos/);
  });
  it("más de 200 puntos", () => {
    const d = base();
    d.graph.nodes = Array.from({ length: 201 }, (_, i) => ({ id: `n${i}`, label: `n${i}`, kind: "hub", x: i, y: 0 }));
    d.graph.edges = [];
    rechaza(d, /máximo es 200/);
  });
  it("más de 1000 corredores", () => {
    const d = base();
    d.graph.edges = Array.from({ length: 1001 }, (_, i) => ({
      id: `e${i}`, from: "A", to: "B", directed: true, weights: { cost: 1, distance: 1, time: 1 },
    }));
    rechaza(d, /máximo es 1000/);
  });
});

describe("Importación: lo que se acepta", () => {
  it("pesos negativos: se bloquean al calcular, no al importar", () => {
    const d = base();
    d.graph.edges[0].weights = { cost: -5, distance: 1, time: -0.5 };
    const g = parseGraph(JSON.stringify(d));
    assert.equal(g.edges[0].weights.cost, -5);
  });
  it("grafo suelto, sin el envoltorio", () => {
    const g = parseGraph(JSON.stringify(base().graph));
    assert.equal(g.nodes.length, 2);
  });
  it("sin tipo de nodo: cruce vial", () => {
    const d = base();
    delete d.graph.nodes[0].kind;
    assert.equal(parseGraph(JSON.stringify(d)).nodes[0].kind, "junction");
  });
  it("sin «directed»: doble sentido", () => {
    const d = base();
    delete d.graph.edges[0].directed;
    assert.equal(parseGraph(JSON.stringify(d)).edges[0].directed, false);
  });
  it("−0 vuelve como 0", () => {
    const g = parseGraph('{"graph":{"nodes":[{"id":"A","label":"A","x":-0,"y":0}],"edges":[]}}');
    assert.ok(Object.is(g.nodes[0].x, 0));
  });
});

describe("Ida y vuelta exacta", () => {
  for (const escenario of SCENARIOS) {
    it(`escenario «${escenario.name}»`, () => {
      const g = escenario.graph;
      assert.deepEqual(parseGraph(serializeGraph(g)), comoJson(g));
    });
  }

  it("un grafo armado con el editor, con acentos, ceros, decimales y negativos", () => {
    const g = cloneGraph(SCENARIOS[0].graph);
    g.nodes[0].label = "Bogotá — Muña ñ";
    g.nodes.push({ id: "N1", label: "Punto 1", kind: "delivery", x: -40, y: 12 });
    g.edges.push({
      id: "A1",
      from: "N1",
      to: g.nodes[0].id,
      directed: true,
      weights: { cost: 0, distance: 12.7, time: -0.5 },
      label: undefined,
    });
    g.edges[0].weights.cost = -1;
    assert.deepEqual(parseGraph(serializeGraph(g)), comoJson(g));
  });
});
