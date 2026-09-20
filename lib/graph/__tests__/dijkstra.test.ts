import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dijkstra, compareMetrics } from "../dijkstra";
import { MinHeap } from "../min-heap";
import { buildAdjacency } from "../adjacency";
import { validateGraph } from "../validation";
import type { Graph, Metric } from "../types";
import { getScenario, cloneGraph } from "../../scenarios/index";

const clrs = getScenario("academico-clrs").graph;
const parallel = getScenario("academico-paralelas").graph;
const disconnected = getScenario("academico-desconectado").graph;
const colombia = getScenario("colombia").graph;

const opts = { metric: "distance" as Metric };

describe("MinHeap", () => {
  it("extrae siempre el mínimo", () => {
    const heap = new MinHeap<string>();
    for (const [p, v] of [
      [5, "e"],
      [1, "a"],
      [4, "d"],
      [2, "b"],
      [3, "c"],
    ] as const) {
      heap.push(p, v);
    }
    const out: string[] = [];
    while (!heap.isEmpty()) out.push(heap.pop()!.value);
    assert.deepEqual(out, ["a", "b", "c", "d", "e"]);
  });

  it("desempata por orden de inserción, de forma determinista", () => {
    const heap = new MinHeap<string>();
    heap.push(1, "primero");
    heap.push(1, "segundo");
    heap.push(1, "tercero");
    assert.equal(heap.pop()!.value, "primero");
    assert.equal(heap.pop()!.value, "segundo");
    assert.equal(heap.pop()!.value, "tercero");
  });

  it("construye en O(n) desde un arreglo inicial", () => {
    const heap = new MinHeap<number>(
      [9, 3, 7, 1, 8, 2].map((n) => ({ priority: n, value: n })),
    );
    const out: number[] = [];
    while (!heap.isEmpty()) out.push(heap.pop()!.value);
    assert.deepEqual(out, [1, 2, 3, 7, 8, 9]);
  });

  it("toSortedArray no muta el montículo", () => {
    const heap = new MinHeap<number>();
    [4, 1, 3].forEach((n) => heap.push(n, n));
    const snapshot = heap.toSortedArray().map((e) => e.value);
    assert.deepEqual(snapshot, [1, 3, 4]);
    assert.equal(heap.size, 3);
  });
});

describe("Dijkstra — dígrafo académico de 5 nodos", () => {
  const result = dijkstra(clrs, "A", "C", opts);

  it("calcula las distancias conocidas a mano", () => {
    assert.equal(result.distances.A, 0);
    assert.equal(result.distances.D, 5);
    assert.equal(result.distances.E, 7);
    assert.equal(result.distances.B, 8);
    assert.equal(result.distances.C, 9);
  });

  it("elige A → D → B → C y no la trampa A → B → C", () => {
    assert.deepEqual(result.path, ["A", "D", "B", "C"]);
    assert.equal(result.total, 9);
    assert.deepEqual(result.pathEdges, ["A-D", "D-B", "B-C"]);
  });

  it("consolida en orden creciente de distancia", () => {
    assert.deepEqual(result.visitOrder, ["A", "D", "E", "B", "C"]);
  });

  it("registra el descarte de las entradas obsoletas", () => {
    // D→B mejora a B de 10 a 8 cuando B ya estaba encolado con 10, así que
    // queda una entrada obsoleta de B en el montículo (borrado perezoso).
    // Solo se llega a extraerla si el algoritmo corre hasta vaciar la cola:
    // al detenerse en el destino, esas entradas se quedan dentro sin tocar.
    const completo = dijkstra(clrs, "A", null, opts);
    assert.ok(completo.stats.staleEntries >= 1);
    assert.ok(completo.steps.some((step) => step.kind === "skip-stale"));
  });

  it("detenerse en el destino ahorra trabajo", () => {
    const completo = dijkstra(clrs, "A", null, opts);
    // Ambas ejecuciones dan la misma distancia al destino...
    assert.equal(completo.distances.C, result.distances.C);
    // ...pero parar en C evita seguir sacando entradas de la cola.
    assert.ok(result.steps.length < completo.steps.length);
    assert.equal(result.stats.staleEntries, 0);
  });

  it("la última instantánea coincide con el resultado final", () => {
    const last = result.steps.at(-1)!;
    assert.deepEqual(last.distances, result.distances);
  });

  it("el primer paso deja el origen en 0 y el resto en infinito", () => {
    const first = result.steps[0];
    assert.equal(first.kind, "init");
    assert.equal(first.distances.A, 0);
    for (const id of ["B", "C", "D", "E"]) {
      assert.equal(first.distances[id], Infinity);
    }
  });
});

describe("Dijkstra — aristas paralelas y empates", () => {
  const result = dijkstra(parallel, "P", "S", opts);

  it("encuentra el costo 7", () => {
    assert.equal(result.total, 7);
    assert.equal(result.path.length, 3);
  });

  it("resalta la arista paralela barata, no la cara", () => {
    assert.ok(result.pathEdges.includes("P-Q-barata") || result.pathEdges.includes("P-R"));
    assert.ok(!result.pathEdges.includes("P-Q-cara"));
  });

  it("es determinista entre ejecuciones", () => {
    const again = dijkstra(parallel, "P", "S", opts);
    assert.deepEqual(again.path, result.path);
    assert.deepEqual(again.pathEdges, result.pathEdges);
  });

  it("respeta el sentido único: S → P existe, P ← S no aporta ruta inversa", () => {
    const adjacency = buildAdjacency(parallel, "distance");
    assert.ok(adjacency.get("S")!.some((arc) => arc.to === "P"));
    assert.ok(!adjacency.get("Q")!.some((arc) => arc.to === "P"));
  });
});

describe("Dijkstra — casos límite", () => {
  it("destino inalcanzable", () => {
    const result = dijkstra(disconnected, "A", "F", opts);
    assert.equal(result.reachable, false);
    assert.equal(result.total, Infinity);
    assert.deepEqual(result.path, []);
    assert.equal(result.distances.F, Infinity);
    assert.ok(result.steps.some((step) => step.kind === "dead-end"));
  });

  it("origen igual a destino", () => {
    const result = dijkstra(clrs, "A", "A", opts);
    assert.equal(result.total, 0);
    assert.deepEqual(result.path, ["A"]);
    assert.deepEqual(result.pathEdges, []);
  });

  it("ignora los lazos", () => {
    const withLoop: Graph = {
      id: "lazo",
      name: "lazo",
      description: "",
      nodes: [{ id: "X", label: "X", kind: "hub", x: 0, y: 0 }],
      edges: [
        {
          id: "X-X",
          from: "X",
          to: "X",
          directed: true,
          weights: { cost: 5, distance: 5, time: 5 },
        },
      ],
    };
    const result = dijkstra(withLoop, "X", "X", opts);
    assert.equal(result.total, 0);
    assert.equal(buildAdjacency(withLoop, "distance").get("X")!.length, 0);
    assert.ok(
      validateGraph(withLoop, "distance").some((i) => i.code === "SELF_LOOP"),
    );
  });

  it("bloquea los pesos negativos en vez de devolver basura", () => {
    const negative = cloneGraph(clrs);
    negative.edges[0].weights.distance = -3;
    const issues = validateGraph(negative, "distance");
    assert.ok(issues.some((i) => i.code === "NEGATIVE_WEIGHT" && i.severity === "error"));

    const result = dijkstra(negative, "A", "C", opts);
    assert.equal(result.steps.length, 0);
    assert.equal(result.total, Infinity);
  });

  it("acepta peso cero", () => {
    const zero = cloneGraph(clrs);
    zero.edges.find((e) => e.id === "A-B")!.weights.distance = 0;
    const result = dijkstra(zero, "A", "B", opts);
    assert.equal(result.total, 0);
  });

  it("sin destino calcula el árbol de caminos mínimos completo", () => {
    const result = dijkstra(clrs, "A", null, opts);
    assert.equal(result.visitOrder.length, 5);
    assert.equal(result.distances.C, 9);
  });
});

describe("Red de Colombia — la demostración de las tres métricas", () => {
  const byMetric = compareMetrics(colombia, "bog", "ctg");

  it("cada métrica produce una ruta distinta", () => {
    const rutas = new Set([
      byMetric.cost.path.join(">"),
      byMetric.distance.path.join(">"),
      byMetric.time.path.join(">"),
    ]);
    assert.equal(
      rutas.size,
      3,
      `Se esperaban 3 rutas distintas, se obtuvieron ${rutas.size}: ${[...rutas].join(" | ")}`,
    );
  });

  it("la más corta pasa por Medellín y Montería", () => {
    assert.deepEqual(byMetric.distance.path, ["bog", "mde", "mtr", "ctg"]);
    assert.equal(byMetric.distance.total, 990);
  });

  it("la más barata pasa por Bucaramanga y Barranquilla", () => {
    assert.deepEqual(byMetric.cost.path, ["bog", "bga", "baq", "ctg"]);
    assert.equal(byMetric.cost.total, 5_430_000);
  });

  it("la más rápida añade el paso por Tunja", () => {
    assert.deepEqual(byMetric.time.path, ["bog", "tun", "bga", "baq", "ctg"]);
    assert.ok(Math.abs(byMetric.time.total - 21.2) < 1e-9);
  });

  it("cada ruta es la mejor en su métrica y peor en las otras", () => {
    assert.ok(byMetric.cost.totalsByMetric.cost < byMetric.distance.totalsByMetric.cost);
    assert.ok(byMetric.distance.totalsByMetric.distance < byMetric.cost.totalsByMetric.distance);
    assert.ok(byMetric.time.totalsByMetric.time < byMetric.distance.totalsByMetric.time);
  });

  it("todos los nodos son alcanzables entre sí", () => {
    const result = dijkstra(colombia, "bog", null, { metric: "distance" });
    assert.equal(result.visitOrder.length, colombia.nodes.length);
  });

  it("los totales por tramo suman el total reportado", () => {
    const result = dijkstra(colombia, "bog", "ctg", { metric: "cost" });
    const byId = new Map(colombia.edges.map((e) => [e.id, e]));
    const suma = result.pathEdges.reduce(
      (acc, id) => acc + byId.get(id)!.weights.cost,
      0,
    );
    assert.equal(suma, result.total);
    assert.equal(result.totalsByMetric.cost, result.total);
  });
});

/* ------------------------------------------------------------------ *
 * La prueba que realmente demuestra corrección.
 *
 * Las condiciones de optimalidad de camino mínimo caracterizan la solución:
 * si se cumplen ambas, el resultado ES el óptimo. No hace falta confiar en
 * casos escogidos a dedo.
 * ------------------------------------------------------------------ */

function randomGraph(seed: number): Graph {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };

  const n = 4 + Math.floor(rand() * 9);
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: `n${i}`,
    kind: "junction" as const,
    x: rand() * 900,
    y: rand() * 900,
  }));

  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || rand() > 0.32) continue;
      const w = Math.round(rand() * 50);
      edges.push({
        id: `e${i}-${j}`,
        from: `n${i}`,
        to: `n${j}`,
        directed: rand() > 0.4,
        weights: { cost: w, distance: w, time: w },
      });
    }
  }
  return { id: "r", name: "r", description: "", nodes, edges };
}

describe("Condiciones de optimalidad sobre grafos aleatorios", () => {
  it("se cumplen en 200 grafos con pesos no negativos", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const graph = randomGraph(seed);
      const result = dijkstra(graph, graph.nodes[0].id, null, {
        metric: "distance",
        recordSteps: false,
      });
      const { distances, previous, previousEdge } = result;
      const adjacency = buildAdjacency(graph, "distance");
      const byId = new Map(graph.edges.map((e) => [e.id, e]));

      for (const node of graph.nodes) {
        const parent = previous[node.id];
        if (parent === null) continue;
        // 1. La distancia de cada nodo es exactamente la de su predecesor más la arista usada.
        const edge = byId.get(previousEdge[node.id]!)!;
        assert.equal(
          distances[node.id],
          distances[parent] + edge.weights.distance,
          `semilla ${seed}: d(${node.id}) inconsistente con su predecesor`,
        );
      }

      for (const node of graph.nodes) {
        if (!Number.isFinite(distances[node.id])) continue;
        // 2. Ningún arco puede relajarse más: d(v) <= d(u) + w(u,v).
        for (const arc of adjacency.get(node.id) ?? []) {
          assert.ok(
            distances[arc.to] <= distances[node.id] + arc.weight + 1e-9,
            `semilla ${seed}: el arco ${node.id}→${arc.to} todavía se puede relajar`,
          );
        }
      }
    }
  });
});
