import { METRICS, type Graph, type GraphEdge, type GraphNode } from "./types";

/**
 * Exportación e importación del grafo en JSON.
 *
 * El JSON que se importa puede venir de cualquier parte, así que se valida
 * campo por campo en vez de confiar en un `as Graph`.
 */

export const GRAPH_FILE_VERSION = 1;

/**
 * Límites de lo que se acepta. La traza paso a paso guarda una instantánea de
 * todas las distancias en cada paso, así que su memoria crece con V · A: con
 * 200 puntos y 1000 corredores una ejecución tarda medio segundo; con 1000 y
 * 5000, medio minuto y más de un gigabyte. Esta es una aplicación didáctica.
 */
export const MAX_NODES = 200;
export const MAX_EDGES = 1000;
const MAX_COORDINATE = 1_000_000;
const MAX_WEIGHT = 1_000_000_000_000;

/**
 * Nombres que no pueden ser identificadores: el algoritmo guarda las
 * distancias en registros indexados por id, y `__proto__` como clave rompe
 * cualquier objeto normal de JavaScript.
 */
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);

const NODE_KINDS: readonly GraphNode["kind"][] = [
  "hub",
  "warehouse",
  "delivery",
  "port",
  "junction",
];

interface GraphFile {
  version: number;
  graph: Graph;
}

export function serializeGraph(graph: Graph): string {
  const payload: GraphFile = { version: GRAPH_FILE_VERSION, graph };
  return JSON.stringify(payload, null, 2);
}

export class GraphParseError extends Error {}

function expectId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GraphParseError(`Falta el identificador "${field}".`);
  }
  if (value.trim() !== value) {
    throw new GraphParseError(
      `El identificador "${field}" tiene espacios al principio o al final.`,
    );
  }
  if (RESERVED_IDS.has(value)) {
    throw new GraphParseError(
      `"${value}" no se puede usar como identificador (${field}).`,
    );
  }
  return value;
}

function expectLabel(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GraphParseError(`Falta el campo de texto "${field}".`);
  }
  return value;
}

function expectFiniteNumber(value: unknown, field: string, limit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GraphParseError(`El campo "${field}" debe ser un número finito.`);
  }
  if (Math.abs(value) > limit) {
    throw new GraphParseError(`El campo "${field}" está fuera de rango.`);
  }
  // −0 y 0 son el mismo valor; así la ida y vuelta es exacta.
  return value === 0 ? 0 : value;
}

function parseNode(raw: unknown, index: number): GraphNode {
  if (typeof raw !== "object" || raw === null) {
    throw new GraphParseError(`El nodo #${index + 1} no es un objeto.`);
  }
  const node = raw as Record<string, unknown>;

  let kind: GraphNode["kind"] = "junction";
  if (node.kind !== undefined) {
    if (!NODE_KINDS.includes(node.kind as GraphNode["kind"])) {
      throw new GraphParseError(
        `El nodo #${index + 1} tiene un tipo desconocido ("${String(node.kind)}").`,
      );
    }
    kind = node.kind as GraphNode["kind"];
  }

  return {
    id: expectId(node.id, `nodes[${index}].id`),
    label: expectLabel(node.label, `nodes[${index}].label`),
    kind,
    x: expectFiniteNumber(node.x, `nodes[${index}].x`, MAX_COORDINATE),
    y: expectFiniteNumber(node.y, `nodes[${index}].y`, MAX_COORDINATE),
    ...(typeof node.notes === "string" ? { notes: node.notes } : {}),
  };
}

function parseEdge(raw: unknown, index: number, nodeIds: Set<string>): GraphEdge {
  if (typeof raw !== "object" || raw === null) {
    throw new GraphParseError(`La arista #${index + 1} no es un objeto.`);
  }
  const edge = raw as Record<string, unknown>;
  const id = expectId(edge.id, `edges[${index}].id`);
  const from = expectId(edge.from, `edges[${index}].from`);
  const to = expectId(edge.to, `edges[${index}].to`);

  if (!nodeIds.has(from) || !nodeIds.has(to)) {
    throw new GraphParseError(
      `La arista #${index + 1} conecta nodos que no existen en el archivo.`,
    );
  }

  if (edge.directed !== undefined && typeof edge.directed !== "boolean") {
    throw new GraphParseError(
      `En la arista #${index + 1}, "directed" debe ser true o false.`,
    );
  }

  const rawWeights = edge.weights;
  if (typeof rawWeights !== "object" || rawWeights === null) {
    throw new GraphParseError(`La arista #${index + 1} no tiene pesos.`);
  }
  const weightsRecord = rawWeights as Record<string, unknown>;
  const weights = { cost: 0, distance: 0, time: 0 };
  for (const metric of METRICS) {
    // Los pesos negativos se aceptan: el editor permite escribirlos a
    // propósito (para ver cómo se bloquea Dijkstra), así que un archivo
    // exportado con uno tiene que poder volver a cargarse. Es la validación
    // de la ejecución la que los detiene, con su explicación.
    weights[metric] = expectFiniteNumber(
      weightsRecord[metric],
      `edges[${index}].weights.${metric}`,
      MAX_WEIGHT,
    );
  }

  return {
    id,
    from,
    to,
    directed: edge.directed === true,
    weights,
    ...(typeof edge.label === "string" && edge.label !== ""
      ? { label: edge.label }
      : {}),
  };
}

/** Valida un grafo ya leído de JSON: un archivo importado o el estado guardado. */
export function parseGraphObject(raw: unknown): Graph {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GraphParseError("No se encontró el grafo dentro del archivo.");
  }
  const rawGraph = raw as Record<string, unknown>;

  if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
    throw new GraphParseError(
      'El grafo debe tener los arreglos "nodes" y "edges".',
    );
  }
  if (rawGraph.nodes.length > MAX_NODES) {
    throw new GraphParseError(
      `El grafo tiene ${rawGraph.nodes.length} puntos; el máximo es ${MAX_NODES}.`,
    );
  }
  if (rawGraph.edges.length > MAX_EDGES) {
    throw new GraphParseError(
      `El grafo tiene ${rawGraph.edges.length} corredores; el máximo es ${MAX_EDGES}.`,
    );
  }

  const nodes = rawGraph.nodes.map(parseNode);
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) {
    throw new GraphParseError("Hay identificadores de nodo repetidos.");
  }

  const edges = rawGraph.edges.map((edge, index) => parseEdge(edge, index, ids));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) {
    throw new GraphParseError("Hay identificadores de arista repetidos.");
  }

  return {
    id: typeof rawGraph.id === "string" ? rawGraph.id : "importado",
    name: typeof rawGraph.name === "string" ? rawGraph.name : "Grafo importado",
    description:
      typeof rawGraph.description === "string" ? rawGraph.description : "",
    nodes,
    edges,
  };
}

export function parseGraph(text: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GraphParseError("El archivo no contiene JSON válido.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GraphParseError("El archivo no contiene un objeto JSON.");
  }

  // Se acepta tanto el envoltorio { version, graph } como un grafo suelto.
  const container = parsed as Record<string, unknown>;
  if ("graph" in container) {
    if (
      container.version !== undefined &&
      container.version !== GRAPH_FILE_VERSION
    ) {
      throw new GraphParseError(
        `El archivo es de la versión ${String(container.version)}; esta aplicación lee la versión ${GRAPH_FILE_VERSION}.`,
      );
    }
    return parseGraphObject(container.graph);
  }
  return parseGraphObject(container);
}

/** Descarga el grafo como archivo .json desde el navegador. */
export function downloadGraph(graph: Graph, filename?: string): void {
  const blob = new Blob([serializeGraph(graph)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `${graph.id || "grafo"}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revocar en el acto puede cancelar la descarga en Firefox y Safari, que la
  // inician de forma asíncrona. Se libera después, con margen de sobra.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
