import Link from "next/link";

export const metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-muted-foreground text-sm tabular-nums">404</p>
        <h1 className="mt-1 text-xl font-semibold">Esta página no existe</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          RutaÓptima es una sola página: el planificador de rutas con Dijkstra.
        </p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground mt-5 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium"
        >
          Volver al planificador
        </Link>
      </div>
    </main>
  );
}
