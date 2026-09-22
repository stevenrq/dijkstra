import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRouteLegs, solveRoute } from "../route-sheet";
import { METRICS } from "../types";
import { cloneGraph, getScenario } from "../../scenarios/index";

const colombia = getScenario("colombia").graph;

describe("Hoja de ruta", () => {
  for (const metric of METRICS) {
    it(`los tramos de Bogotá → Cartagena suman el total (${metric})`, () => {
      const solucion = solveRoute(colombia, "bog", "ctg", metric);
      assert.ok(solucion.ok);
      const { result } = solucion;
      const legs = buildRouteLegs(colombia, result);
      assert.equal(legs.length, result.path.length - 1);
      assert.ok(Math.abs(legs.at(-1)!.accumulated - result.total) < 1e-9);
      for (const m of METRICS) {
        const suma = legs.reduce((acc, leg) => acc + leg.edge.weights[m], 0);
        assert.ok(Math.abs(suma - result.totalsByMetric[m]) < 1e-9);
      }
      legs.forEach((leg, i) => {
        assert.equal(leg.from, result.path[i]);
        assert.equal(leg.to, result.path[i + 1]);
      });
    });
  }

  it("origen igual al destino: ningún tramo", () => {
    const solucion = solveRoute(colombia, "bog", "bog", "cost");
    assert.ok(solucion.ok);
    assert.deepEqual(buildRouteLegs(colombia, solucion.result), []);
  });
});

describe("Resolver la ruta", () => {
  it("sin destino no se calcula", () => {
    const solucion = solveRoute(colombia, "bog", null, "cost");
    assert.ok(!solucion.ok);
    assert.deepEqual(solucion.issues.map((i) => i.code), ["NO_TARGET"]);
  });

  it("con un origen que no existe no se calcula", () => {
    const solucion = solveRoute(colombia, "zzz", "ctg", "cost");
    assert.ok(!solucion.ok);
    assert.deepEqual(solucion.issues.map((i) => i.code), ["NO_SOURCE"]);
  });

  it("un peso negativo en la métrica elegida bloquea", () => {
    const g = cloneGraph(colombia);
    g.edges[0].weights.cost = -1;
    const solucion = solveRoute(g, "bog", "ctg", "cost");
    assert.ok(!solucion.ok);
    assert.ok(solucion.issues.some((i) => i.code === "NEGATIVE_WEIGHT"));
  });

  it("un peso negativo en otra métrica no bloquea, y su comparación lo explica", () => {
    const g = cloneGraph(colombia);
    g.edges.find((e) => e.id === "ctg-baq")!.weights.time = -0.5;
    const solucion = solveRoute(g, "bog", "ctg", "cost");
    assert.ok(solucion.ok);
    assert.equal(solucion.result.total, 5_430_000);
    assert.ok(solucion.comparison);
    assert.ok(solucion.comparison.time.issues.some((i) => i.code === "NEGATIVE_WEIGHT"));
    assert.equal(solucion.comparison.time.reachable, false);
    assert.equal(solucion.comparison.distance.total, 990);
  });

  it("sin ruta no hay comparación", () => {
    const solucion = solveRoute(getScenario("academico-desconectado").graph, "A", "F", "cost");
    assert.ok(solucion.ok);
    assert.equal(solucion.result.reachable, false);
    assert.equal(solucion.comparison, null);
  });
});
