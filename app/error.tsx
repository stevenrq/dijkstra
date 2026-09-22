"use client"; // Los límites de error tienen que ser componentes de cliente.

import { useEffect } from "react";

/**
 * Salida de emergencia. Si algo rompe la página (típicamente un dato guardado
 * en este navegador que ya no es válido), aquí se puede borrar ese dato y
 * volver a intentar, en vez de quedar atrapado en una pantalla en blanco que
 * se repite en cada recarga.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const restablecer = () => {
    try {
      window.localStorage.removeItem("rutaoptima-estado");
    } catch {
      // Almacenamiento bloqueado: no había nada guardado que borrar.
    }
    retry();
  };

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          La aplicación encontró un error inesperado. Si se repite, restablecer
          los datos guardados en este navegador vuelve al escenario de Colombia.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="h-9 rounded-lg border px-4 text-sm font-medium"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={restablecer}
            className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium"
          >
            Restablecer datos y reintentar
          </button>
        </div>
      </div>
    </main>
  );
}
