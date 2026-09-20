"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";

import { ComplexityNote } from "./complexity-note";
import { DataPanel } from "./data-panel";
import { DistanceTable } from "./distance-table";
import { EditorPanel } from "./editor-panel";
import { GraphCanvas } from "./graph-canvas";
import { Legend } from "./legend";
import { PlannerProvider } from "./planner-context";
import { QueueView } from "./queue-view";
import { RoutePanel } from "./route-panel";
import { StepsPanel } from "./steps-panel";
import { Toolbar } from "./toolbar";

/**
 * En pantallas estrechas el panel inferior y el mapa se disputan la misma
 * altura: con una altura fija, o el mapa queda diminuto o el editor queda
 * recortado. Estos tres estados dejan que gane el que haga falta en cada
 * momento. Desde xl no aplica, porque el panel pasa a la columna derecha.
 */
type AlturaPanel = "contraido" | "normal" | "expandido";

const ALTURA: Record<AlturaPanel, string> = {
  contraido: "h-auto",
  // En lg la barra lateral ya muestra la ruta, así que el panel inferior
  // necesita menos altura y el mapa puede quedarse con más.
  normal: "h-[min(46dvh,340px)] lg:h-[min(36dvh,300px)]",
  expandido: "h-[64dvh]",
};

/**
 * Tres zonas en pantallas anchas: control · mapa · ejecución.
 *
 * La red de Colombia es mucho más alta que ancha, así que el mapa necesita la
 * altura completa de la ventana. Por eso los paneles de ejecución van a un
 * costado y no debajo: abajo le robarían al lienzo justo la dimensión que le
 * hace falta.
 */
export function RoutePlanner() {
  const [altura, setAltura] = useState<AlturaPanel>("normal");
  const SIGUIENTE: Record<AlturaPanel, AlturaPanel> = {
    contraido: "normal",
    normal: "expandido",
    expandido: "contraido",
  };
  const ETIQUETA: Record<AlturaPanel, string> = {
    contraido: "Mostrar el panel",
    normal: "Agrandar el panel",
    expandido: "Ocultar el panel y ver el mapa completo",
  };

  return (
    <PlannerProvider>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <Toolbar />

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] xl:grid-rows-1 lg:grid-cols-[minmax(300px,340px)_1fr] xl:grid-cols-[minmax(300px,340px)_1fr_minmax(340px,400px)]">
          {/* Control */}
          <aside className="row-span-1 hidden min-h-0 flex-col overflow-y-auto border-r lg:flex">
            <Tabs defaultValue="ruta" className="min-h-0 min-w-0 gap-0">
              <TabsList className="m-3 mb-0 grid w-auto grid-cols-3">
                <TabsTrigger value="ruta">Ruta</TabsTrigger>
                <TabsTrigger value="editar">Editar</TabsTrigger>
                <TabsTrigger value="datos">Datos</TabsTrigger>
              </TabsList>

              <TabsContent value="ruta" className="p-3">
                <RoutePanel />
              </TabsContent>
              <TabsContent value="editar" className="p-3">
                <EditorPanel />
              </TabsContent>
              <TabsContent value="datos" className="p-3">
                <DataPanel />
                <div className="mt-3 rounded-lg border">
                  <ComplexityNote />
                </div>
                <div className="mt-3 rounded-lg border">
                  <Legend />
                </div>
              </TabsContent>
            </Tabs>
          </aside>

          {/* Mapa */}
          <main className="area-impresion grid min-h-0 grid-rows-[1fr] overflow-hidden">
            <GraphCanvas />
          </main>

          {/* Ejecución: a la derecha desde xl, y abajo en pantallas menores */}
          <section
            className={cn(
              "no-imprimir grid min-h-0 overflow-hidden border-t lg:col-span-2 xl:col-span-1 xl:h-auto xl:border-t-0 xl:border-l",
              ALTURA[altura],
            )}
          >
            <Tabs
              defaultValue="pasos"
              className={cn(
                "grid min-h-0 min-w-0 gap-0 xl:grid-rows-[auto_auto_1fr]",
                // Contraído, la fila del contenido mide cero y queda recortada:
                // así solo se ven el asa y las pestañas, sin restos asomando.
                altura === "contraido"
                  ? "grid-rows-[auto_auto_0fr]"
                  : "grid-rows-[auto_auto_1fr]",
              )}
            >
              {/* Asa de arrastre, como en cualquier hoja inferior de móvil.
                  Va aparte de las pestañas para no robarles ancho: con los
                  botones dentro de la tira, la última pestaña se salía de la
                  pantalla sin ninguna señal de que hubiera que desplazarla. */}
              <div className="xl:hidden">
                <button
                  type="button"
                  aria-label={ETIQUETA[altura]}
                  onClick={() => setAltura(SIGUIENTE[altura])}
                  className="focus-visible:ring-ring/50 flex w-full cursor-pointer items-center justify-center py-2 outline-none focus-visible:ring-3"
                >
                  <span className="bg-border h-1 w-9 rounded-full" />
                </button>
              </div>

              <div className="min-w-0 overflow-x-auto">
                <TabsList
                  variant="line"
                  className="justify-start gap-1 px-3 pt-0 pb-2 xl:py-2"
                >
                  <TabsTrigger value="pasos">Paso a paso</TabsTrigger>
                  <TabsTrigger value="tabla">Tabla</TabsTrigger>
                  <TabsTrigger value="cola">Cola</TabsTrigger>
                  <TabsTrigger value="ruta" className="lg:hidden">
                    Ruta
                  </TabsTrigger>
                  <TabsTrigger value="editar" className="lg:hidden">
                    Editar
                  </TabsTrigger>
                  <TabsTrigger value="datos" className="lg:hidden">
                    Datos
                  </TabsTrigger>
                  <TabsTrigger value="analisis" className="hidden xl:inline-flex">
                    Análisis
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="pasos" className="min-h-0 min-w-0 overflow-hidden">
                <StepsPanel />
              </TabsContent>
              <TabsContent value="tabla" className="min-h-0 min-w-0 overflow-hidden">
                <DistanceTable />
              </TabsContent>
              <TabsContent value="cola" className="min-h-0 min-w-0 overflow-hidden">
                <QueueView />
              </TabsContent>
              <TabsContent
                value="analisis"
                className="min-h-0 min-w-0 overflow-y-auto divide-y"
              >
                <ComplexityNote />
                <Legend />
              </TabsContent>
              <TabsContent
                value="ruta"
                className="min-h-0 min-w-0 overflow-y-auto p-3 lg:hidden"
              >
                <RoutePanel />
              </TabsContent>
              <TabsContent
                value="editar"
                className="min-h-0 min-w-0 overflow-y-auto p-3 lg:hidden"
              >
                <EditorPanel />
              </TabsContent>
              <TabsContent
                value="datos"
                className="min-h-0 min-w-0 overflow-y-auto p-3 lg:hidden"
              >
                <DataPanel />
                <div className="mt-3 rounded-lg border">
                  <ComplexityNote />
                </div>
                <div className="mt-3 rounded-lg border">
                  <Legend />
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>
    </PlannerProvider>
  );
}
