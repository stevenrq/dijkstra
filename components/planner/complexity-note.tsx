"use client";

import { formatNumber } from "@/lib/graph/format";
import { usePlanner } from "./planner-context";

/**
 * Contraste entre la cota teórica y las operaciones que de verdad ocurrieron.
 *
 * Es la forma más directa de *ver* la complejidad: los números de la izquierda
 * salen de contar dentro del algoritmo, no de una estimación.
 */
export function ComplexityNote() {
  const { graph, result, runState } = usePlanner();

  const V = graph.nodes.length;
  const A = graph.edges.length;
  const cota = V > 0 ? (V + A) * Math.log2(Math.max(2, V)) : 0;

  return (
    <section className="grid gap-3 px-3 py-3" aria-labelledby="complejidad">
      <div>
        <h3 id="complejidad" className="text-sm font-medium">
          Complejidad
        </h3>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">
          Con un montículo binario como cola de prioridad, Dijkstra corre en{" "}
          <span className="font-mono text-xs">O((V + A) · log V)</span>. Buscar
          el mínimo recorriendo un arreglo lo dejaría en{" "}
          <span className="font-mono text-xs">O(V²)</span>.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Dato termino="Puntos (V)" valor={formatNumber(V)} />
        <Dato termino="Corredores (A)" valor={formatNumber(A)} />
        <Dato
          termino="(V + A) · log₂V"
          valor={`≈ ${formatNumber(Math.round(cota))}`}
        />
        <Dato
          termino="Operaciones reales"
          valor={
            result && runState === "ready"
              ? formatNumber(
                  result.stats.settledNodes + result.stats.relaxedArcs,
                )
              : "—"
          }
        />
      </dl>

      {result && runState === "ready" && (
        <dl className="border-t pt-3 text-sm">
          <Dato
            termino="Puntos consolidados"
            valor={formatNumber(result.stats.settledNodes)}
          />
          <Dato
            termino="Aristas relajadas"
            valor={formatNumber(result.stats.relaxedArcs)}
          />
          <Dato
            termino="Relajaciones con mejora"
            valor={formatNumber(result.stats.improvements)}
          />
          <Dato
            termino="Entradas encoladas"
            valor={formatNumber(result.stats.enqueued)}
          />
          <Dato
            termino="Entradas obsoletas descartadas"
            valor={formatNumber(result.stats.staleEntries)}
          />
        </dl>
      )}
    </section>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="text-muted-foreground">{termino}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
