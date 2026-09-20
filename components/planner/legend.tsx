"use client";

/**
 * Leyenda de estados.
 *
 * Cada entrada reproduce el mismo dibujo que aparece en el lienzo, señal no
 * cromática incluida, para que la equivalencia sea directa y no haya que
 * fiarse solo del color.
 */
const ESTADOS = [
  {
    nombre: "Sin visitar",
    descripcion: "Todavía con distancia infinita",
    marca: <circle r="7" className="fill-card stroke-graph-pending" strokeWidth={2} />,
  },
  {
    nombre: "En la cola",
    descripcion: "Alcanzado, pendiente de consolidar",
    marca: (
      <circle r="7" className="fill-card stroke-graph-frontier" strokeWidth={3.5} />
    ),
  },
  {
    nombre: "Consolidado",
    descripcion: "Su distancia ya es definitiva",
    marca: <circle r="8" className="fill-graph-settled" />,
  },
  {
    nombre: "Procesando",
    descripcion: "Recién extraído del montículo",
    marca: <circle r="8" className="fill-graph-current" />,
  },
  {
    nombre: "Origen",
    descripcion: "Anillo doble",
    marca: (
      <>
        <circle r="8.5" className="fill-none stroke-graph-source" strokeWidth={2} />
        <circle r="4.5" className="fill-graph-source" />
      </>
    ),
  },
  {
    nombre: "Destino",
    descripcion: "Anillo punteado",
    marca: (
      <circle
        r="8"
        className="fill-none stroke-graph-target"
        strokeWidth={2.5}
        strokeDasharray="4 3"
      />
    ),
  },
  {
    nombre: "Ruta mínima",
    descripcion: "El trazo más grueso del lienzo",
    marca: (
      <line
        x1="-9"
        y1="0"
        x2="9"
        y2="0"
        className="stroke-graph-path"
        strokeWidth={5}
        strokeLinecap="round"
      />
    ),
  },
  {
    nombre: "Relajación sin mejora",
    descripcion: "Trazo discontinuo",
    marca: (
      <line
        x1="-9"
        y1="0"
        x2="9"
        y2="0"
        className="stroke-graph-rejected"
        strokeWidth={2.5}
        strokeDasharray="4 3"
      />
    ),
  },
];

export function Legend() {
  return (
    <section className="grid gap-2 px-3 py-3" aria-labelledby="leyenda">
      <h3 id="leyenda" className="text-sm font-medium">
        Leyenda
      </h3>
      <ul className="grid gap-1.5">
        {ESTADOS.map((estado) => (
          <li key={estado.nombre} className="flex items-center gap-2.5">
            <svg
              viewBox="-11 -11 22 22"
              className="size-5 shrink-0"
              aria-hidden="true"
            >
              {estado.marca}
            </svg>
            <span className="text-sm">{estado.nombre}</span>
            <span className="text-muted-foreground ml-auto text-right text-xs text-balance">
              {estado.descripcion}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
