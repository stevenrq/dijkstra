import { RoutePlanner } from "@/components/planner/route-planner";

/**
 * Server Component: solo monta la isla interactiva.
 *
 * Toda la aplicación es una herramienta de una sola pantalla, así que no hay
 * contenido de servidor que transmitir por encima del lienzo. El enunciado y
 * el análisis del algoritmo viven en /acerca, que sí es texto estático y no
 * envía JavaScript.
 */
export default function Page() {
  return <RoutePlanner />;
}
