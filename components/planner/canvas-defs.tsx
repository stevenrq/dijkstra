"use client";

/**
 * Definiciones reutilizables del lienzo.
 *
 * Cada estado de arista tiene su propia punta de flecha porque los `marker`
 * no heredan `currentColor` de forma fiable entre navegadores: el color hay
 * que fijarlo dentro del propio marcador.
 */

const PUNTAS: { id: string; className: string }[] = [
  { id: "punta-normal", className: "fill-graph-edge" },
  { id: "punta-arbol", className: "fill-graph-tree" },
  { id: "punta-activa", className: "fill-graph-current" },
  { id: "punta-mejora", className: "fill-graph-improved" },
  { id: "punta-descarte", className: "fill-graph-rejected" },
  { id: "punta-ruta", className: "fill-graph-path" },
];

export function CanvasDefs() {
  return (
    <defs>
      {PUNTAS.map((punta) => (
        <marker
          key={punta.id}
          id={punta.id}
          viewBox="0 0 12 12"
          refX={11}
          refY={6}
          markerWidth={12}
          markerHeight={12}
          /* userSpaceOnUse (y no el valor por defecto strokeWidth) evita que la
             flecha crezca al engrosar el trazo de la arista destacada. */
          markerUnits="userSpaceOnUse"
          /* auto-start-reverse permite reutilizar el mismo marcador en el
             extremo inicial de una arista de doble sentido. */
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 11 6 L 0 11 z" className={punta.className} />
        </marker>
      ))}

      <pattern
        id="rejilla"
        width={60}
        height={60}
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 60 0 L 0 0 0 60"
          fill="none"
          className="stroke-graph-grid"
          strokeWidth={1}
        />
      </pattern>
    </defs>
  );
}
