"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STORAGE_KEY = "rutaoptima-tema";
const EVENTO = "rutaoptima:tema";

/**
 * El tema vive en una clase del <html> que el script en línea de
 * `app/layout.tsx` aplica antes de pintar, así que la fuente de verdad es el
 * DOM, no el estado de React.
 *
 * Por eso se lee con `useSyncExternalStore` en vez de copiarlo a estado desde
 * un efecto: el servidor devuelve siempre "claro" y el cliente lee el valor
 * real, sin desajuste de hidratación y sin un render extra.
 */
function suscribir(alCambiar: () => void) {
  window.addEventListener(EVENTO, alCambiar);
  return () => window.removeEventListener(EVENTO, alCambiar);
}

const leerCliente = () => document.documentElement.classList.contains("dark");
const leerServidor = () => false;

export function ThemeToggle() {
  const oscuro = useSyncExternalStore(suscribir, leerCliente, leerServidor);

  // En desarrollo, el remontaje de StrictMode deja el <html> solo con los
  // atributos del JSX y borra la clase que puso el script en línea (lo
  // explica la guía de Next "preventing-flash-before-hydration"). Lo mismo
  // pasa si React tiene que volver a renderizar la raíz. Se vuelve a aplicar
  // antes de pintar; en producción normalmente no cambia nada.
  useLayoutEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Almacenamiento bloqueado: manda la preferencia del sistema.
    }
    const debeSerOscuro =
      guardado === "dark" ||
      (guardado === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (document.documentElement.classList.contains("dark") !== debeSerOscuro) {
      document.documentElement.classList.toggle("dark", debeSerOscuro);
      window.dispatchEvent(new Event(EVENTO));
    }
  }, []);

  const alternar = useCallback(() => {
    const siguiente = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", siguiente);
    try {
      window.localStorage.setItem(STORAGE_KEY, siguiente ? "dark" : "light");
    } catch {
      // Almacenamiento bloqueado: el tema se aplica igual en esta sesión.
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            onClick={alternar}
          >
            {oscuro ? <Sun /> : <Moon />}
          </Button>
        }
      />
      <TooltipContent>{oscuro ? "Tema claro" : "Tema oscuro"}</TooltipContent>
    </Tooltip>
  );
}
